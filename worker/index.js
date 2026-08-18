import {
  AHEAD_BUCKETS,
  BATCH_BUCKETS,
  CLAIMED_BUCKETS,
  QUEUE_TYPES,
  buildQueueAllowlist,
  deferredReceiptDeadline,
  estimateLive,
  eventAccess,
  queueToken,
} from "./core.js";
import {
  adminShellResponse,
  handleAdminAction,
  handleAdminData,
  hiddenAdminResponse,
  isAdminAuthorized,
} from "./admin.js";
import { readTextLimited } from "./http.js";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CLIENT_HEADER = "X-GC-Queue-Client";
const MAX_DEFERRED_SECONDS = 16 * 60 * 60;
const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

class HttpError extends Error {
  constructor(status, code, extra = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, "Cache-Control": "no-store", ...headers },
  });

const nowSeconds = () => Math.floor(Date.now() / 1000);
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
let localTestClock = null;

export function resolveRequestNow(request, env, realNow = nowSeconds()) {
  const configured = typeof env.QUEUE_TEST_NOW === "string" ? env.QUEUE_TEST_NOW.trim() : "";
  /* Wrangler rewrites local request URLs to the configured custom domain, so
     hostname checks cannot distinguish `wrangler dev`. Require a second
     opt-in that exists only in .dev.vars instead; production config defines
     neither value, and a lone accidentally-created clock secret is inert. */
  if (env.QUEUE_TEST_CLOCK_ENABLED === "local-development-only" && ISO_INSTANT.test(configured)) {
    const milliseconds = Date.parse(configured);
    if (Number.isFinite(milliseconds)) {
      const configuredAt = Math.floor(milliseconds / 1000);
      if (!localTestClock || localTestClock.configuredAt !== configuredAt || realNow < localTestClock.realAt) {
        localTestClock = { configuredAt, realAt: realNow };
      }
      /* Treat QUEUE_TEST_NOW as the starting instant, not a frozen clock. A
         local two-minute throttle/deferred flow can therefore be exercised
         by waiting normally; an isolate reload simply restarts the fixture. */
      return configuredAt + (realNow - localTestClock.realAt);
    }
  }
  return realNow;
}

function requireIntegerBucket(value, buckets, field, { optional = false } = {}) {
  if ((value === undefined || value === null) && optional) return null;
  if (!Number.isInteger(value) || !buckets.includes(value)) {
    throw new HttpError(400, `invalid_${field}`);
  }
  return value;
}

async function readJson(request) {
  const contentType = (request.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.startsWith("application/json")) throw new HttpError(415, "json_required");
  const text = await readTextLimited(request, 4096);
  if (text === null) throw new HttpError(413, "body_too_large");
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("shape");
    return parsed;
  } catch {
    throw new HttpError(400, "invalid_json");
  }
}

async function assetJson(env, request, pathname) {
  const url = new URL(pathname, request.url);
  const response = await env.ASSETS.fetch(new Request(url, { method: "GET" }));
  if (!response.ok) throw new Error(`Asset ${pathname} returned ${response.status}`);
  return response.json();
}

/* Per-isolate memo of the deployed data. A Worker version always serves its own
   assets, so these bytes cannot change under a live isolate — only a new deploy
   replaces them, and that deploy starts new isolates. So there is no TTL to get
   wrong here, and nothing to invalidate.

   The promise is cached rather than the parsed value, so concurrent requests
   share one asset read instead of racing; a rejection evicts itself, so a
   failure during cold start does not poison the isolate for its whole life.
   Callers treat the results as read-only — `queues` is now one shared Map. */
const assetCache = new Map();

function cachedAssetJson(env, request, pathname) {
  const cached = assetCache.get(pathname);
  if (cached) return cached;
  const pending = assetJson(env, request, pathname).catch((error) => {
    assetCache.delete(pathname);
    throw error;
  });
  assetCache.set(pathname, pending);
  return pending;
}

/* The live read needs the show calendar and nothing else. It used to load the
   full site bundle: ~95 KB of JSON parsed and a 160-entry allowlist rebuilt on
   every poll from every phone, before the edge-cache check had even run, for
   exhibitor data that path never looks at. */
