export const CLAIMED_BUCKETS = Object.freeze([0, 10, 20, 30, 45, 60, 90, 120]);
export const AHEAD_BUCKETS = Object.freeze([10, 20, 30, 50, 75, 100, 150, 200]);
export const BATCH_BUCKETS = Object.freeze([2, 5, 10, 20, 50, 100]);
export const QUEUE_TYPES = Object.freeze(["single", "pairs", "group", "wave"]);
export const BOOTH_QUEUE = "_booth";

export const normalizeGameKey = (title) =>
  String(title).trim().toLowerCase().replace(/\s+/g, " ");

export const queueToken = (exhibitor, game) => JSON.stringify([exhibitor, game]);

/** Build the exact queue vocabulary deployed with the site data. */
export function buildQueueAllowlist(exhibitors) {
  const queues = new Map();
  for (const exhibitor of Array.isArray(exhibitors) ? exhibitors : []) {
    if (
      !exhibitor ||
      exhibitor.type === "trade" ||
      (Array.isArray(exhibitor.tags) && exhibitor.tags.includes("not exhibiting")) ||
      typeof exhibitor.id !== "string"
    ) continue;
    const playable = (Array.isArray(exhibitor.games) ? exhibitor.games : []).filter(
      (game) => game?.playable === true && typeof game.title === "string"
    );
    if (playable.length === 0) {
      const queue = { exhibitor: exhibitor.id, game: BOOTH_QUEUE };
      queues.set(queueToken(queue.exhibitor, queue.game), queue);
      continue;
    }
    for (const game of playable) {
      const queue = { exhibitor: exhibitor.id, game: normalizeGameKey(game.title) };
      queues.set(queueToken(queue.exhibitor, queue.game), queue);
    }
  }
  return queues;
}

function clockParts(epochSeconds, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(epochSeconds * 1000));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    minute: Number(values.hour) * 60 + Number(values.minute) + Number(values.second) / 60,
  };
}

function parseClock(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function dayWindow(day) {
  const starts = [];
  const closes = [];
  const publicStart = parseClock(day?.open);
  const publicClose = parseClock(day?.close);
  if (publicStart !== null) starts.push(publicStart);
  if (publicClose !== null) closes.push(publicClose);

  const businessTimes = String(day?.business || "").match(/\d{1,2}:\d{2}/g) || [];
  const businessStart = parseClock(businessTimes[0]);
  const businessClose = parseClock(businessTimes[1]);
  if (businessStart !== null) starts.push(businessStart);
  if (businessClose !== null) closes.push(businessClose);

  if (starts.length === 0 || closes.length === 0) return null;
  return { start: Math.min(...starts) - 30, close: Math.max(...closes) + 30 };
}

function epochForZonedMinute(date, minute, timeZone) {
  const [year, month, day] = String(date).split("-").map(Number);
  if (![year, month, day, minute].every(Number.isFinite)) return null;
  const desired = Date.UTC(year, month - 1, day, Math.floor(minute / 60), minute % 60) / 1000;
  let guess = desired;
  /* Intl exposes the zone conversion in one direction. Iterating the observed
     wall-clock delta gives the inverse without baking in Berlin's UTC offset
     or assuming it never changes. Event close is not in a DST fold. */
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const shown = clockParts(guess, timeZone);
    const [shownYear, shownMonth, shownDay] = shown.date.split("-").map(Number);
    const shownMinute = Math.floor(shown.minute);
    const shownEpoch = Date.UTC(
      shownYear,
      shownMonth - 1,
      shownDay,
      Math.floor(shownMinute / 60),
      shownMinute % 60
    ) / 1000;
    guess += desired - shownEpoch;
  }
  return guess;
}

export function deferredReceiptDeadline(event) {
  const days = Array.isArray(event?.days) ? [...event.days].sort((a, b) => a.date.localeCompare(b.date)) : [];
  const last = days.at(-1);
  const window = dayWindow(last);
  if (!last || !window) return null;
  const close = epochForZonedMinute(last.date, window.close, event.timeZone || "Europe/Berlin");
  return close === null ? null : close + 24 * 60 * 60;
}

/**
 * Classify an instant against the event in its own IANA time zone.
 * `phase` is stable enough for routing: only `after` maps to HTTP 410.
 */
export function eventAccess(event, epochSeconds) {
  const days = Array.isArray(event?.days) ? [...event.days].sort((a, b) => a.date.localeCompare(b.date)) : [];
  if (days.length === 0) return { allowed: false, phase: "closed" };
  const timeZone = event.timeZone || "Europe/Berlin";
  const now = clockParts(epochSeconds, timeZone);
  const first = days[0].date;
  const last = days.at(-1).date;
  if (now.date < first) return { allowed: false, phase: "before", date: now.date, timeZone };
  if (now.date > last) return { allowed: false, phase: "after", date: now.date, timeZone };

  const day = days.find((candidate) => candidate.date === now.date);
  if (!day) return { allowed: false, phase: "closed", date: now.date, timeZone };
  const window = dayWindow(day);
  if (!window) return { allowed: false, phase: "closed", date: now.date, timeZone };
  if (now.minute < window.start) {
    return { allowed: false, phase: "before", date: now.date, timeZone, ...window };
  }
  if (now.minute > window.close) {
    return {
      allowed: false,
      phase: now.date === last ? "after" : "closed",
      date: now.date,
      timeZone,
      ...window,
    };
  }
  return { allowed: true, phase: "open", date: now.date, timeZone, ...window };
}

