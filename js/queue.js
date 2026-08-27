/* gamescom 2026 guide — live queue state and transport.

   This module deliberately owns no markup and no translated copy. app.js is
   the renderer; this file is the small state machine both its card and planner
   surfaces read. Keeping the boundary here also makes the failure mode plain:
   if the live endpoint is unreachable, the static guide still renders exactly
   as it did before. */

const GCQueues = (() => {
  const STORAGE_KEY = "gc2026.queue.v1";
  const STORE_LOCK = "gc2026.queue.store.v1";
  const REPORT_LOCK = "gc2026.queue.report.v1";
  /* Same origin everywhere that matters: production reaches the API through a
     route on its own hostname, and local development through the dev proxy.

     The exception is a pull request preview of the site. It lives on
     *.workers.dev, where the production arrangement cannot exist — a route
     belongs to a zone, and workers.dev is not one — so a preview would have no
     API behind it at all and the whole queue feature would be unreviewable.
     There, and only with ?queue-dev=1 asked for explicitly, calls go to the
     staging API cross-origin. Staging allows exactly these origins; production
     allows none and never sees this path, because production is not on
     workers.dev.

     The account subdomain is read off the current hostname rather than
     hardcoded: pr-77-gc2026-guide.<account>.workers.dev drops its first label
     to give <account>.workers.dev. */
  const STAGING_API_WORKER = "gc2026-queues-api-staging";

  function apiOrigin() {
    const host = location.hostname;
    if (!host.endsWith(".workers.dev") || !devOverride()) return "";
    const account = host.split(".").slice(1).join(".");
    return account ? `https://${STAGING_API_WORKER}.${account}` : "";
  }

  const API_LIVE = () => `${apiOrigin()}/api/queue/live`;
  const API_REPORT = () => `${apiOrigin()}/api/queue/report`;
  const CLIENT_HEADER = "X-GC-Queue-Client";
  const BOOTH = "_booth";
  const POLL_MS = 120000;
  const TICK_MS = 30000;
  const REQUEST_TIMEOUT_MS = 10000;
  const PROMPT_AFTER = 600;
  const SESSION_IDLE_SECONDS = 4 * 60 * 60;
  const MAX_DEFERRED_SECONDS = 16 * 60 * 60;
  const PENDING_MAX_SECONDS = 24 * 60 * 60;
  /* The Worker takes one mechanics vote per device and queue a day. Mirrored
     here so the offer can be withdrawn once it is spent, rather than sending a
     report that can only come back 409. */
  const META_WINDOW_SECONDS = 24 * 60 * 60;
  /* "typical" is yesterday's aggregate, so its underlying data is a day old
     by design; the two-hour bound is on how long a phone that stopped hearing
     from the server may keep saying "yesterday around now" while "now" drifts
     away from the hours the figure was computed for. */
  const FRESH_SECONDS = { flow: 900, sofar: 900, done: 3600, closed: 3600, typical: 7200 };
  const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  let eventData = null;
  let exhibitors = [];
  let exhibitorsById = new Map();
  let validQueues = new Map();
  let storageWritable = true;
  let store = readStore();
  let livePayload = null;
  let liveReceivedAt = 0;
  let serverClock = null;
  let fetchFailed = false;
  let started = false;
  let pollTimer = 0;
  let tickTimer = 0;
  let isPaused = GCMarks.powerSaver();
  let liveRequest = null;
  let replayRequest = null;
  let pendingRetryTimer = 0;
  let pendingRetryAt = 0;
  let pendingRetryAttempt = 0;
  let lastRefresh = 0;

  const nowSeconds = () => Math.floor(Date.now() / 1000);
  const monotonicSeconds = () =>
    typeof performance?.now === "function" ? performance.now() / 1000 : Date.now() / 1000;
  const queueKey = (exhibitor, game = BOOTH) => JSON.stringify([String(exhibitor), String(game || BOOTH)]);

  async function fetchWithDeadline(input, init = {}) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      window.clearTimeout(timer);
    }
  }

  function cleanSession(value) {
    if (!value || typeof value !== "object") return null;
    const exhibitor = typeof value.exhibitor === "string" ? value.exhibitor : "";
    const game = typeof value.game === "string" ? value.game : BOOTH;
    const joinedAt = Number(value.joinedAt);
    if (!exhibitor || !Number.isFinite(joinedAt) || joinedAt <= 0) return null;
    return {
      exhibitor,
      game,
      joinedAt: Math.floor(joinedAt),
      lastAhead:
        value.lastAhead !== null && value.lastAhead !== undefined && Number.isFinite(Number(value.lastAhead))
          ? Number(value.lastAhead)
          : null,
      lastInteractionAt: Number.isFinite(Number(value.lastInteractionAt))
        ? Math.floor(Number(value.lastInteractionAt))
        : Math.floor(joinedAt),
      lastServerAt: Number.isFinite(Number(value.lastServerAt))
        ? Math.floor(Number(value.lastServerAt))
        : Math.floor(joinedAt),
    };
  }

  function cleanPending(value) {
    if (!value || typeof value !== "object") return null;
    const exhibitor = typeof value.exhibitor === "string" ? value.exhibitor : "";
    const game = typeof value.game === "string" ? value.game : BOOTH;
    const elapsed = Math.floor(Number(value.elapsed));
    const joinedAt = Math.floor(Number(value.joinedAt));
    if (
      !exhibitor ||
      !Number.isFinite(elapsed) ||
      elapsed < 1 ||
      elapsed > MAX_DEFERRED_SECONDS ||
      !Number.isFinite(joinedAt) ||
      joinedAt <= 0
    ) return null;
    return {
      id: typeof value.id === "string" ? value.id : `${queueKey(exhibitor, game)}:${joinedAt}:${elapsed}`,
      exhibitor,
      game,
      joinedAt,
      elapsed,
      queuedAt: Math.floor(Number(value.queuedAt)) || nowSeconds(),
    };
  }

  function normaliseStore(raw) {
    const sessions = {};
    const source = raw && typeof raw.sessions === "object" ? raw.sessions : {};
    for (const value of Object.values(source || {})) {
      const session = cleanSession(value);
      if (session) sessions[queueKey(session.exhibitor, session.game)] = session;
    }
    const pending = Array.isArray(raw?.pending) ? raw.pending.map(cleanPending).filter(Boolean) : [];
    /* Wall clock rather than the server one: this is storage hygiene, and
       normalisation runs on paths that have never spoken to the server. A
       skewed phone at worst re-offers a vote the server then refuses, which
       records itself again. */
    const floor = Math.floor(Date.now() / 1000) - META_WINDOW_SECONDS;
    const meta = {};
    for (const [key, value] of Object.entries(raw?.meta && typeof raw.meta === "object" ? raw.meta : {})) {
      const at = Math.floor(Number(value));
      if (Number.isFinite(at) && at > floor) meta[key] = at;
    }
    return {
      client: typeof raw?.client === "string" && UUID_V4.test(raw.client) ? raw.client : null,
      sessions,
      pending: [...new Map(pending.map((item) => [item.id, item])).values()],
      meta,
    };
  }

  function readStore() {
    try {
      return normaliseStore(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"));
    } catch {
      return normaliseStore({});
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
      storageWritable = true;
      return true;
    } catch {
      storageWritable = false;
      return false;
    }
  }

  function latestStore() {
    if (!storageWritable) return normaliseStore(store);
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return value === null ? normaliseStore(store) : normaliseStore(JSON.parse(value));
    } catch {
      return normaliseStore(store);
    }
  }

  async function withLock(name, action) {
    if (navigator.locks?.request) return navigator.locks.request(name, action);
    return action();
  }

  async function mutateStore(mutator) {
    return withLock(STORE_LOCK, () => {
      const next = latestStore();
      const result = mutator(next);
      store = next;
      persist();
      return result;
    });
  }

  function randomId() {
    if (crypto.randomUUID) return crypto.randomUUID();
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((n) => n.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
      .slice(6, 8)
      .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
  }

  async function clientId() {
    return mutateStore((next) => {
      if (!next.client) next.client = randomId();
      return next.client;
    });
  }

  function notify(reason, extra = {}) {
    window.dispatchEvent(new CustomEvent("gcqueueschange", { detail: { reason, ...extra } }));
  }

  const absent = (ex) => (ex?.tags || []).includes("not exhibiting");
  const trackable = (ex) => Boolean(ex) && ex.type !== "trade" && !absent(ex);

  function queue(exhibitor, game = BOOTH) {
    const id = typeof exhibitor === "string" ? exhibitor : exhibitor?.id;
    return validQueues.get(queueKey(id, game)) || null;
  }

  function queuesFor(exhibitor) {
    const ex = typeof exhibitor === "string" ? exhibitorsById.get(exhibitor) : exhibitor;
    if (!trackable(ex)) return [];
    const playable = (ex.games || []).filter((game) => game.playable === true);
    if (!playable.length) return [queue(ex.id, BOOTH)].filter(Boolean);
    return playable.map((game) => queue(ex.id, GCMarks.gameKey(game.title))).filter(Boolean);
  }

  function configure({ event, exhibitors: entries }) {
    eventData = event || null;
    exhibitors = Array.isArray(entries) ? entries : [];
    exhibitorsById = new Map(exhibitors.map((ex) => [ex.id, ex]));
    validQueues = new Map();
    for (const ex of exhibitors) {
      if (!trackable(ex)) continue;
      const playable = (ex.games || []).filter((game) => game.playable === true);
      if (playable.length) {
        for (const game of playable) {
          const gameId = GCMarks.gameKey(game.title);
          validQueues.set(queueKey(ex.id, gameId), { exhibitor: ex.id, game: gameId });
        }
      } else {
        validQueues.set(queueKey(ex.id, BOOTH), { exhibitor: ex.id, game: BOOTH });
      }
    }
    /* Re-read after configuration so a second tab cannot be overwritten by
       the module snapshot captured while this tab was loading. */
    store = latestStore();
    let pruned = false;
    for (const [key, value] of Object.entries(store.sessions)) {
      if (validQueues.has(queueKey(value.exhibitor, value.game)) && !sessionExpired(value)) continue;
      delete store.sessions[key];
      pruned = true;
    }
    /* Pending completions are reconciled by replayPending(), even when they
       have expired or their queue disappeared. That path can announce a
       terminal rejection instead of silently dropping the user's state. */
    if (pruned) persist();
    notify("configure");
  }

  /* Show the queue surfaces outside the five show days, for development and
     for reviewing a pull request preview. Always opt-in via ?queue-dev=1 — on
     workers.dev too, because the production site Worker answers on a
     workers.dev address of its own and a deploy checked there must behave
     exactly as the real hostnames do. */
  function devOverride() {
    const host = location.hostname;
    const allowed =
      host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".workers.dev");
    return allowed && new URLSearchParams(location.search).get("queue-dev") === "1";
  }

  function zonedNow(now = new Date()) {
    const timeZone = eventData?.timeZone || "Europe/Berlin";
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).formatToParts(now);
      const part = (type) => parts.find((p) => p.type === type)?.value || "";
      return {
        date: `${part("year")}-${part("month")}-${part("day")}`,
        minute: Number(part("hour")) * 60 + Number(part("minute")),
      };
    } catch {
      return { date: now.toISOString().slice(0, 10), minute: now.getUTCHours() * 60 + now.getUTCMinutes() };
    }
  }

  const clockMinutes = (value) => {
    const [hour, minute] = String(value || "").split(":").map(Number);
    return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : null;
  };

  function businessHours(value) {
    if (typeof value !== "string" || value.toLowerCase() === "closed") return null;
    const [from, to] = value.split(/[\u2013\u2014-]/).map((part) => clockMinutes(part.trim()));
    return from !== null && to !== null ? { from, to } : null;
  }

  function visible(now = new Date()) {
    if (devOverride()) return true;
    const date = zonedNow(now).date;
    return (eventData?.days || []).some((day) => day.date === date);
  }

  function withinShowHours(now = new Date(), graceMinutes = 0) {
    if (devOverride()) return true;
    const local = zonedNow(now);
    const day = (eventData?.days || []).find((entry) => entry.date === local.date);
    if (!day) return false;
    const publicOpen = clockMinutes(day.open);
    const publicClose = clockMinutes(day.close);
    const business = businessHours(day.business);
    /* Trade-badge visitors can enter entertainment halls at business opening;
       type:"trade" booths still have no trackers, but those visitors' game
       queue facts are just as live. Mirror the worker's widest daily window. */
    const open = business ? Math.min(publicOpen, business.from) : publicOpen;
    const close = business ? Math.max(publicClose, business.to) : publicClose;
    return open !== null && close !== null && local.minute >= open - graceMinutes && local.minute <= close + graceMinutes;
  }

  const showOpen = (now = new Date()) => withinShowHours(now, 0);
  const reportOpen = (now = new Date()) => withinShowHours(now, 30);

  function afterFinalDay(now = new Date()) {
    const dates = (eventData?.days || []).map((day) => day.date).filter(Boolean).sort();
    return Boolean(dates.length && zonedNow(now).date > dates[dates.length - 1]);
  }

  function sessionExpired(value) {
    if (!value || afterFinalDay()) return true;
    const last = Math.max(
      Number(value.joinedAt) || 0,
      Number(value.lastInteractionAt) || 0,
      Number(value.lastServerAt) || 0
    );
    return last > 0 && serverNow() - last > SESSION_IDLE_SECONDS;
  }

  const pendingExpired = (value) =>
    !value || (Math.floor(serverNow()) - Number(value.queuedAt || 0) > PENDING_MAX_SECONDS);

  function connected() {
    return navigator.onLine !== false && !fetchFailed;
  }

  /* A failed GET means live figures are unavailable; it does not prove the
     write endpoint is down. Writes still get one honest attempt whenever the
     browser itself is online, inside the backend's ±30-minute grace window. */
  const canReport = () => visible() && reportOpen() && navigator.onLine !== false;

  function setServerClock(at) {
    const seconds = Number(at);
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    const current = serverClock ? serverNow() : 0;
    const anchored = Math.max(seconds, current);
    serverClock = {
      at: anchored,
      wallAt: Date.now() / 1000,
      monotonicAt: monotonicSeconds(),
      floor: anchored,
    };
  }

  function serverNow() {
    if (serverClock) {
      /* Date.now advances while a phone is locked; performance.now protects
         against a wall-clock rollback while the page stays alive. Clamp to a
         per-page floor so neither source can ever make a measured wait shrink. */
      const wall = serverClock.at + Math.max(0, Date.now() / 1000 - serverClock.wallAt);
      const monotonic = serverClock.at + Math.max(0, monotonicSeconds() - serverClock.monotonicAt);
      serverClock.floor = Math.max(serverClock.floor, wall, monotonic);
      return serverClock.floor;
    }
    if (livePayload && Number.isFinite(Number(livePayload.at))) {
      return Number(livePayload.at) + (monotonicSeconds() - liveReceivedAt);
    }
    return Date.now() / 1000;
  }

  function markConnected() {
    const changed = fetchFailed;
    fetchFailed = false;
    if (changed) notify("connection");
    return changed;
  }

  function markFailed() {
    const changed = !fetchFailed;
    fetchFailed = true;
    if (changed) notify("connection");
  }

  async function refresh({ force = false, manual = false } = {}) {
    if (isPaused && !manual) return livePayload;
    if (!showOpen() || document.visibilityState === "hidden") return null;
    if (liveRequest) return liveRequest;
    if (!force && Date.now() - lastRefresh < 1000) return livePayload;
    lastRefresh = Date.now();
    liveRequest = (async () => {
      try {
        const response = await fetchWithDeadline(API_LIVE());
        if (!response.ok) throw new Error(`queue live ${response.status}`);
        const payload = await response.json();
        if (!payload || typeof payload !== "object" || typeof payload.queues !== "object") {
          throw new Error("invalid queue live response");
        }
        livePayload = payload;
        liveReceivedAt = monotonicSeconds();
        const age = Math.max(0, Number(response.headers.get("Age")) || 0);
        setServerClock(Number(payload.at) + age);
        const recovered = markConnected();
        notify("live");
        if (recovered && store.pending.length) replayPending();
        return payload;
      } catch (error) {
        markFailed();
        notify("live-error", { error });
        return null;
      } finally {
        liveRequest = null;
      }
    })();
    return liveRequest;
  }

  function live(queueRef) {
    if (!queueRef || !livePayload?.queues) return null;
    const result = livePayload.queues?.[queueRef.exhibitor]?.[queueRef.game];
    if (!result || typeof result !== "object") return null;
    const how = result.closed ? "closed" : result.how;
    const limit = FRESH_SECONDS[how];
    const newest = Number(result.newest);
    if (!limit || !Number.isFinite(newest)) return null;
    const age = Math.max(0, Math.floor(serverNow() - newest));
    if (age > limit) return null;
    return { ...result, how, age };
  }

  function unavailable(queueRef = null) {
    if (!visible()) return false;
    if (!connected()) return true;
    if (!queueRef || !livePayload?.queues) return false;
    const result = livePayload.queues?.[queueRef.exhibitor]?.[queueRef.game];
    /* A queue omitted from the payload has no data and therefore no chip.
       A queue the server did return, but whose tier has aged out, is a
       different state: make the unavailable fallback explicit rather than
       silently letting an old measurement look like it never existed.
       Mechanics-only rows deliberately have no wait tier and stay hidden. */
    if (!result || typeof result !== "object") return false;
    const how = result.closed ? "closed" : result.how;
    const limit = FRESH_SECONDS[how];
    const newest = Number(result.newest);
    return Boolean(limit && Number.isFinite(newest) && Math.max(0, Math.floor(serverNow() - newest)) > limit);
  }

  function compareLive(a, b) {
    if (!a) return 1;
    if (!b) return -1;
    if (a.live.closed !== b.live.closed) return a.live.closed ? -1 : 1;
    const av = Number(a.live.est) || 0;
    const bv = Number(b.live.est) || 0;
    return bv - av || (Number(b.live.newest) || 0) - (Number(a.live.newest) || 0);
  }

  function worst(exhibitor) {
    return queuesFor(exhibitor)
      .map((queueRef) => ({ queue: queueRef, live: live(queueRef) }))
      .filter((entry) => entry.live)
      .sort(compareLive)[0] || null;
  }

  const session = (queueRef) => {
    const value = queueRef ? store.sessions[queueKey(queueRef.exhibitor, queueRef.game)] : null;
    return value && !sessionExpired(value) ? value : null;
  };
  const sessions = () => Object.values(store.sessions).filter((value) => !sessionExpired(value));
  /* Has this device already spent its mechanics vote on this queue today?
     Only the local record can answer it — the aggregate in the live payload is
     everybody's votes, and says nothing about whose. */
  const metaReported = (queueRef) => {
    const at = queueRef ? Number(store.meta?.[queueKey(queueRef.exhibitor, queueRef.game)]) : 0;
    return Number.isFinite(at) && at > 0 && serverNow() - at < META_WINDOW_SECONDS;
  };
  const elapsed = (value) => {
    const joinedAt = Number(value?.joinedAt || serverNow());
    const current = Math.max(serverNow(), Number(value?.lastServerAt || joinedAt));
    return Math.max(0, Math.floor(current - joinedAt));
  };

  function promptCandidate() {
    const now = Math.floor(serverNow());
    return sessions()
      .filter((value) => validQueues.has(queueKey(value.exhibitor, value.game)))
      .filter((value) => elapsed(value) >= PROMPT_AFTER && now - value.lastInteractionAt >= PROMPT_AFTER)
      .sort((a, b) => a.joinedAt - b.joinedAt)[0] || null;
  }

  async function post(queueRef, body) {
    let response;
    try {
      response = await fetchWithDeadline(API_REPORT(), {
        method: "POST",
        headers: { "Content-Type": "application/json", [CLIENT_HEADER]: await clientId() },
        body: JSON.stringify({ exhibitor: queueRef.exhibitor, game: queueRef.game, ...body }),
      });
    } catch (error) {
      const unavailable = new Error("network_unavailable");
      unavailable.code = "network_unavailable";
      unavailable.cause = error;
      throw unavailable;
    }
    let payload = {};
    try {
      payload = await response.json();
    } catch {
      /* A successful empty response is still a successful write. */
    }
    if (!response.ok) {
      const error = new Error(payload.error || payload.message || `queue report ${response.status}`);
      error.status = response.status;
      error.code = payload.error || "";
      error.retryAfter = Number(response.headers.get("Retry-After")) || 0;
      throw error;
    }
    setServerClock(payload.serverAt);
    return payload;
  }

  async function closeLocal(queueRef, joinedAt = null) {
    const key = queueKey(queueRef.exhibitor, queueRef.game);
    return mutateStore((next) => {
      const current = next.sessions[key];
      if (!current || (joinedAt !== null && Number(current.joinedAt) !== Number(joinedAt))) return false;
      delete next.sessions[key];
      return true;
    });
  }

  async function markMetaReported(queueRef, at) {
    const key = queueKey(queueRef.exhibitor, queueRef.game);
    await mutateStore((next) => {
      next.meta[key] = Math.floor(at);
    });
  }

  async function clearDeniedClientState() {
    await mutateStore((next) => {
      next.sessions = {};
      next.pending = [];
      next.meta = {};
    });
    if (pendingRetryTimer) window.clearTimeout(pendingRetryTimer);
    pendingRetryTimer = 0;
    pendingRetryAt = 0;
    pendingRetryAttempt = 0;
  }

  const pendingFor = (queueRef) =>
    queueRef
      ? store.pending.find(
          (item) => !pendingExpired(item) && item.exhibitor === queueRef.exhibitor && item.game === queueRef.game
        ) || null
      : null;

  function schedulePendingReplay(delaySeconds = 60) {
    if (!store.pending.some((item) => !pendingExpired(item))) return;
    const backoff = Math.min(300, 30 * 2 ** pendingRetryAttempt);
    const base = Math.max(5, Number(delaySeconds) || 0, backoff);
    /* Retry-After is a floor, not a suggestion. Positive-only jitter spreads
       a venue-wide reconnect without sending any client early. */
    const wait = base + Math.random() * Math.min(30, base * 0.2);
    const targetAt = Date.now() + wait * 1000;
    if (pendingRetryTimer && pendingRetryAt >= targetAt) return;
    if (pendingRetryTimer) window.clearTimeout(pendingRetryTimer);
    pendingRetryAttempt += 1;
    pendingRetryAt = targetAt;
    pendingRetryTimer = window.setTimeout(() => {
      pendingRetryTimer = 0;
      pendingRetryAt = 0;
      replayPending();
    }, Math.max(0, targetAt - Date.now()));
  }

  async function deferEntered(queueRef, active) {
    const seconds = Math.max(1, Math.min(MAX_DEFERRED_SECONDS, elapsed(active)));
    const pending = {
      id: `${queueKey(queueRef.exhibitor, queueRef.game)}:${active.joinedAt}:${seconds}`,
      exhibitor: queueRef.exhibitor,
      game: queueRef.game,
      joinedAt: active.joinedAt,
      elapsed: seconds,
      queuedAt: Math.floor(serverNow()),
    };
    const key = queueKey(queueRef.exhibitor, queueRef.game);
    await mutateStore((next) => {
      if (!next.pending.some((item) => item.id === pending.id)) next.pending.push(pending);
      if (Number(next.sessions[key]?.joinedAt) === Number(active.joinedAt)) delete next.sessions[key];
    });
    schedulePendingReplay();
    notify("report", { kind: "entered", queue: queueRef, queued: true });
    return { queued: true };
  }

  async function reportUnlocked(queueRef, kind, values = {}) {
    store = latestStore();
    if (!queueRef || !validQueues.has(queueKey(queueRef.exhibitor, queueRef.game))) {
      throw new Error("unknown queue");
    }
    if (kind === "joined" && pendingFor(queueRef)) {
      const error = new Error("completion_pending");
      error.code = "completion_pending";
      throw error;
    }
    const active = session(queueRef);
    if (!canReport()) {
      if (kind === "entered" && active) {
        return await deferEntered(queueRef, active);
      }
      if (kind === "left" && active) {
        await closeLocal(queueRef, active.joinedAt);
        notify("report", { kind, queue: queueRef, dropped: true });
        return { dropped: true, local: true };
      }
      return { dropped: true, offline: true };
    }

    let payload;
    try {
      payload = await post(queueRef, { kind, ...values });
    } catch (error) {
      /* navigator.onLine commonly remains true in a dead exhibition hall.
         Give the write one real attempt, then preserve only the measured
         completion; every other stale fact remains deliberately unqueued. */
      const retryable =
        !error.status ||
        error.status === 429 ||
        error.status >= 500 ||
        error.code === "writes_paused";
      if (retryable && kind === "entered" && active) return await deferEntered(queueRef, active);
      if (retryable && kind === "left" && active) {
        await closeLocal(queueRef, active.joinedAt);
        notify("report", { kind, queue: queueRef, dropped: true });
        return { dropped: true, local: true };
      }
      if (
        active &&
        (error.code === "no_open_session" || error.code === "session_already_closed")
      ) {
        await closeLocal(queueRef, active.joinedAt);
        notify("session-expired", { queue: queueRef });
      } else if (error.code === "client_denied") {
        /* Moderation deletes every server row for this stable client id. Keep
           the id (otherwise denial is trivial to evade), but remove local
           timers and tombstones that can no longer be reconciled. */
        await clearDeniedClientState();
        notify("session-expired", { queue: queueRef });
      } else if (kind === "meta" && error.code === "meta_already_reported") {
        /* A vote this device does not remember casting — storage cleared, or a
           second tab that got there first. Take the server's word for it and
           back-date the record by what Retry-After says is left to run, so the
           offer disappears here too instead of failing the same way again. */
        const remaining = Math.min(META_WINDOW_SECONDS, Number(error.retryAfter) || META_WINDOW_SECONDS);
        await markMetaReported(queueRef, Math.floor(serverNow()) - (META_WINDOW_SECONDS - remaining));
        notify("meta-refused", { queue: queueRef });
      }
      throw error;
    }
    const key = queueKey(queueRef.exhibitor, queueRef.game);
    if (kind === "joined") {
      const joinedAt = Number(payload.joinedAt);
      if (!Number.isFinite(joinedAt) || joinedAt <= 0) throw new Error("joined response missing joinedAt");
      await mutateStore((next) => {
        /* The Worker closes every other open session for this device when a
           join lands, so the local store follows it rather than keeping timers
           running for lines this device is no longer standing in. */
        for (const other of Object.keys(next.sessions)) {
          if (other !== key) delete next.sessions[other];
        }
        next.sessions[key] = {
          exhibitor: queueRef.exhibitor,
          game: queueRef.game,
          joinedAt: Math.floor(joinedAt),
          lastAhead: Number.isFinite(Number(values.ahead)) ? Number(values.ahead) : null,
          lastInteractionAt: Math.floor(serverNow()),
          lastServerAt: Math.floor(Number(payload.serverAt) || joinedAt),
        };
      });
    } else if (kind === "update" && active) {
      await mutateStore((next) => {
        const current = next.sessions[key];
        if (!current || Number(current.joinedAt) !== Number(active.joinedAt)) return;
        current.lastInteractionAt = Math.floor(serverNow());
        if (Number.isFinite(Number(values.ahead))) current.lastAhead = Number(values.ahead);
        if (Number.isFinite(Number(payload.serverAt))) current.lastServerAt = Number(payload.serverAt);
      });
    } else if ((kind === "entered" || kind === "left") && active) {
      await closeLocal(queueRef, active?.joinedAt ?? null);
    } else if (kind === "meta") {
      await markMetaReported(queueRef, Math.floor(Number(payload.serverAt) || serverNow()));
    }
    notify("report", { kind, queue: queueRef });
    return payload;
  }

  async function report(queueRef, kind, values = {}) {
    /* The server intentionally identifies a session by client + queue. Keep
       all tabs on this origin in one report order so a late response cannot
       overwrite or complete a newer session. */
    return withLock(REPORT_LOCK, () => reportUnlocked(queueRef, kind, values));
  }

  async function removePending(id) {
    return mutateStore((next) => {
      const length = next.pending.length;
      next.pending = next.pending.filter((item) => item.id !== id);
      return next.pending.length !== length;
    });
  }

  async function replayPendingUnlocked() {
    /* A completion can reconnect after midnight on the final show day. The
       Worker validates the stored server anchor and rejects reports outside
       its retention window, so local calendar visibility must not strand it. */
    store = latestStore();
    let changed = false;
    const rejected = [];
    for (const item of [...store.pending]) {
      if (!pendingExpired(item) && validQueues.has(queueKey(item.exhibitor, item.game))) continue;
      rejected.push({ code: "deferred_rejected" });
      changed = (await removePending(item.id)) || changed;
    }
    if (navigator.onLine === false || !store.pending.length) {
      if (changed) notify("replay", { rejected });
      return null;
    }
    for (const snapshot of [...store.pending]) {
      store = latestStore();
      const item = store.pending.find((candidate) => candidate.id === snapshot.id);
      if (!item) continue;
      const queueRef = queue(item.exhibitor, item.game);
      if (!queueRef) {
        changed = (await removePending(item.id)) || changed;
        continue;
      }
      try {
        await post(queueRef, {
          kind: "entered",
          deferred: true,
          joinedAt: item.joinedAt,
          elapsed: item.elapsed,
        });
        changed = (await removePending(item.id)) || changed;
      } catch (error) {
        const retryable =
          !error.status ||
          error.status === 429 ||
          error.status >= 500 ||
          error.code === "writes_paused";
        if (retryable) {
          schedulePendingReplay(error.retryAfter || 60);
          break;
        }
        /* A permanently invalid deferred report must not retry forever. */
        rejected.push({
          code: error.code === "client_denied" ? "client_denied" : "deferred_rejected",
          status: error.status || 0,
        });
        if (error.code === "client_denied") {
          await clearDeniedClientState();
          changed = true;
          break;
        }
        changed = (await removePending(item.id)) || changed;
      }
    }
    if (changed) {
      notify("replay", { rejected });
      refresh({ force: true });
    }
    if (!store.pending.length && pendingRetryTimer) {
      window.clearTimeout(pendingRetryTimer);
      pendingRetryTimer = 0;
      pendingRetryAt = 0;
    }
    if (!store.pending.length) pendingRetryAttempt = 0;
    return null;
  }

  async function replayPending() {
    if (replayRequest) return replayRequest;
    replayRequest = withLock(REPORT_LOCK, replayPendingUnlocked);
    try {
      return await replayRequest;
    } finally {
      replayRequest = null;
    }
  }

  function onFocus() {
    notify("focus");
    if (document.visibilityState !== "hidden") {
      replayPending();
      refresh({ force: true });
    }
  }

  function pause() {
    if (isPaused) return;
    /* What this deliberately does not stop: replayPending() and the retry
       timer behind it. That is the visitor's own report trying to reach the
       server, it backs off to a 300-second ceiling, and it clears itself once
       nothing is pending. Saving a radio wake must not cost somebody the
       report they already made. */
    window.clearInterval(pollTimer);
    window.clearInterval(tickTimer);
    pollTimer = 0;
    tickTimer = 0;
    isPaused = true;
    notify("pause");
  }

  function resume() {
    if (!isPaused) return;
    isPaused = false;
    if (started) {
      pollTimer = window.setInterval(() => refresh(), POLL_MS);
      tickTimer = window.setInterval(() => notify("tick"), TICK_MS);
    }
    notify("resume");
    refresh({ force: true, manual: true });
  }

  const paused = () => isPaused;

  function start() {
    if (started) return;
    started = true;
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") onFocus();
    });
    window.addEventListener("online", () => {
      notify("connection");
      replayPending();
      refresh({ force: true });
    });
    window.addEventListener("offline", () => {
      markFailed();
      notify("focus");
    });
    window.addEventListener("storage", (event) => {
      if (event.key !== null && event.key !== STORAGE_KEY) return;
      store = readStore();
      notify("storage");
      if (store.pending.length && navigator.onLine !== false) replayPending();
    });
    if (!isPaused) {
      pollTimer = window.setInterval(() => refresh(), POLL_MS);
      tickTimer = window.setInterval(() => notify("tick"), TICK_MS);
    }
    notify("start");
    replayPending();
    /* livePayload is memory-only. A paused boot still fetches once so it has
       a figure to hold stale instead of leaving every live surface blank. */
    refresh({ force: true, manual: true });
  }

  return {
    STORAGE_KEY,
    BOOTH,
    configure,
    start,
    queue,
    queueKey,
    queuesFor,
    visible,
    showOpen,
    connected,
    canReport,
    live,
    worst,
    session,
    sessions,
    metaReported,
    elapsed,
    promptCandidate,
    report,
    refresh,
    pause,
    resume,
    paused,
    replayPending,
    pendingCount: () => store.pending.filter((item) => !pendingExpired(item)).length,
    pendingFor,
    unavailable,
  };
})();

/* Unlike a top-level `var`, a classic-script `const` is not reflected as a
   window property. Export it explicitly so app.js can feature-detect the
   module across mixed service-worker versions. */
window.GCQueues = GCQueues;