export const loadEvent = (env, request) => cachedAssetJson(env, request, "/data/event.json");

let siteData = null;

export function loadSiteData(env, request) {
  if (!siteData) {
    siteData = (async () => {
      const [exhibitors, event] = await Promise.all([
        cachedAssetJson(env, request, "/data/exhibitors.json"),
        loadEvent(env, request),
      ]);
      return { exhibitors, event, queues: buildQueueAllowlist(exhibitors) };
    })().catch((error) => {
      siteData = null;
      throw error;
    });
  }
  return siteData;
}

function requireQueue(body, queues) {
  if (typeof body.exhibitor !== "string" || typeof body.game !== "string") {
    throw new HttpError(400, "queue_required");
  }
  const queue = queues.get(queueToken(body.exhibitor, body.game));
  if (!queue) throw new HttpError(404, "unknown_queue");
  return queue;
}

async function enforceWritePolicy(env, client) {
  const [pauseResult, denyResult] = await env.QUEUE_DB.batch([
    env.QUEUE_DB.prepare(`SELECT value FROM settings WHERE key = 'writes_paused'`),
    env.QUEUE_DB.prepare(`SELECT 1 AS denied FROM denylist WHERE client = ?`).bind(client),
  ]);
  if (pauseResult.results[0]?.value === "1") throw new HttpError(403, "writes_paused");
  if (denyResult.results.length) throw new HttpError(403, "client_denied");
}

async function enforceIpLimit(request, env) {
  if (!env.IP_WRITE_LIMITER?.limit) return;
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const result = await env.IP_WRITE_LIMITER.limit({ key: ip });
  if (!result.success) throw new HttpError(429, "rate_limited", { retryAfter: 60 });
}

async function enforceJoinLimit(env, client, now) {
  const [hour, day] = await env.QUEUE_DB.batch([
    env.QUEUE_DB.prepare(`SELECT COUNT(*) AS count FROM sessions WHERE client = ? AND created_at >= ?`).bind(
      client,
      now - 60 * 60
    ),
    env.QUEUE_DB.prepare(`SELECT COUNT(*) AS count FROM sessions WHERE client = ? AND created_at >= ?`).bind(
      client,
      now - 24 * 60 * 60
    ),
  ]);
  if (Number(hour.results[0]?.count || 0) >= 10 || Number(day.results[0]?.count || 0) >= 40) {
    throw new HttpError(429, "session_limit", { retryAfter: 60 * 60 });
  }
}

const reportEvent = (db, client, queue, kind, ahead, now) =>
  db.prepare(
    `INSERT INTO report_events (client, exhibitor, game, kind, ahead, at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(client, queue.exhibitor, queue.game, kind, ahead, now);

async function joined(env, client, queue, body, now) {
  const claimed = body.claimed === undefined
    ? 0
    : requireIntegerBucket(body.claimed, CLAIMED_BUCKETS, "claimed");
  const ahead = requireIntegerBucket(body.ahead, AHEAD_BUCKETS, "ahead", { optional: true });
  await enforceJoinLimit(env, client, now);
  const joinedAt = now - claimed * 60;
  /* A device stands in one line at a time. Joining anywhere closes whatever
     else was open for this client — as `left` for a different queue, because
     that is what walking off to another line is, and as `abandoned` for a
     re-join of the same one, which is a correction rather than a decision.

     Enforced here rather than only in the UI, which merely asks first: two
     tabs, a replayed request or a client that skips the prompt would otherwise
     leave sessions dangling. They are not harmless when they do — an open
     session counts toward its queue's "so far" bound for four hours, so one
     forgotten line quietly inflates a number somebody else is reading. */
  const statements = [
    env.QUEUE_DB.prepare(
      `UPDATE sessions
          SET outcome = CASE WHEN exhibitor = ? AND game = ? THEN 'abandoned' ELSE 'left' END,
              closed_at = ?, updated_at = ?
        WHERE client = ? AND outcome IS NULL`
    ).bind(queue.exhibitor, queue.game, now, now, client),
    env.QUEUE_DB.prepare(
      `INSERT INTO sessions
       (exhibitor, game, client, created_at, joined_at, updated_at, claimed)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(queue.exhibitor, queue.game, client, now, joinedAt, now, claimed),
  ];
  if (ahead !== null) {
    statements.push(
      env.QUEUE_DB.prepare(
        `INSERT INTO updates (session, ahead, reported_at, initial)
         SELECT id, ?, ?, 1 FROM sessions
         WHERE client = ? AND exhibitor = ? AND game = ? AND outcome IS NULL
         ORDER BY id DESC LIMIT 1`
      ).bind(ahead, now, client, queue.exhibitor, queue.game)
    );
  }
  statements.push(reportEvent(env.QUEUE_DB, client, queue, "joined", ahead, now));
  await env.QUEUE_DB.batch(statements);
  return json({ ok: true, serverAt: now, joinedAt }, 201);
}

