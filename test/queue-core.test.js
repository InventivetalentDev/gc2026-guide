import { describe, expect, it } from "vitest";

import exhibitors from "../data/exhibitors.json";
import event from "../data/event.json";
import {
  BOOTH_QUEUE,
  buildQueueAllowlist,
  deferredReceiptDeadline,
  estimateLive,
  eventAccess,
  normalizeGameKey,
  queueToken,
} from "../worker/core.js";

const berlin = (value) => Math.floor(new Date(value).getTime() / 1000);

describe("queue vocabulary", () => {
  it("uses the exact GCMarks game-key normalization", () => {
    expect(normalizeGameKey("  Call of Duty:\n Modern\tWarfare 4  ")).toBe(
      "call of duty: modern warfare 4"
    );
    for (const game of exhibitors.flatMap((exhibitor) => exhibitor.games || []).filter((game) => game.playable)) {
      expect(normalizeGameKey(game.title)).toBe(String(game.title).trim().toLowerCase().replace(/\s+/g, " "));
    }
  });

  /* Counts are derived, not written down. Hard-coded totals broke on the first
     data revision that added a booth, which is a data change every week of the
     run-up — and a failing count says nothing about whether the *rule* is
     right. The expectations below restate the rule independently of the
     implementation and assert the properties a data bump must never change. */
  it("derives one queue per playable game, and one per lineup-less booth", () => {
    const active = exhibitors.filter(
      (exhibitor) => exhibitor.type !== "trade" && !(exhibitor.tags || []).includes("not exhibiting")
    );
    const playableOf = (exhibitor) => (exhibitor.games || []).filter((game) => game.playable === true);
    const expectedGame = active.flatMap(playableOf).length;
    const expectedBooth = active.filter((exhibitor) => playableOf(exhibitor).length === 0).length;

    const values = [...buildQueueAllowlist(exhibitors).values()];
    expect(values.filter(({ game }) => game !== BOOTH_QUEUE)).toHaveLength(expectedGame);
    expect(values.filter(({ game }) => game === BOOTH_QUEUE)).toHaveLength(expectedBooth);
    expect(values).toHaveLength(expectedGame + expectedBooth);
    /* Every token is unique, so no report can ever be attributed to two queues. */
    expect(new Set(values.map(({ exhibitor, game }) => queueToken(exhibitor, game))).size).toBe(values.length);
    /* The dataset has to be able to fail these: it currently holds both. */
    expect(expectedGame).toBeGreaterThan(0);
    expect(expectedBooth).toBeGreaterThan(0);
  });

  it("excludes trade booths, absent exhibitors, and non-playable lineups", () => {
    const queues = buildQueueAllowlist(exhibitors);
    const owners = new Set([...queues.values()].map(({ exhibitor }) => exhibitor));

    /* Business booths run on appointments; the app excludes them everywhere. */
    expect(exhibitors.some((exhibitor) => exhibitor.type === "trade")).toBe(true);
    for (const exhibitor of exhibitors.filter((entry) => entry.type === "trade")) {
      expect(owners.has(exhibitor.id)).toBe(false);
    }
    /* An exhibitor who pulled out keeps its card and loses its queue. */
    expect(exhibitors.some((exhibitor) => (exhibitor.tags || []).includes("not exhibiting"))).toBe(true);
    for (const exhibitor of exhibitors.filter((entry) => (entry.tags || []).includes("not exhibiting"))) {
      expect(owners.has(exhibitor.id)).toBe(false);
    }
    /* A booth with a lineup gets per-game queues only — never a _booth queue
       beside them — and an announced-but-not-playable title gets none. */
    for (const exhibitor of exhibitors) {
      const playable = (exhibitor.games || []).filter((game) => game.playable === true);
      if (!playable.length) continue;
      expect(queues.has(queueToken(exhibitor.id, BOOTH_QUEUE))).toBe(false);
      for (const game of exhibitor.games || []) {
        expect(queues.has(queueToken(exhibitor.id, normalizeGameKey(game.title)))).toBe(
          game.playable === true
        );
      }
    }
  });
});

describe("show-hour gate", () => {
  it("uses Europe/Berlin and the earliest business/public opening with grace", () => {
    expect(eventAccess(event, berlin("2026-08-26T08:29:59+02:00")).allowed).toBe(false);
    expect(eventAccess(event, berlin("2026-08-26T08:30:00+02:00"))).toMatchObject({
      allowed: true,
      start: 510,
    });
    expect(eventAccess(event, berlin("2026-08-26T12:30:00+02:00")).allowed).toBe(true);
  });

  it("includes the close grace and classifies the final cutoff as ended", () => {
    expect(eventAccess(event, berlin("2026-08-30T20:30:00+02:00")).allowed).toBe(true);
    expect(eventAccess(event, berlin("2026-08-30T20:30:01+02:00"))).toMatchObject({
      allowed: false,
      phase: "after",
    });
    expect(deferredReceiptDeadline(event)).toBe(berlin("2026-08-31T20:30:00+02:00"));
  });
});

