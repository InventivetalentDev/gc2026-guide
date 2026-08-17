import { env } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import exhibitors from "../data/exhibitors.json";
import event from "../data/event.json";
import worker, {
  handleLive,
  handleReport,
  resolveRequestNow,
  runCleanup,
} from "../worker/index.js";
import { handleAdminAction, handleAdminData, isAdminAuthorized } from "../worker/admin.js";
import { buildQueueAllowlist } from "../worker/core.js";

const CLIENT = "123e4567-e89b-42d3-a456-426614174000";
const queue = [...buildQueueAllowlist(exhibitors).values()][0];
const site = { event, queues: buildQueueAllowlist(exhibitors) };
const at = (value) => Math.floor(new Date(value).getTime() / 1000);

function testEnv(extra = {}) {
  return {
    ...env,
    ASSETS: {
      async fetch(request) {
        const path = new URL(request.url).pathname;
        if (path === "/data/exhibitors.json") return Response.json(exhibitors);
        if (path === "/data/event.json") return Response.json(event);
        return new Response(`asset:${path}`);
      },
    },
    IP_WRITE_LIMITER: { async limit() { return { success: true }; } },
    ADMIN_AUTH_LIMITER: { async limit() { return { success: true }; } },
    ...extra,
  };
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
        ASSETS: { async fetch() { throw new Error("shell must not read assets"); } },
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
    let assetReads = 0;
    const protectedEnv = testEnv({
      ADMIN_TOKEN: "correct-token",
      ADMIN_AUTH_LIMITER: {
        async limit() {
          attempts += 1;
          return { success: false };
        },
      },
      ASSETS: {
        async fetch() {
          assetReads += 1;
          throw new Error("protected auth must not read assets");
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
    expect(assetReads).toBe(0);
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

  it("returns 404 for unknown API paths and delegates non-API requests to assets", async () => {
    const ctx = createExecutionContext();
    for (const path of ["/api", "/api/not-real"]) {
      const unknown = await worker.fetch(new Request(`https://hallgui.test${path}`), testEnv(), ctx);
      expect(unknown.status).toBe(404);
    }

    const asset = await worker.fetch(new Request("https://hallgui.test/example.html"), testEnv(), ctx);
    expect(asset.status).toBe(200);
    await expect(asset.text()).resolves.toBe("asset:/example.html");
    await waitOnExecutionContext(ctx);
  });

  it("never reads exhibitor data on the live path and memoizes assets per isolate", async () => {
    const reads = [];
    const counting = () => {
      const base = testEnv();
      return {
        ...base,
        ASSETS: {
          fetch(request) {
            reads.push(new URL(request.url).pathname);
            return base.ASSETS.fetch(request);
          },
        },
      };
    };
    const live = () =>
      new Request("https://hallgui.test/api/queue/live", {
        headers: { "Sec-Fetch-Mode": "cors" },
      });

    const ctx = createExecutionContext();
    /* Assertions are written to hold whether or not the module-level memo is
       already warm from an earlier test in this file, so they do not depend on
       execution order. */
    await worker.fetch(live(), counting(), ctx);
    const afterFirst = reads.length;
    await worker.fetch(live(), counting(), ctx);
    await waitOnExecutionContext(ctx);

    /* The live read needs the show calendar only. Parsing exhibitors.json here
       cost ~93 KB per poll for data this path never looks at. */
    expect(reads).not.toContain("/data/exhibitors.json");
    /* Whatever the first call had to load, the second loads nothing. */
    expect(reads.slice(afterFirst)).toEqual([]);
    expect(afterFirst).toBeLessThanOrEqual(1);
  });
});