async function openSession(env, client, queue) {
  return env.QUEUE_DB.prepare(
    `SELECT s.id, s.joined_at, s.created_at, s.updated_at, s.revision,
            s.outcome, s.closed_at, s.deferred,
            EXISTS (SELECT 1 FROM updates u WHERE u.session = s.id) AS has_updates
     FROM sessions s WHERE s.client = ? AND s.exhibitor = ? AND s.game = ? AND s.outcome IS NULL
     ORDER BY id DESC LIMIT 1`
  ).bind(client, queue.exhibitor, queue.game).first();
}

async function update(env, client, queue, body, now) {
  const ahead = requireIntegerBucket(body.ahead, AHEAD_BUCKETS, "ahead", { optional: true });
  const session = await openSession(env, client, queue);
  if (!session) throw new HttpError(409, "no_open_session");
  const initial = Number(session.has_updates) === 0;
  const wait = initial ? 0 : 120 - (now - Number(session.updated_at));
  if (wait > 0) throw new HttpError(409, "update_too_soon", { retryAfter: wait });
  const revision = Number(session.revision);
  const results = await env.QUEUE_DB.batch([
    env.QUEUE_DB.prepare(
      `INSERT INTO updates (session, ahead, reported_at, initial)
       SELECT id, ?, ?, ? FROM sessions
       WHERE id = ? AND outcome IS NULL AND revision = ?`
    ).bind(ahead, now, initial ? 1 : 0, session.id, revision),
    env.QUEUE_DB.prepare(
      `INSERT INTO report_events (client, exhibitor, game, kind, ahead, at)
       SELECT client, exhibitor, game, 'update', ?, ? FROM sessions
       WHERE id = ? AND outcome IS NULL AND revision = ?`
    ).bind(ahead, now, session.id, revision),
    env.QUEUE_DB.prepare(
      `UPDATE sessions SET updated_at = ?, revision = revision + 1
       WHERE id = ? AND outcome IS NULL AND revision = ? RETURNING id`
    ).bind(now, session.id, revision),
  ]);
  if (results[2].results.length !== 1) {
    throw new HttpError(409, "update_conflict", { retryAfter: 120 });
  }
  return json({ ok: true, serverAt: now });
}

