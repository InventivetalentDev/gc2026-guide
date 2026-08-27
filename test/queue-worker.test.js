import { env } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import exhibitors from "../data/exhibitors.json";
import event from "../data/event.json";
import worker, {
  getUncachedLive,
  handleLive,
  handleReport,
  loadSiteData,
  resolveRequestNow,
  runCleanup,
} from "../worker/index.js";
import { handleAdminAction, handleAdminData, isAdminAuthorized } from "../worker/admin.js";
import { buildQueueAllowlist, eventAccess, queueToken } from "../worker/core.js";

const CLIENT = "123e4567-e89b-42d3-a456-426614174000";
const queue = [...buildQueueAllowlist(exhibitors).values()][0];
const site = { event, queues: buildQueueAllowlist(exhibitors) };
const at = (value) => Math.floor(new Date(value).getTime() / 1000);

function testEnv(extra = {}) {
  return {
    ...env,
    IP_WRITE_LIMITER: { async limit() { return { success: true }; } },
    ADMIN_AUTH_LIMITER: { async limit() { return { success: true }; } },
    ...extra,
  };
}

/* `env` here carries whatever is in .dev.vars, which the documented local
   setup tells you to create — and that file sets the development clock
   override. Every test that goes in through `worker.fetch` rather than calling
   a handler with an explicit `now` must therefore say which clock it wants,
   or it passes on CI (no .dev.vars) and fails on the machine of anyone who
   followed the runbook. These tests are about routing, not the calendar, so
   they take the real one. */
function realClockEnv(extra = {}) {
  return testEnv({
    QUEUE_TEST_CLOCK_ENABLED: undefined,
    QUEUE_TEST_NOW: undefined,
    ...extra,
  });
}

function report(body, client = CLIENT) {
  return new Request("https://hallgui.test/api/queue/report", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-GC-Queue-Client": client },
    body: JSON.stringify({ ...queue, ...body }),
  });
}

