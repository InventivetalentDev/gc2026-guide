#!/usr/bin/env node
/* Everything the queue API takes from the site data, as one hash.
 *
 *   node tools/api-fingerprint.mjs data/exhibitors.json data/event.json
 *
 * The Worker bundles those two files (see the imports at the top of
 * worker/index.js), so a change to either technically changes the Worker. But
 * it reads almost none of what is in them: the exhibitor list becomes a queue
 * allowlist, and the event becomes a show calendar. A booth number, a game
 * description, a new `aka` short form, a whole trade-only exhibitor — none of
 * it survives into anything the Worker can act on, and an API built from the
 * edited file answers every request byte-for-byte as the one already running.
 *
 * .github/workflows/cloudflare-preview.yml runs this on both sides of a pull
 * request and compares. Equal hashes mean the pull request has no API to
 * preview, however much of data/ it touched. See "Should this PR get an API
 * preview?" there.
 *
 * Deliberately dependency-free, and it imports worker/core.js rather than
 * restating what a queue identity is: the allowlist is the Worker's own, so
 * a change to how it is derived changes this fingerprint too, which is the
 * behaviour you want. Plain `node`, no npm install.
 */

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { buildQueueAllowlist } from "../worker/core.js";

const [exhibitorsPath, eventPath] = process.argv.slice(2);
if (!exhibitorsPath || !eventPath) {
  console.error("usage: api-fingerprint.mjs <exhibitors.json> <event.json>");
  process.exit(2);
}

const read = (path) => JSON.parse(readFileSync(path, "utf8"));

/* Sorted, because the allowlist is a set: reordering data/exhibitors.json
   moves no queue and must not read as a change. */
const queues = [...buildQueueAllowlist(read(exhibitorsPath)).keys()].sort();

/* The four per-day fields dayWindow() and showAccess() actually parse, plus
   the zone they are read in. Kept in step with worker/core.js — an added
   field the Worker starts reading belongs here too, or a change to it will
   skip its own preview. */
const event = read(eventPath);
const calendar = {
  timeZone: event?.timeZone ?? null,
  days: (Array.isArray(event?.days) ? event.days : [])
    .map((day) => [day?.date ?? null, day?.open ?? null, day?.close ?? null, day?.business ?? null])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
};

process.stdout.write(
  `${createHash("sha256").update(JSON.stringify({ queues, calendar })).digest("hex")}\n`
);