async function outcomeSession(env, client, queue, body, kind, now, event) {
  if (kind === "left") {
    const session = await openSession(env, client, queue);
    if (!session) throw new HttpError(409, "no_open_session");
    const result = await env.QUEUE_DB.prepare(
      `UPDATE sessions SET outcome = 'left', closed_at = ?, updated_at = ?
       WHERE id = ? AND outcome IS NULL RETURNING id`
    ).bind(now, now, session.id).all();
    if (result.results.length !== 1) {
      throw new HttpError(409, "session_already_closed");
    }
    return json({ ok: true, serverAt: now });
  }

  const deferred = body.deferred === true;
  if (body.deferred !== undefined && typeof body.deferred !== "boolean") {
    throw new HttpError(400, "invalid_deferred");
  }
  if (!deferred && body.elapsed !== undefined) throw new HttpError(400, "elapsed_requires_deferred");
  if (!deferred && body.joinedAt !== undefined) throw new HttpError(400, "joined_at_requires_deferred");
  if (
    deferred &&
    (!Number.isInteger(body.elapsed) || body.elapsed < 1 || body.elapsed > MAX_DEFERRED_SECONDS)
  ) {
    throw new HttpError(400, "invalid_elapsed");
  }
  if (deferred && (!Number.isInteger(body.joinedAt) || body.joinedAt <= 0)) {
    throw new HttpError(400, "invalid_joined_at");
  }

  let session;
  if (deferred) {
    session = await env.QUEUE_DB.prepare(
      `SELECT s.id, s.joined_at, s.created_at, s.updated_at, s.outcome, s.closed_at, s.deferred,
              COALESCE(MAX(u.reported_at), s.created_at) AS last_reported
       FROM sessions s LEFT JOIN updates u ON u.session = s.id
       WHERE s.client = ? AND s.exhibitor = ? AND s.game = ?
         AND s.joined_at = ? AND (s.outcome IS NULL OR s.outcome = 'abandoned')
         AND s.created_at >= ?
       GROUP BY s.id ORDER BY s.id DESC LIMIT 1`
    ).bind(client, queue.exhibitor, queue.game, body.joinedAt, now - 24 * 60 * 60).first();
  } else {
    session = await env.QUEUE_DB.prepare(
      `SELECT s.id, s.joined_at, s.created_at, s.updated_at, s.outcome, s.closed_at, s.deferred,
              COALESCE(MAX(u.reported_at), s.created_at) AS last_reported
       FROM sessions s LEFT JOIN updates u ON u.session = s.id
       WHERE s.client = ? AND s.exhibitor = ? AND s.game = ? AND s.outcome IS NULL
       GROUP BY s.id ORDER BY s.id DESC LIMIT 1`
    ).bind(client, queue.exhibitor, queue.game).first();
  }

  if (!session && deferred) {
    const replayed = await env.QUEUE_DB.prepare(
      `SELECT id, joined_at, closed_at, deferred FROM sessions
       WHERE client = ? AND exhibitor = ? AND game = ? AND joined_at = ?
         AND outcome = 'entered'
         AND created_at >= ? ORDER BY id DESC LIMIT 1`
    ).bind(client, queue.exhibitor, queue.game, body.joinedAt, now - 24 * 60 * 60).first();
    /* A normal entered write may commit while its response is lost on hall
       Wi-Fi. Its client then retries as deferred with a slightly later local
       duration. The exact server-issued join anchor proves this is the same
       session; acknowledge the already-recorded outcome and preserve its
       authoritative close time. A genuinely deferred replay stays strict so
       a different duration cannot mutate history. */
    if (
      replayed &&
      (Number(replayed.deferred) === 0 ||
        Number(replayed.closed_at) === Number(replayed.joined_at) + body.elapsed)
    ) {
      return json({
        ok: true,
        serverAt: now,
        closedAt: Number(replayed.closed_at),
        deferred: Boolean(replayed.deferred),
        replayed: true,
      });
    }
  }
  if (!session) throw new HttpError(409, "no_open_session");

  const closedAt = deferred ? body.joinedAt + body.elapsed : now;
  if (deferred && closedAt > now) throw new HttpError(400, "deferred_in_future");
  if (deferred && closedAt < Number(session.last_reported)) {
    throw new HttpError(400, "deferred_before_last_update");
  }
  if (deferred && !eventAccess(event, closedAt).allowed) {
    throw new HttpError(400, "deferred_outside_show_hours");
  }
  const outcomePredicate = deferred ? "(outcome IS NULL OR outcome = 'abandoned')" : "outcome IS NULL";
  const result = await env.QUEUE_DB.prepare(
    `UPDATE sessions SET outcome = 'entered', closed_at = ?, updated_at = ?, deferred = ?
     WHERE id = ? AND ${outcomePredicate} RETURNING id`
  ).bind(closedAt, now, deferred ? 1 : 0, session.id).all();
  if (result.results.length !== 1) throw new HttpError(409, "session_already_closed");
  return json({ ok: true, serverAt: now, closedAt, deferred });
}