describe("report lifecycle", () => {
  it("allows the first ahead update immediately, then enforces 120 seconds", async () => {
    const now = at("2026-08-27T10:00:00+02:00");
    const joined = await handleReport(report({ kind: "joined", claimed: 10 }), testEnv(), site, now);
    expect(joined.status).toBe(201);
    await expect(joined.json()).resolves.toEqual({ ok: true, serverAt: now, joinedAt: now - 600 });

    const first = await handleReport(report({ kind: "update", ahead: 50 }), testEnv(), site, now + 1);
    expect(first.status).toBe(200);
    const initial = await env.QUEUE_DB.prepare(
      `SELECT u.ahead, u.initial FROM updates u JOIN sessions s ON s.id = u.session
       WHERE s.client = ?`
    ).bind(CLIENT).first();
    expect(initial).toMatchObject({ ahead: 50, initial: 1 });

    await expect(
      handleReport(report({ kind: "update", ahead: 30 }), testEnv(), site, now + 119)
    ).rejects.toMatchObject({ status: 409, code: "update_too_soon" });
    const second = await handleReport(report({ kind: "update", ahead: 30 }), testEnv(), site, now + 121);
    expect(second.status).toBe(200);
    const updates = await env.QUEUE_DB.prepare(
      `SELECT initial FROM updates ORDER BY reported_at`
    ).all();
    expect(updates.results.map(({ initial: value }) => value)).toEqual([1, 0]);
  });

  it("accepts only one of two concurrent updates from separate tabs", async () => {
    const now = at("2026-08-27T11:00:00+02:00");
    await handleReport(report({ kind: "joined" }), testEnv(), site, now);
    const results = await Promise.allSettled([
      handleReport(report({ kind: "update", ahead: 50 }), testEnv(), site, now + 1),
      handleReport(report({ kind: "update", ahead: 30 }), testEnv(), site, now + 1),
    ]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);
    expect(await env.QUEUE_DB.prepare(`SELECT COUNT(*) AS n FROM updates`).first("n")).toBe(1);
    expect(
      await env.QUEUE_DB.prepare(
        `SELECT COUNT(*) AS n FROM report_events WHERE client = ? AND kind = 'update'`
      ).bind(CLIENT).first("n")
    ).toBe(1);
  });

  it("closes any other open session when a device joins a second queue", async () => {
    const now = at("2026-08-28T10:00:00+02:00");
    const client = "823e4567-e89b-42d3-a456-426614174000";
    const all = [...buildQueueAllowlist(exhibitors).values()];
    const first = all[0];
    const second = all.find((q) => queueToken(q.exhibitor, q.game) !== queueToken(first.exhibitor, first.game));
    const join = (q, when) =>
      handleReport(
        new Request("https://hallgui.test/api/queue/report", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-GC-Queue-Client": client },
          body: JSON.stringify({ ...q, kind: "joined" }),
        }),
        testEnv(),
        site,
        when
      );

    await join(first, now);
    await join(second, now + 60);
    /* Re-joining the queue you are already in is a correction, not a move, so
       it reads as abandoned rather than as walking away. */
    await join(second, now + 120);

    const rows = await env.QUEUE_DB.prepare(
      `SELECT exhibitor, game, outcome FROM sessions WHERE client = ? ORDER BY id`
    ).bind(client).all();
    expect(rows.results).toEqual([
      { exhibitor: first.exhibitor, game: first.game, outcome: "left" },
      { exhibitor: second.exhibitor, game: second.game, outcome: "abandoned" },
      { exhibitor: second.exhibitor, game: second.game, outcome: null },
    ]);
    expect(
      await env.QUEUE_DB.prepare(
        `SELECT COUNT(*) AS n FROM sessions WHERE client = ? AND outcome IS NULL`
      ).bind(client).first("n")
    ).toBe(1);
    /* Walking off records an event; a same-queue correction does not. */
    expect(
      await env.QUEUE_DB.prepare(
        `SELECT COUNT(*) AS n FROM report_events WHERE client = ? AND kind = 'left'`
      ).bind(client).first("n")
    ).toBe(1);
  });

  it("requires an RFC 4122 version-4 client id", async () => {
    await expect(
      handleReport(report({ kind: "joined" }, "123e4567-e89b-12d3-a456-426614174000"), testEnv(), site,
        at("2026-08-27T10:00:00+02:00"))
    ).rejects.toMatchObject({ status: 400, code: "invalid_client" });
  });

  it("rate-limits before parsing a malformed body", async () => {
    let calls = 0;
    const limited = testEnv({
      IP_WRITE_LIMITER: {
        async limit() {
          calls += 1;
          return { success: false };
        },
      },
    });
    const malformed = new Request("https://hallgui.test/api/queue/report", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "not json",
    });
    await expect(handleReport(malformed, limited, site)).rejects.toMatchObject({
      status: 429,
      code: "rate_limited",
    });
    expect(calls).toBe(1);
  });

  it("rejects an oversized streamed report body without trusting Content-Length", async () => {
    const oversized = new Request("https://hallgui.test/api/queue/report", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-GC-Queue-Client": CLIENT },
      body: `{"padding":"${"x".repeat(5000)}"}`,
    });
    expect(oversized.headers.has("Content-Length")).toBe(false);
    await expect(
      handleReport(oversized, testEnv(), site, at("2026-08-27T10:00:00+02:00"))
    ).rejects.toMatchObject({ status: 413, code: "body_too_large" });
  });

  it("replays a valid anchored completion after close and after cron abandonment", async () => {
    const joinedAt = at("2026-08-27T14:00:00+02:00");
    await handleReport(report({ kind: "joined" }), testEnv(), site, joinedAt);
    await runCleanup(testEnv(), joinedAt + 4 * 60 * 60 + 1);

    const receipt = at("2026-08-27T21:00:00+02:00");
    const response = await handleReport(
      report({ kind: "entered", deferred: true, joinedAt, elapsed: 60 * 60 }),
      testEnv(),
      site,
      receipt
    );
    expect(response.status).toBe(200);
    const session = await env.QUEUE_DB.prepare(
      `SELECT outcome, closed_at, deferred FROM sessions WHERE client = ? ORDER BY id DESC LIMIT 1`
    ).bind(CLIENT).first();
    expect(session).toMatchObject({ outcome: "entered", closed_at: joinedAt + 3600, deferred: 1 });
    expect(
      await env.QUEUE_DB.prepare(
        `SELECT at FROM report_events WHERE client = ? AND kind = 'entered'`
      ).bind(CLIENT).first("at")
    ).toBe(joinedAt + 3600);
  });

  it("matches a deferred completion to its original anchor, not a replacement session", async () => {
    const joinedAt = at("2026-08-27T10:00:00+02:00");
    await handleReport(report({ kind: "joined" }), testEnv(), site, joinedAt);
    await handleReport(report({ kind: "joined" }), testEnv(), site, joinedAt + 10 * 60);

    const response = await handleReport(
      report({ kind: "entered", deferred: true, joinedAt, elapsed: 5 * 60 }),
      testEnv(),
      site,
      joinedAt + 20 * 60
    );
    expect(response.status).toBe(200);
    const sessions = await env.QUEUE_DB.prepare(
      `SELECT joined_at, outcome, deferred FROM sessions WHERE client = ? ORDER BY id`
    ).bind(CLIENT).all();
    expect(sessions.results).toEqual([
      { joined_at: joinedAt, outcome: "entered", deferred: 1 },
      { joined_at: joinedAt + 10 * 60, outcome: null, deferred: 0 },
    ]);
  });

  it("requires the server-issued join anchor for deferred completion", async () => {
    const joinedAt = at("2026-08-27T10:00:00+02:00");
    await handleReport(report({ kind: "joined" }), testEnv(), site, joinedAt);
    await expect(
      handleReport(
        report({ kind: "entered", deferred: true, elapsed: 5 * 60 }),
        testEnv(), site, joinedAt + 10 * 60
      )
    ).rejects.toMatchObject({ status: 400, code: "invalid_joined_at" });
  });

  it("acknowledges a deferred retry when an ordinary entered response was lost", async () => {
    const joinedAt = at("2026-08-27T10:00:00+02:00");
    await handleReport(report({ kind: "joined" }), testEnv(), site, joinedAt);
    await handleReport(report({ kind: "entered" }), testEnv(), site, joinedAt + 10 * 60);

    const retry = await handleReport(
      report({ kind: "entered", deferred: true, joinedAt, elapsed: 10 * 60 + 10 }),
      testEnv(), site, joinedAt + 11 * 60
    );
    await expect(retry.json()).resolves.toMatchObject({
      ok: true,
      closedAt: joinedAt + 10 * 60,
      deferred: false,
      replayed: true,
    });
    expect(
      await env.QUEUE_DB.prepare(
        `SELECT COUNT(*) AS n FROM report_events WHERE client = ? AND kind = 'entered'`
      ).bind(CLIENT).first("n")
    ).toBe(1);
  });

  it("preserves a valid wait longer than four hours when updates kept the session alive", async () => {
    const openedAt = at("2026-08-29T09:00:00+02:00");
    const joinedAt = openedAt - 2 * 60 * 60;
    await handleReport(report({ kind: "joined", claimed: 120 }), testEnv(), site, openedAt);
    await handleReport(report({ kind: "update", ahead: 100 }), testEnv(), site, openedAt + 60);
    await handleReport(report({ kind: "update", ahead: 50 }), testEnv(), site, openedAt + 5 * 60 * 60);

    const response = await handleReport(
      report({ kind: "entered", deferred: true, joinedAt, elapsed: 8 * 60 * 60 }),
      testEnv(), site, openedAt + 8 * 60 * 60 + 60
    );
    expect(response.status).toBe(200);
    expect(
      await env.QUEUE_DB.prepare(`SELECT closed_at FROM sessions WHERE client = ?`).bind(CLIENT).first("closed_at")
    ).toBe(joinedAt + 8 * 60 * 60);
  });

  it("rejects deferred outcomes in the future, before an update, or outside event hours", async () => {
    const joinedAt = at("2026-08-27T10:00:00+02:00");
    await handleReport(report({ kind: "joined" }), testEnv(), site, joinedAt);
    await handleReport(report({ kind: "update", ahead: 20 }), testEnv(), site, joinedAt + 60);

    await expect(
      handleReport(
        report({ kind: "entered", deferred: true, joinedAt, elapsed: 30 }),
        testEnv(), site, joinedAt + 120
      )
    ).rejects.toMatchObject({ code: "deferred_before_last_update" });
    await expect(
      handleReport(
        report({ kind: "entered", deferred: true, joinedAt, elapsed: 300 }),
        testEnv(), site, joinedAt + 200
      )
    ).rejects.toMatchObject({ code: "deferred_in_future" });

    await env.QUEUE_DB.prepare(`DELETE FROM sessions`).run();
    const lateJoin = at("2026-08-27T19:30:00+02:00");
    await handleReport(report({ kind: "joined" }), testEnv(), site, lateJoin);
    await expect(
      handleReport(
        report({ kind: "entered", deferred: true, joinedAt: lateJoin, elapsed: 2 * 60 * 60 }),
        testEnv(), site, lateJoin + 3 * 60 * 60
      )
    ).rejects.toMatchObject({ code: "deferred_outside_show_hours" });
  });

  it("records only the outcome transition that wins a cross-tab race", async () => {
    const now = at("2026-08-27T16:00:00+02:00");
    await handleReport(report({ kind: "joined" }), testEnv(), site, now);
    const results = await Promise.allSettled([
      handleReport(report({ kind: "entered" }), testEnv(), site, now + 60),
      handleReport(report({ kind: "left" }), testEnv(), site, now + 60),
    ]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);
    expect(
      await env.QUEUE_DB.prepare(
        `SELECT COUNT(*) AS n FROM report_events WHERE client = ? AND kind IN ('entered', 'left')`
      ).bind(CLIENT).first("n")
    ).toBe(1);
  });

  /* One vote per device and queue a day — and the client mirrors that window
     rather than discovering it. It withdraws the chips once its own vote is in,
     and when it has no memory of voting (cleared storage, a second tab) it
     takes the countdown in the refusal as the record. So both the code and the
     seconds left in it are contract, not an implementation detail. */
  it("takes one mechanics vote per device and queue a day, and says how long that stands", async () => {
    const now = at("2026-08-27T10:00:00+02:00");
    const first = await handleReport(
      report({ kind: "meta", qtype: "group", batch: 10 }), testEnv(), site, now
    );
    expect(first.status).toBe(200);

    await expect(
      handleReport(report({ kind: "meta", qtype: "wave", batch: 50 }), testEnv(), site, now + 3600)
    ).rejects.toMatchObject({
      status: 409,
      code: "meta_already_reported",
      extra: { retryAfter: 23 * 60 * 60 },
    });

    /* A refused vote changes nothing: the first one still stands. */
    expect(
      await env.QUEUE_DB.prepare(`SELECT qtype, batch FROM queue_meta`).first()
    ).toMatchObject({ qtype: "group", batch: 10 });

    /* Another device votes for itself, and this one again a day later. */
    const other = await handleReport(
      report({ kind: "meta", qtype: "wave", batch: 50 }, "223e4567-e89b-42d3-a456-426614174000"),
      testEnv(), site, now + 3600
    );
    expect(other.status).toBe(200);
    const nextDay = await handleReport(
      report({ kind: "meta", qtype: "single" }), testEnv(), site, now + 24 * 60 * 60
    );
    expect(nextDay.status).toBe(200);
    expect(
      await env.QUEUE_DB.prepare(`SELECT qtype, batch FROM queue_meta WHERE client = ?`).bind(CLIENT).first()
    ).toMatchObject({ qtype: "single", batch: null });
  });
});