export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function upperQuartile(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.75) - 1)];
}

/* The longest show day is eleven hours and the worst real gamescom queues run to
   about three, so anything past this ceiling is arithmetic rather than a queue.
   The flow tier is what reaches it: a single slow pair — one bucket step across
   forty minutes is 0.25 people/min — divided into a long line yields figures
   like 675 minutes, which the card would happily print as "Live: ~675 min" on a
   ten-hour show day.

   Hence two different treatments below. A *derived* figure past the ceiling is
   discarded, because its divisor is the thing at fault and a measured tier is
   the better answer. A *measured* one is merely clamped: a genuine four-hour
   wait should read as "4 h+", not vanish. */
export const MAX_ESTIMATE_MINUTES = 240;

const roundFive = (minutes) => Math.max(0, Math.round(minutes / 5) * 5);

/* Carries the clamp in the payload rather than leaving the client to compare
   against a copy of the ceiling — a duplicated constant that drifts is exactly
   how "4 h+" would silently become a flat "240 min" one deploy later. */
function measuredMinutes(minutes) {
  const rounded = roundFive(minutes);
  return rounded > MAX_ESTIMATE_MINUTES ? { est: MAX_ESTIMATE_MINUTES, capped: true } : { est: rounded };
}

function groupByQueue(rows) {
  const groups = new Map();
  for (const row of rows || []) {
    const key = queueToken(row.exhibitor, row.game);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

function mechanicsFor(rows) {
  if (!rows?.length) return null;
  const votes = new Map();
  for (const row of rows) {
    const vote = votes.get(row.qtype) || { count: 0, newest: 0, batches: [] };
    vote.count += 1;
    vote.newest = Math.max(vote.newest, Number(row.reported_at));
    if (row.batch !== null && row.batch !== undefined) vote.batches.push(Number(row.batch));
    votes.set(row.qtype, vote);
  }
  const winner = [...votes.entries()].sort(
    ([typeA, a], [typeB, b]) => b.count - a.count || b.newest - a.newest || typeA.localeCompare(typeB)
  )[0];
  if (!winner) return null;
  const [qtype, vote] = winner;
  const batchValue = median(vote.batches);
  return {
    qtype,
    ...(batchValue === null ? {} : { batch: Math.round(batchValue) }),
    metaN: vote.count,
    metaNewest: vote.newest,
  };
}

function addNested(output, exhibitor, game, value) {
  if (!output[exhibitor]) output[exhibitor] = {};
  output[exhibitor][game] = value;
}

/**
 * Pure estimator. Every row timestamp is an integer epoch second and all
 * rolling-window filtering has already happened in the database query.
 */
export function estimateLive(input, now) {
  const initials = groupByQueue(input.initial || []);
  const completed = groupByQueue(input.completed || []);
  const open = groupByQueue(input.open || []);
  const closures = groupByQueue(input.closures || []);
  const counters = groupByQueue(input.counters || []);
  const metadata = groupByQueue(input.meta || []);
  const overrides = new Map(
    (input.overrides || []).map((row) => [queueToken(row.exhibitor, row.game), row])
  );

  const speedSamples = new Map();
  const updatesBySession = new Map();
  for (const row of input.speedUpdates || []) {
    if (!updatesBySession.has(row.session)) updatesBySession.set(row.session, []);
    updatesBySession.get(row.session).push(row);
  }
  for (const rows of updatesBySession.values()) {
    rows.sort((a, b) => Number(a.reported_at) - Number(b.reported_at));
    const sessionSpeeds = [];
    let newest = 0;
    for (let index = 1; index < rows.length; index += 1) {
      const before = rows[index - 1];
      const after = rows[index];
      const elapsed = Number(after.reported_at) - Number(before.reported_at);
      const beforeAhead = Number(before.ahead);
      const afterAhead = Number(after.ahead);
      if (
        elapsed < 180 ||
        beforeAhead === 200 ||
        afterAhead === 200 ||
        beforeAhead <= afterAhead
      ) {
        continue;
      }
      const speed = (beforeAhead - afterAhead) / (elapsed / 60);
      if (!(speed > 0) || speed > 100) continue;
      sessionSpeeds.push(speed);
      newest = Math.max(newest, Number(after.reported_at));
    }
    if (sessionSpeeds.length) {
      const sample = rows.at(-1);
      const key = queueToken(sample.exhibitor, sample.game);
      if (!speedSamples.has(key)) speedSamples.set(key, []);
      speedSamples.get(key).push({
        speed: median(sessionSpeeds),
        session: sample.session,
        at: newest,
      });
    }
  }

  const keys = new Set([
    ...initials.keys(),
    ...speedSamples.keys(),
    ...completed.keys(),
    ...open.keys(),
    ...closures.keys(),
    ...metadata.keys(),
    ...overrides.keys(),
  ]);
  const output = {};

  for (const key of keys) {
    const parsed = JSON.parse(key);
    const [exhibitor, game] = parsed;
    const mechanics = mechanicsFor(metadata.get(key));
    const closureRows = closures.get(key) || [];
    const closureByClient = new Map();
    for (const row of closureRows) {
      const previous = closureByClient.get(row.client);
      if (!previous || Number(row.reported_at) > Number(previous.reported_at)) {
        closureByClient.set(row.client, row);
      }
    }
    const closureVotes = [...closureByClient.values()];
    const newestClosure = closureVotes.length
      ? Math.max(...closureVotes.map((row) => Number(row.reported_at)))
      : null;

    /* Rebutting a closure claim takes two devices, the same quorum making it.
       Only a *new arrival* counts, and only after the newest claim.

       The rule this replaced compared the closure timestamps against the median
       of every client's newest activity in the hour. That median is dragged
       backwards by everyone who finished their session earlier in the window —
       so on a busy queue with normal turnover, two devices could flip it to
       "Queue closed", which is the highest-consequence thing this feature can
       say: it tells people not to walk across two halls.

       Kind matters, and conflating them is why the first attempt read false.
       At gamescom a closed queue is closed *to new entrants* — the line already
       standing there keeps being served — so `update` and `entered` from people
       inside it are exactly what a genuine closure looks like, not evidence
       against it. Someone newly joining is the observation that contradicts the
       sign. A claimant's own activity never rebuts their own claim.

       Residual exposure, accepted knowingly: on a queue quiet enough that two
       people do not join within the hour, two coordinated devices can still
       show it closed. Closure votes age out after an hour, the moderator has
       Force open, and a quiet queue is the cheap walk to be wrong about. */
    const rebuttals = new Set();
    for (const row of counters.get(key) || []) {
      if (row.kind !== "joined") continue;
      if (closureByClient.has(row.client)) continue;
      if (newestClosure !== null && Number(row.at) > newestClosure) rebuttals.add(row.client);
    }
    const automaticClosed = closureVotes.length >= 2 && rebuttals.size < 2;
    const override = overrides.get(key);
    const overrideActive = override && Number(override.expires_at) > now;
    const closed = overrideActive ? Number(override.forced_closed) === 1 : automaticClosed;

    if (closed) {
      const value = {
        closed: true,
        n: closureVotes.length,
        newest: overrideActive
          ? Number(override.updated_at)
          : Math.max(...closureVotes.map((row) => Number(row.reported_at))),
      };
      if (mechanics) {
        value.qtype = mechanics.qtype;
        if (mechanics.batch !== undefined) value.batch = mechanics.batch;
      }
      addNested(output, exhibitor, game, value);
      continue;
    }

    let value = null;
    const lengthRows = initials.get(key) || [];
    const speeds = speedSamples.get(key) || [];
    const length = median(lengthRows.map((row) => Number(row.ahead)));
    const speed = median(speeds.map((row) => row.speed));
    /* Tried in order, each falling through when it has nothing to say — so an
       implausible flow projection defers to a measured tier instead of being
       published, which a plain if/else chain could not express. */
    if (length !== null && speed !== null && speed > 0) {
      const projected = roundFive(length / speed);
      if (projected <= MAX_ESTIMATE_MINUTES) {
        const sessions = new Set([
          ...lengthRows.map((row) => String(row.session)),
          ...speeds.map((row) => String(row.session)),
        ]);
        value = {
          est: projected,
          how: "flow",
          n: sessions.size,
          newest: Math.max(
            ...lengthRows.map((row) => Number(row.reported_at)),
            ...speeds.map((row) => row.at)
          ),
        };
      }
    }
    if (!value) {
      const doneRows = completed.get(key) || [];
      if (doneRows.length) {
        value = {
          ...measuredMinutes(
            median(doneRows.map((row) => Number(row.closed_at) - Number(row.joined_at))) / 60
          ),
          how: "done",
          n: new Set(doneRows.map((row) => String(row.session))).size,
          newest: Math.max(...doneRows.map((row) => Number(row.closed_at))),
        };
      }
    }
    if (!value) {
      const openRows = open.get(key) || [];
      if (openRows.length) {
        value = {
          /* "sofar" already reads "{n}+ min so far", so the clamp needs no
             separate wording here — it only lowers the floor it states. */
          est: measuredMinutes(
            upperQuartile(openRows.map((row) => Math.max(0, now - Number(row.joined_at)))) / 60
          ).est,
          how: "sofar",
          n: new Set(openRows.map((row) => String(row.session))).size,
          newest: Math.max(...openRows.map((row) => Number(row.updated_at))),
        };
      }
    }

    if (!value && mechanics) {
      value = { n: mechanics.metaN, newest: mechanics.metaNewest };
    }
    if (!value) continue;
    if (mechanics) {
      value.qtype = mechanics.qtype;
      if (mechanics.batch !== undefined) value.batch = mechanics.batch;
    }
    addNested(output, exhibitor, game, value);
  }

  return output;
}