async function closedReport(env, client, queue, now) {
  const existing = await env.QUEUE_DB.prepare(
    `SELECT reported_at FROM closure_reports WHERE exhibitor = ? AND game = ? AND client = ?`
  ).bind(queue.exhibitor, queue.game, client).first();
  if (existing && now - Number(existing.reported_at) < 120) {
    throw new HttpError(409, "closure_too_soon", {
      retryAfter: 120 - (now - Number(existing.reported_at)),
    });
  }
  await env.QUEUE_DB.batch([
    env.QUEUE_DB.prepare(
      `INSERT INTO closure_reports (exhibitor, game, client, reported_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(exhibitor, game, client) DO UPDATE SET reported_at = excluded.reported_at`
    ).bind(queue.exhibitor, queue.game, client, now),
    reportEvent(env.QUEUE_DB, client, queue, "closed", null, now),
  ]);
  return json({ ok: true, serverAt: now });
}

async function metaReport(env, client, queue, body, now) {
  if (typeof body.qtype !== "string" || !QUEUE_TYPES.includes(body.qtype)) {
    throw new HttpError(400, "invalid_qtype");
  }
  const batch = requireIntegerBucket(body.batch, BATCH_BUCKETS, "batch", { optional: true });
  const existing = await env.QUEUE_DB.prepare(
    `SELECT reported_at FROM queue_meta WHERE exhibitor = ? AND game = ? AND client = ?`
  ).bind(queue.exhibitor, queue.game, client).first();
  if (existing && now - Number(existing.reported_at) < 24 * 60 * 60) {
    throw new HttpError(409, "meta_already_reported", {
      retryAfter: 24 * 60 * 60 - (now - Number(existing.reported_at)),
    });
  }
  await env.QUEUE_DB.batch([
    env.QUEUE_DB.prepare(
      `INSERT INTO queue_meta (exhibitor, game, client, qtype, batch, reported_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(exhibitor, game, client) DO UPDATE SET qtype = excluded.qtype,
         batch = excluded.batch, reported_at = excluded.reported_at`
    ).bind(queue.exhibitor, queue.game, client, body.qtype, batch, now),
    reportEvent(env.QUEUE_DB, client, queue, "meta", null, now),
  ]);
  return json({ ok: true, serverAt: now });
}

export async function handleReport(request, env, site, now = nowSeconds()) {
  if (request.method !== "POST") throw new HttpError(405, "method_not_allowed");
  await enforceIpLimit(request, env);
  const client = request.headers.get(CLIENT_HEADER) || "";
  if (!UUID_V4.test(client)) throw new HttpError(400, "invalid_client");
  const body = await readJson(request);
  if (typeof body.kind !== "string") throw new HttpError(400, "kind_required");
  const queue = requireQueue(body, site.queues);
  const access = eventAccess(site.event, now);
  const deferredEntered = body.kind === "entered" && body.deferred === true;
  /* After the documented post-show teardown, the D1 binding is gone. Return
     the intentional end-of-event response even to an old installed client
     carrying a deferred completion, rather than turning that into a 500. */
  if (!env.QUEUE_DB && access.phase === "after") throw new HttpError(410, "event_ended");
  const deferredDeadline = deferredEntered ? deferredReceiptDeadline(site.event) : null;
  if (deferredEntered && access.phase === "after" && (deferredDeadline === null || now > deferredDeadline)) {
    throw new HttpError(410, "event_ended");
  }
  if (!deferredEntered) {
    if (access.phase === "after") throw new HttpError(410, "event_ended");
    if (!access.allowed) throw new HttpError(403, "outside_show_hours");
  }
  await enforceWritePolicy(env, client);

  switch (body.kind) {
    case "joined":
      return joined(env, client, queue, body, now);
    case "update":
      return update(env, client, queue, body, now);
    case "entered":
    case "left":
      return outcomeSession(env, client, queue, body, body.kind, now, site.event);
    case "closed":
      return closedReport(env, client, queue, now);
    case "meta":
      return metaReport(env, client, queue, body, now);
    default:
      throw new HttpError(400, "invalid_kind");
  }
}