describe("retention and routing", () => {
  it("honors QUEUE_TEST_NOW only with the separate local-development opt-in", () => {
    const realNow = 123;
    const configured = at("2026-08-26T13:30:00+02:00");
    const clockEnv = {
      QUEUE_TEST_CLOCK_ENABLED: "local-development-only",
      QUEUE_TEST_NOW: "2026-08-26T11:30:00Z",
    };
    expect(resolveRequestNow(new Request("http://localhost:8787/api"), clockEnv, realNow)).toBe(configured);
    expect(resolveRequestNow(new Request("http://127.0.0.1:8787/api"), clockEnv, realNow)).toBe(configured);
    expect(resolveRequestNow(new Request("http://[::1]:8787/api"), clockEnv, realNow)).toBe(configured);
    expect(resolveRequestNow(new Request("http://localhost:8787/api"), clockEnv, realNow + 120)).toBe(configured + 120);
    expect(
      resolveRequestNow(
        new Request("https://hallgui.test/api"),
        { QUEUE_TEST_NOW: "2026-08-26T11:30:00Z" },
        realNow
      )
    ).toBe(realNow);
    expect(
      resolveRequestNow(
        new Request("http://localhost:8787/api"),
        { QUEUE_TEST_NOW: "not-an-iso-instant" },
        realNow
      )
    ).toBe(realNow);
  });

  it("rejects live reads outside hours and only returns 410 after the final window", async () => {
    const ctx = createExecutionContext();
    const request = new Request("https://hallgui.test/api/queue/live");
    await expect(
      handleLive(request, testEnv(), ctx, event, at("2026-08-26T08:29:59+02:00"))
    ).rejects.toMatchObject({ status: 403, code: "outside_show_hours" });
    await expect(
      handleLive(request, testEnv(), ctx, event, at("2026-08-27T23:00:00+02:00"))
    ).rejects.toMatchObject({ status: 403, code: "outside_show_hours" });
    await expect(
      handleLive(request, testEnv(), ctx, event, at("2026-08-30T20:30:01+02:00"))
    ).rejects.toMatchObject({ status: 410, code: "event_ended" });
    await waitOnExecutionContext(ctx);
  });

  it("holds the calendar open on the proving ground, and only for the exact sentinel", async () => {
    const ctx = createExecutionContext();
    const request = new Request("https://hallgui.test/api/queue/live");
    const staging = testEnv({ QUEUE_STAGING: "proving-ground" });
    const wellBefore = at("2026-08-20T04:00:00+02:00");
    const afterTheShow = at("2026-08-30T20:30:01+02:00");

    /* Both the out-of-hours 403 and the post-show 410 lift, or staging is
       untestable before Aug 26 and dead after Aug 30. */
    for (const when of [wellBefore, at("2026-08-26T08:29:59+02:00"), afterTheShow]) {
      const response = await handleLive(request, staging, ctx, event, when);
      expect(response.status).toBe(200);
      /* Answering with data outside show hours is otherwise indistinguishable
         from the gate being broken, so the response says why. */
      expect(response.headers.get("X-GC-Queue-Forced-Open")).toBe("1");
    }

    /* Reporting too — a read-only staging proves nothing about the loop. */
    const wrote = await handleReport(report({ kind: "joined", claimed: 10 }), staging, site, wellBefore);
    expect(wrote.status).toBe(201);

    /* Anything other than the sentinel is not a yes. A stray "0"/"false"/"1"
       from a copied config must not read as one. */
    for (const value of [undefined, "", "0", "false", "1", "true", "staging", "PROVING-GROUND"]) {
      await expect(
        handleLive(request, testEnv({ QUEUE_STAGING: value }), ctx, event, wellBefore)
      ).rejects.toMatchObject({ status: 403, code: "outside_show_hours" });
    }
    await waitOnExecutionContext(ctx);
  });

  it("lets only workers.dev previews call the queue endpoints cross-origin", async () => {
    const staging = testEnv({ QUEUE_STAGING: "proving-ground" });
    const preview = "https://pr-77-gc2026-guide.example.workers.dev";
    const live = (origin, env, method = "GET") =>
      worker.fetch(
        new Request("https://api.test/api/queue/live", { method, headers: origin ? { Origin: origin } : {} }),
        env,
        createExecutionContext()
      );

    /* The preflight a preview's POST triggers, because it carries a custom
       client header. It must be answered without the show calendar, the rate
       limiter or a body ever coming into it. */
    const flight = await worker.fetch(
      new Request("https://api.test/api/queue/report", {
        method: "OPTIONS",
        headers: { Origin: preview, "Access-Control-Request-Method": "POST" },
      }),
      staging,
      createExecutionContext()
    );
    expect(flight.status).toBe(204);
    expect(flight.headers.get("Access-Control-Allow-Origin")).toBe(preview);
    expect(flight.headers.get("Access-Control-Allow-Headers")).toContain("X-GC-Queue-Client");

    const allowed = await live(preview, staging);
    expect(allowed.headers.get("Access-Control-Allow-Origin")).toBe(preview);
    /* Or one preview's cached copy is served to the next wearing its name. */
    expect(allowed.headers.get("Vary")).toBe("Origin");

    /* Production grants nothing, to anyone. */
    expect((await live(preview, testEnv())).headers.get("Access-Control-Allow-Origin")).toBeNull();

    /* Nor does staging, to anywhere that is not a preview. */
    for (const origin of [
      "https://evil.test",
      "http://pr-1-gc2026-guide.example.workers.dev",
      "https://workers.dev.evil.test",
      "https://hallgui.de",
    ]) {
      expect((await live(origin, staging)).headers.get("Access-Control-Allow-Origin")).toBeNull();
    }

    /* The admin console is same-origin on this Worker and never needs the
       grant, so it does not get one. */
    const admin = await worker.fetch(
      new Request("https://api.test/api/admin/data", { headers: { Origin: preview } }),
      staging,
      createExecutionContext()
    );
    expect(admin.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("leaves the clock real when the calendar is forced open", () => {
    /* The reason this is a calendar override and not a clock one: a deployed
       Worker cannot use QUEUE_TEST_NOW, whose anchor is per-isolate module
       state, without isolates disagreeing about the time. So `now` must pass
       through untouched, and the verdict must keep the real date. */
    const when = at("2026-08-20T04:00:00+02:00");
    const forced = eventAccess(event, when, true);
    const real = eventAccess(event, when, false);
    expect(forced).toMatchObject({ allowed: true, phase: "open", forced: true });
    expect(real).toMatchObject({ allowed: false });
    expect(forced.date).toBe(real.date);
    expect(forced.date).toBe("2026-08-20");
    /* During the show it changes nothing at all, so staging and production
       agree on the days that matter. */
    const during = at("2026-08-27T12:00:00+02:00");
    expect(eventAccess(event, during, true)).toEqual(eventAccess(event, during, false));
  });

  it("returns 410 after teardown when an old client replays a deferred completion", async () => {
    await expect(
      handleReport(
        report({ kind: "entered", deferred: true, joinedAt: 1, elapsed: 600 }),
        testEnv({ QUEUE_DB: undefined }),
        site,
        at("2026-08-31T00:00:00+02:00")
      )
    ).rejects.toMatchObject({ status: 410, code: "event_ended" });
  });

  it("stops deferred receipts after the 24-hour retention horizon before querying D1", async () => {
    const unavailableDb = new Proxy({}, {
      get() {
        throw new Error("deadline must be checked before D1");
      },
    });
    await expect(
      handleReport(
        report({ kind: "entered", deferred: true, joinedAt: 1, elapsed: 600 }),
        testEnv({ QUEUE_DB: unavailableDb }),
        site,
        at("2026-08-31T20:30:01+02:00")
      )
    ).rejects.toMatchObject({ status: 410, code: "event_ended" });
  });

  it("uses a 23-hour cutoff so hourly cron stays within the 24-hour promise", async () => {
    const joinedAt = at("2026-08-27T10:00:00+02:00");
    await handleReport(report({ kind: "joined" }), testEnv(), site, joinedAt);
    await handleReport(
      report({ kind: "meta", qtype: "wave", batch: 50 }), testEnv(), site, joinedAt + 1
    );
    await runCleanup(testEnv(), joinedAt + 23 * 60 * 60 + 2);
    expect(await env.QUEUE_DB.prepare(`SELECT COUNT(*) AS n FROM sessions`).first("n")).toBe(0);
    expect(await env.QUEUE_DB.prepare(`SELECT COUNT(*) AS n FROM report_events`).first("n")).toBe(0);
    expect(await env.QUEUE_DB.prepare(`SELECT COUNT(*) AS n FROM queue_meta`).first("n")).toBe(1);
  });

  it("keeps yesterday as an anonymous aggregate across the sweep and serves it as today's fallback", async () => {
    /* Day 1, mid-afternoon: one visitor joins seeing ~30 ahead and gets in
       after 45 minutes. This is the raw, device-linked history the 24-hour
       promise will delete. */
    const joinedAt = at("2026-08-26T15:00:00+02:00");
    await handleReport(report({ kind: "joined", ahead: 30 }), testEnv(), site, joinedAt);
    await handleReport(report({ kind: "entered" }), testEnv(), site, joinedAt + 45 * 60);

    /* The ordinary evening tick — the production path, not the helpers —
       condenses the afternoon into a stats row before anything expires. */
    const evening = createExecutionContext();
    await worker.scheduled(
      { scheduledTime: at("2026-08-26T17:00:00+02:00") * 1000 },
      testEnv(),
      evening
    );
    await waitOnExecutionContext(evening);
    const stored = await env.QUEUE_DB.prepare(
      `SELECT hour, joined_n, entered_n, clients_n, ahead_med, wait_n, wait_med
       FROM queue_stats_hourly WHERE exhibitor = ? AND game = ?`
    ).bind(queue.exhibitor, queue.game).all();
    expect(stored.results).toEqual([
      { hour: joinedAt, joined_n: 1, entered_n: 1, clients_n: 1, ahead_med: 30, wait_n: 1, wait_med: 2700 },
    ]);

    /* Next afternoon, nobody has reported this queue today: the estimator
       answers from yesterday, clearly labelled, anchored at estimate time. */
    const morningAfter = at("2026-08-27T15:05:00+02:00");
    const fallback = await getUncachedLive(testEnv(), morningAfter);
    expect(fallback[queue.exhibitor][queue.game]).toEqual({
      est: 45,
      how: "typical",
      n: 1,
      newest: morningAfter,
    });

    /* The tick that crosses the 24-hour horizon sweeps every raw row — and
       its own rollup, recomputing only hours whose raw window is still
       complete, must not wipe the aggregate saved by earlier ticks. */
    const horizon = createExecutionContext();
    await worker.scheduled(
      { scheduledTime: at("2026-08-27T15:00:01+02:00") * 1000 },
      testEnv(),
      horizon
    );
    await waitOnExecutionContext(horizon);
    expect(await env.QUEUE_DB.prepare(`SELECT COUNT(*) AS n FROM sessions`).first("n")).toBe(0);
    expect(await env.QUEUE_DB.prepare(`SELECT COUNT(*) AS n FROM report_events`).first("n")).toBe(0);
    expect(
      await env.QUEUE_DB.prepare(`SELECT COUNT(*) AS n FROM queue_stats_hourly`).first("n")
    ).toBe(1);
    const survived = await getUncachedLive(testEnv(), morningAfter + 10 * 60);
    expect(survived[queue.exhibitor][queue.game]).toMatchObject({ est: 45, how: "typical" });

    /* The first live report today outranks yesterday immediately. */
    await handleReport(report({ kind: "joined", ahead: 20 }), testEnv(), site, morningAfter + 11 * 60);
    const busy = await getUncachedLive(testEnv(), morningAfter + 12 * 60);
    expect(busy[queue.exhibitor][queue.game].how).not.toBe("typical");
  });

  it("hands the console the show-long aggregate, newest hour first", async () => {
    await env.QUEUE_DB.batch(
      [3_600, 7_200].map((hour) =>
        env.QUEUE_DB.prepare(
          `INSERT INTO queue_stats_hourly (hour, exhibitor, game, wait_n, wait_med, computed_at)
           VALUES (?, ?, ?, 2, 1800, ?)`
        ).bind(hour, queue.exhibitor, queue.game, 10_000)
      )
    );
    const response = await handleAdminData(testEnv(), 30_000, {});
    const data = await response.json();
    expect(data.statsHourly.map((row) => row.hour)).toEqual([7_200, 3_600]);
    expect(data.statsHourly[0]).toMatchObject({
      exhibitor: queue.exhibitor,
      game: queue.game,
      wait_n: 2,
      wait_med: 1800,
    });
  });

  it("never authorizes a non-empty wrong admin token and hides the route", async () => {
    const wrong = new Request("https://hallgui.test/api/admin/data", {
      headers: { Authorization: "Bearer definitely-wrong" },
    });
    expect(await isAdminAuthorized(wrong, { ADMIN_TOKEN: "correct-token" })).toBe(false);

    const ctx = createExecutionContext();
    const response = await worker.fetch(wrong, testEnv({ ADMIN_TOKEN: "correct-token" }), ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    await expect(response.text()).resolves.toBe("Not Found");
  });

  it("serves only the no-store, non-indexable admin login shell publicly", async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request("https://hallgui.test/api/admin/"),
      testEnv({
        ADMIN_AUTH_LIMITER: { async limit() { throw new Error("shell must not rate-limit"); } },
      }),
      ctx
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, noarchive");
    await waitOnExecutionContext(ctx);
  });

  it("short-circuits exhausted admin auth attempts before hashing or asset reads", async () => {
    let attempts = 0;
    const protectedEnv = testEnv({
      ADMIN_TOKEN: "correct-token",
      ADMIN_AUTH_LIMITER: {
        async limit() {
          attempts += 1;
          return { success: false };
        },
      },
    });
    const ctx = createExecutionContext();
    const response = await worker.fetch(
      new Request("https://hallgui.test/api/admin/action", {
        method: "POST",
        headers: {
          Authorization: "Bearer correct-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "pause_writes", paused: true }),
      }),
      protectedEnv,
      ctx
    );
    expect(response.status).toBe(404);
    expect(attempts).toBe(1);
    await waitOnExecutionContext(ctx);
  });

  it("rejects oversized admin actions from Content-Length before reading", async () => {
    const response = await handleAdminAction(
      new Request("https://hallgui.test/api/admin/action", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": "5000" },
        body: "{}",
      }),
      testEnv(),
      1,
      site.queues
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_request" });
  });

  it("bounds an admin action body even when Content-Length is absent", async () => {
    const request = new Request("https://hallgui.test/api/admin/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: `{"padding":"${"x".repeat(5000)}"}`,
    });
    expect(request.headers.has("Content-Length")).toBe(false);
    const response = await handleAdminAction(request, testEnv(), 1, site.queues);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_request" });
  });

  it("surfaces bounded clients with three or more distinct ahead values", async () => {
    const now = 10_000;
    await env.QUEUE_DB.batch(
      [10, 50, 20].map((ahead, index) =>
        env.QUEUE_DB.prepare(
          `INSERT INTO report_events (client, exhibitor, game, kind, ahead, at)
           VALUES (?, ?, ?, 'update', ?, ?)`
        ).bind(CLIENT, queue.exhibitor, queue.game, ahead, now - index)
      )
    );
    const response = await handleAdminData(testEnv(), now, {});
    const data = await response.json();
    expect(data.aheadAnomalies).toHaveLength(1);
    expect(data.aheadAnomalies[0]).toMatchObject({
      client: CLIENT,
      exhibitor: queue.exhibitor,
      game: queue.game,
      reports: 3,
      ahead_values: 3,
    });
    expect(data.queueDiagnostics[0]).toMatchObject({
      exhibitor: queue.exhibitor,
      game: queue.game,
      recentReports: { updates_45m: 3, min_ahead: 10, max_ahead: 50 },
    });
  });

  it("reports closure claims with the rebuttal count the live rule uses", async () => {
    const now = 20_000;
    const closers = [
      "223e4567-e89b-42d3-a456-426614174000",
      "523e4567-e89b-42d3-a456-426614174000",
    ];
    const arrivals = [
      "323e4567-e89b-42d3-a456-426614174000",
      "423e4567-e89b-42d3-a456-426614174000",
    ];
    await env.QUEUE_DB.batch([
      ...closers.map((client) =>
        env.QUEUE_DB.prepare(
          `INSERT INTO closure_reports (exhibitor, game, client, reported_at) VALUES (?, ?, ?, ?)`
        ).bind(queue.exhibitor, queue.game, client, now - 120)
      ),
      /* An update from someone already in the line is not a rebuttal — a closed
         queue still serves the people standing in it. */
      env.QUEUE_DB.prepare(
        `INSERT INTO report_events (client, exhibitor, game, kind, ahead, at)
         VALUES (?, ?, ?, 'update', 20, ?)`
      ).bind(arrivals[0], queue.exhibitor, queue.game, now - 60),
      /* A new arrival after the claim is. One is not enough to overturn it. */
      env.QUEUE_DB.prepare(
        `INSERT INTO report_events (client, exhibitor, game, kind, ahead, at)
         VALUES (?, ?, ?, 'joined', 20, ?)`
      ).bind(arrivals[1], queue.exhibitor, queue.game, now - 30),
    ]);
    const response = await handleAdminData(testEnv(), now, {});
    const data = await response.json();
    expect(data.closureClaims).toHaveLength(1);
    expect(data.closureClaims[0]).toMatchObject({
      exhibitor: queue.exhibitor,
      game: queue.game,
      closure_clients: 2,
      rebuttal_clients: 1,
      would_close: 1,
    });
  });

  it("answers only /api, and needs no asset binding to do it", async () => {
    const ctx = createExecutionContext();
    for (const path of ["/api", "/api/not-real"]) {
      const unknown = await worker.fetch(new Request(`https://hallgui.test${path}`), realClockEnv(), ctx);
      expect(unknown.status).toBe(404);
    }

    /* The site is a different Worker now. Anything outside /api arriving here
       came in on this Worker's own workers.dev address, not through one of the
       `/api/*` routes, and there is nothing to hand it to. */
    const site = await worker.fetch(new Request("https://hallgui.test/example.html"), realClockEnv(), ctx);
    expect(site.status).toBe(404);
    await expect(site.json()).resolves.toMatchObject({ error: "not_found" });

    /* The show data is bundled, so nothing here needs an environment that can
       read files — testEnv() has no ASSETS binding at all, and a live read
       still answers. */
    expect(realClockEnv().ASSETS).toBeUndefined();
    const live = await worker.fetch(
      new Request("https://hallgui.test/api/queue/live", { headers: { "Sec-Fetch-Mode": "cors" } }),
      realClockEnv(),
      ctx
    );
    /* On the real clock this is 200 inside a show window and 403 outside one.
       Either proves the route ran; which one it is says nothing about routing
       and everything about the date the suite happens to run on. */
    expect([200, 403]).toContain(live.status);
    await waitOnExecutionContext(ctx);
  });

  it("builds the show data once per isolate rather than per request", async () => {
    /* This used to count ASSETS reads: the live path once parsed a 93 KB
       exhibitors.json per poll for data it never looks at, and the fix was a
       per-isolate memo. Bundling the data made the memo structural — there is
       no binding left to read from — so what is worth asserting now is that
       the build really happens at module scope and not per call. */
    expect(loadSiteData()).toBe(loadSiteData());
    expect(loadSiteData().queues).toBe(loadSiteData().queues);

    const ctx = createExecutionContext();
    const before = loadSiteData();
    await worker.fetch(
      new Request("https://hallgui.test/api/queue/live", { headers: { "Sec-Fetch-Mode": "cors" } }),
      realClockEnv(),
      ctx
    );
    await waitOnExecutionContext(ctx);
    expect(loadSiteData()).toBe(before);
  });
});