describe("live estimator", () => {
  const queue = { exhibitor: "xbox", game: "fable" };
  const row = (extra) => ({ ...queue, ...extra });

  it("deduplicates speed to one median sample per session", () => {
    const now = 10_000;
    const noisy = [150, 120, 90, 60, 30, 10].map((ahead, index) =>
      row({ session: "noisy", ahead, reported_at: 7_000 + index * 180 })
    );
    const honest = [
      row({ session: "one", ahead: 60, reported_at: 8_000 }),
      row({ session: "one", ahead: 30, reported_at: 8_600 }),
      row({ session: "two", ahead: 50, reported_at: 8_100 }),
      row({ session: "two", ahead: 20, reported_at: 8_700 }),
    ];
    const result = estimateLive(
      {
        initial: [row({ session: "one", ahead: 100, reported_at: 9_900 })],
        speedUpdates: [...noisy, ...honest],
      },
      now
    );
    expect(result.xbox.fable).toMatchObject({ est: 35, how: "flow", n: 3 });
  });

  it("falls back from recent completions to the upper-quartile open bound", () => {
    const now = 20_000;
    const done = estimateLive(
      {
        completed: [
          row({ session: 1, joined_at: 10_000, closed_at: 11_500 }),
          row({ session: 2, joined_at: 12_000, closed_at: 15_300 }),
        ],
        open: [row({ session: 3, joined_at: 1, updated_at: now })],
      },
      now
    );
    expect(done.xbox.fable).toMatchObject({ est: 40, how: "done", n: 2 });

    const sofar = estimateLive(
      {
        open: [
          row({ session: 1, joined_at: now - 5 * 60, updated_at: now - 5 }),
          row({ session: 2, joined_at: now - 10 * 60, updated_at: now - 4 }),
          row({ session: 3, joined_at: now - 20 * 60, updated_at: now - 3 }),
          row({ session: 4, joined_at: now - 30 * 60, updated_at: now - 2 }),
        ],
      },
      now
    );
    expect(sofar.xbox.fable).toMatchObject({ est: 20, how: "sofar", n: 4 });
  });

  it("discards an implausible flow projection but clamps a measured one", () => {
    const now = 100_000;
    /* One slow but individually legal pair: a single bucket step across forty
       minutes is 0.25 people/min, which against a 150-deep line projects to
       ten hours. The queue is 45 minutes by measurement, and that is what a
       card must show. */
    const slowPair = [
      row({ session: "slow", ahead: 30, reported_at: now - 50 * 60 }),
      row({ session: "slow", ahead: 20, reported_at: now - 10 * 60 }),
    ];
    const initial = [row({ session: "joiner", ahead: 150, reported_at: now - 60 })];

    const withFallback = estimateLive(
      {
        initial,
        speedUpdates: slowPair,
        completed: [row({ session: "done", joined_at: now - 3 * 3600, closed_at: now - 3 * 3600 + 2700 })],
      },
      now
    );
    expect(withFallback.xbox.fable).toMatchObject({ est: 45, how: "done" });
    expect(withFallback.xbox.fable.capped).toBeUndefined();

    /* With nothing measured to fall back to, the projection is withheld rather
       than published — no wait tier at all. */
    const withoutFallback = estimateLive({ initial, speedUpdates: slowPair }, now);
    expect(withoutFallback.xbox?.fable?.how).toBeUndefined();

    /* A measured wait beyond the ceiling is real data, so it is clamped and
       flagged, and the card states it as a floor. */
    const extreme = estimateLive(
      {
        completed: [
          row({ session: 1, joined_at: now - 6 * 3600, closed_at: now - 1800 }),
          row({ session: 2, joined_at: now - 6 * 3600, closed_at: now - 1700 }),
        ],
      },
      now
    );
    expect(extreme.xbox.fable).toMatchObject({ est: 240, how: "done", capped: true });
  });

  it("requires a two-device closure quorum newer than median counter-evidence", () => {
    const now = 3_000;
    const base = {
      completed: [row({ session: 1, joined_at: 1_000, closed_at: 2_200 })],
      closures: [
        row({ client: "a", reported_at: 2_800 }),
        row({ client: "b", reported_at: 2_900 }),
      ],
    };
    expect(
      estimateLive({ ...base, counters: [row({ client: "c", at: 2_700 })] }, now).xbox.fable
    ).toMatchObject({ closed: true, n: 2 });
    expect(
      estimateLive({ ...base, counters: [row({ client: "c", at: 2_950 })] }, now).xbox.fable
    ).toMatchObject({ how: "done" });
    expect(
      estimateLive(
        {
          ...base,
          overrides: [row({ forced_closed: 0, expires_at: now + 60, updated_at: now })],
        },
        now
      ).xbox.fable
    ).toMatchObject({ how: "done" });
  });

  it("uses mechanics majority, newest tie-break, and a median batch", () => {
    const result = estimateLive(
      {
        meta: [
          row({ qtype: "pairs", batch: 2, client: "a", reported_at: 100 }),
          row({ qtype: "wave", batch: 50, client: "b", reported_at: 90 }),
          row({ qtype: "wave", batch: 100, client: "c", reported_at: 200 }),
          row({ qtype: "pairs", batch: 2, client: "d", reported_at: 150 }),
        ],
      },
      300
    );
    expect(result.xbox.fable).toMatchObject({ qtype: "wave", batch: 75, n: 2, newest: 200 });
  });
});