export async function readEstimatorInput(env, now) {
  const results = await env.QUEUE_DB.batch([
    env.QUEUE_DB.prepare(
      `SELECT s.id AS session, s.exhibitor, s.game, u.ahead, u.reported_at
       FROM sessions s JOIN updates u ON u.session = s.id
       WHERE u.initial = 1 AND u.ahead IS NOT NULL AND s.created_at >= ?`
    ).bind(now - 15 * 60),
    env.QUEUE_DB.prepare(
      `SELECT s.id AS session, s.exhibitor, s.game, u.ahead, u.reported_at
       FROM sessions s JOIN updates u ON u.session = s.id
       WHERE u.ahead IS NOT NULL AND u.reported_at >= ? ORDER BY s.id, u.reported_at`
    ).bind(now - 45 * 60),
    env.QUEUE_DB.prepare(
      `SELECT id AS session, exhibitor, game, joined_at, closed_at
       FROM sessions WHERE outcome = 'entered' AND closed_at >= ?`
    ).bind(now - 60 * 60),
    env.QUEUE_DB.prepare(
      `SELECT id AS session, exhibitor, game, joined_at, updated_at
       FROM sessions WHERE outcome IS NULL AND updated_at >= ?`
    ).bind(now - 4 * 60 * 60),
    env.QUEUE_DB.prepare(
      `SELECT exhibitor, game, client, reported_at FROM closure_reports WHERE reported_at >= ?`
    ).bind(now - 60 * 60),
    /* `kind` rides along because the estimator weighs these differently: only a
       new arrival rebuts a closure claim, while an update from someone already
       in the line is what a closed queue legitimately looks like. */
    env.QUEUE_DB.prepare(
      `SELECT exhibitor, game, client, kind, at FROM report_events
       WHERE at >= ? AND kind IN ('joined', 'update', 'entered')`
    ).bind(now - 60 * 60),
    env.QUEUE_DB.prepare(
      `SELECT exhibitor, game, client, qtype, batch, reported_at FROM queue_meta`
    ),
    env.QUEUE_DB.prepare(
      `SELECT exhibitor, game, forced_closed, expires_at, updated_at
       FROM queue_overrides WHERE expires_at > ?`
    ).bind(now),
  ]);
  return {
    initial: results[0].results,
    speedUpdates: results[1].results,
    completed: results[2].results,
    open: results[3].results,
    closures: results[4].results,
    counters: results[5].results,
    meta: results[6].results,
    overrides: results[7].results,
  };
}

export async function getUncachedLive(env, now = nowSeconds()) {
  return estimateLive(await readEstimatorInput(env, now), now);
}

function liveCacheKey(request) {
  return new Request(new URL("/api/queue/live", request.url).href, { method: "GET" });
}

function browserLiveResponse(response) {
  const copy = new Response(response.body, response);
  copy.headers.set("Cache-Control", "public, max-age=30");
  copy.headers.set("X-Content-Type-Options", "nosniff");
  return copy;
}

async function invalidateLive(request, ctx) {
  if (!globalThis.caches?.default) return;
  ctx.waitUntil(caches.default.delete(liveCacheKey(request)).catch(() => false));
}

export async function handleLive(request, env, ctx, event, now = nowSeconds()) {
  if (request.method !== "GET") throw new HttpError(405, "method_not_allowed");
  const access = eventAccess(event, now);
  if (access.phase === "after") throw new HttpError(410, "event_ended");
  if (!access.allowed) throw new HttpError(403, "outside_show_hours");

  const key = liveCacheKey(request);
  if (globalThis.caches?.default) {
    const cached = await caches.default.match(key);
    if (cached) return browserLiveResponse(cached);
  }
  const response = json(
    { at: now, queues: await getUncachedLive(env, now) },
    200,
    { "Cache-Control": "public, max-age=60" }
  );
  if (globalThis.caches?.default) ctx.waitUntil(caches.default.put(key, response.clone()));
  return browserLiveResponse(response);
}

async function adminAttemptAllowed(request, env) {
  if (!env.ADMIN_AUTH_LIMITER?.limit) return true;
  const key = request.headers.get("CF-Connecting-IP") || "unknown";
  const result = await env.ADMIN_AUTH_LIMITER.limit({ key });
  return result.success !== false;
}

async function routeAdmin(request, env, ctx, now) {
  const path = new URL(request.url).pathname;
  if (path === "/api/admin/" && request.method === "GET") return adminShellResponse();
  if (!(await adminAttemptAllowed(request, env))) return hiddenAdminResponse();
  if (!(await isAdminAuthorized(request, env))) return hiddenAdminResponse();
  if (path === "/api/admin/data" && request.method === "GET") {
    return handleAdminData(env, now, await getUncachedLive(env, now));
  }
  if (path === "/api/admin/action" && request.method === "POST") {
    const site = await loadSiteData(env, request);
    const response = await handleAdminAction(request, env, now, site.queues);
    await invalidateLive(request, ctx);
    return response;
  }
  return hiddenAdminResponse();
}

export async function runCleanup(env, now = nowSeconds()) {
  // The job runs hourly. A 23-hour cutoff guarantees deletion no later than
  // the public 24-hour retention promise even with an almost-full cron tick.
  const cutoff = now - 23 * 60 * 60;
  return env.QUEUE_DB.batch([
    env.QUEUE_DB.prepare(
      `UPDATE sessions SET outcome = 'abandoned', closed_at = ?, updated_at = ?
       WHERE outcome IS NULL AND updated_at < ?`
    ).bind(now, now, now - 4 * 60 * 60),
    env.QUEUE_DB.prepare(`DELETE FROM sessions WHERE created_at < ?`).bind(cutoff),
    env.QUEUE_DB.prepare(`DELETE FROM closure_reports WHERE reported_at < ?`).bind(cutoff),
    env.QUEUE_DB.prepare(`DELETE FROM report_events WHERE at < ?`).bind(cutoff),
    env.QUEUE_DB.prepare(`DELETE FROM queue_overrides WHERE expires_at <= ?`).bind(now),
  ]);
}

async function fetchHandler(request, env, ctx) {
  const url = new URL(request.url);
  if (url.pathname !== "/api" && !url.pathname.startsWith("/api/")) {
    return env.ASSETS.fetch(request);
  }

  const now = resolveRequestNow(request, env);
  if (url.pathname.startsWith("/api/admin")) {
    return routeAdmin(request, env, ctx, now);
  }
  if (url.pathname === "/api/queue/report") {
    const site = await loadSiteData(env, request);
    /* Ordinary facts age into the live response under its 60-second edge TTL.
       Invalidating on every write turns a busy queue into one eight-query D1
       aggregation per report, defeating the cache. Moderation actions still
       invalidate immediately because they are corrective controls. */
    return handleReport(request, env, site, now);
  }
  if (url.pathname === "/api/queue/live") {
    return handleLive(request, env, ctx, await loadEvent(env, request), now);
  }
  throw new HttpError(404, "not_found");
}

export default {
  async fetch(request, env, ctx) {
    try {
      return await fetchHandler(request, env, ctx);
    } catch (error) {
      if (error instanceof HttpError) {
        const headers = error.extra.retryAfter
          ? { "Retry-After": String(Math.max(1, Math.ceil(error.extra.retryAfter))) }
          : {};
        return json({ error: error.code, ...error.extra }, error.status, headers);
      }
      console.error(
        JSON.stringify({
          message: "queue worker request failed",
          method: request.method,
          path: new URL(request.url).pathname,
          error: error instanceof Error ? error.message : String(error),
        })
      );
      return json({ error: "internal_error" }, 500);
    }
  },

  async scheduled(controller, env, ctx) {
    const task = runCleanup(env, Math.floor(controller.scheduledTime / 1000)).catch((error) => {
      console.error(
        JSON.stringify({
          message: "queue cleanup failed",
          error: error instanceof Error ? error.message : String(error),
        })
      );
      throw error;
    });
    ctx.waitUntil(task);
  },
};
