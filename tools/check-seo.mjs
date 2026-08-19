#!/usr/bin/env node
/* Verify the machine-readable claims in the pages against the data and the
 * files on disk.
 *
 *   node tools/check-seo.mjs             check, exit 1 on any error
 *
 * tools/build-site.sh runs this before staging dist/, in the same spirit as
 * check-i18n.mjs: everything here is a hand-written statement about something
 * that moves, and none of it is visible on screen, so nothing else would ever
 * catch it going wrong. A wrong date in the JSON-LD, an og:image that 404s
 * and a hreflang pointing at a page that no longer exists all look exactly
 * like a working site right up until they are someone's search result.
 *
 * Four classes of error:
 *   1. structured data  — the JSON-LD parses, and its event matches data/event.json
 *   2. referenced files — every local asset named in a meta tag exists
 *   3. hreflang         — each page's set is self-referencing and reciprocal
 *   4. canonical        — every indexable page declares one
 *
 * Node ≥18, no dependencies.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/* The pages that ask to be indexed. imprint.html and privacy.html carry
   <meta name="robots" content="noindex"> and are exempt from all of it. */
const PAGES = ["index.html", "map.html"];
const ORIGIN = "https://hallgui.de";

const errors = [];
const fail = (msg) => errors.push(msg);

const read = (rel) => readFileSync(join(root, rel), "utf8");
const attr = (tag, name) => (tag.match(new RegExp(`${name}="([^"]*)"`)) || [])[1];

/* ---------- 1. structured data ---------- */

const event = JSON.parse(read("data/event.json"));
const index = read("index.html");

const ld = index.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
if (!ld) {
  fail("index.html: no application/ld+json block");
} else {
  let graph;
  try {
    graph = JSON.parse(ld[1])["@graph"] || [];
  } catch (e) {
    fail(`index.html: the JSON-LD does not parse — ${e.message}`);
    graph = [];
  }

  const node = graph.find((n) => n["@type"] === "Event");
  if (!node) {
    fail("index.html: the JSON-LD declares no Event");
  } else {
    if (node.name !== event.name) {
      fail(`JSON-LD Event name is "${node.name}", data/event.json says "${event.name}"`);
    }

    /* The show opens at whichever comes first on the opening day, the trade
       hours or the public ones, and closes when the last day does. Both are
       CEST — Germany is on summer time through August, every year. */
    const days = event.days || [];
    const first = days[0] || {};
    const last = days[days.length - 1] || {};
    const businessOpen = (String(first.business || "").match(/^(\d{2}:\d{2})/) || [])[1];
    const opensAt = [businessOpen, first.open].filter(Boolean).sort()[0];
    const expected = {
      startDate: `${event.startDate}T${opensAt}:00+02:00`,
      endDate: `${event.endDate}T${last.close}:00+02:00`,
    };
    for (const [key, want] of Object.entries(expected)) {
      if (node[key] !== want) {
        fail(`JSON-LD Event ${key} is "${node[key]}", data/event.json works out to "${want}"`);
      }
    }

    /* event.json spells the venue "Koelnmesse, Cologne"; the Place splits it
       into a name and a locality, so check both halves are still in there
       rather than comparing one string to the other. */
    const place = node.location || {};
    const locality = (place.address || {}).addressLocality || "";
    for (const part of String(event.location).split(",").map((s) => s.trim())) {
      if (place.name !== part && locality !== part) {
        fail(`JSON-LD Place has no "${part}" — data/event.json says "${event.location}"`);
      }
    }
  }
}

/* ---------- 2, 3, 4. per page ---------- */

const alternatesFor = (html) =>
  [...html.matchAll(/<link\s+rel="alternate"\s+hreflang="([^"]+)"\s+href="([^"]+)"\s*\/?>/g)].map(
    ([, hreflang, href]) => ({ hreflang, href })
  );

for (const page of PAGES) {
  const html = read(page);
  const self = `${ORIGIN}/${page === "index.html" ? "" : page}`;

  /* 2. Anything named as an absolute URL on our own origin has to be a file
     we actually ship. An og:image that 404s is an unfurl with a blank box in
     it, and nothing in the page will ever look wrong. */
  for (const tag of html.match(/<meta\s+property="og:[^>]*>/g) || []) {
    const value = attr(tag, "content") || "";
    if (!value.startsWith(`${ORIGIN}/`)) continue;
    const rel = value.slice(ORIGIN.length + 1).split("?")[0];
    if (rel && !rel.endsWith("/") && !existsSync(join(root, rel)) && !PAGES.includes(rel)) {
      fail(`${page}: ${attr(tag, "property")} points at ${rel}, which is not in the repo`);
    }
  }

  /* 3. Google acts on an hreflang set only when every variant names every
     other one, itself included. A set that omits self is silently ignored. */
  const alternates = alternatesFor(html);
  if (!alternates.length) {
    fail(`${page}: no <link rel="alternate" hreflang> — the German edition would be unreachable`);
  } else {
    if (!alternates.some((a) => a.href === self)) {
      fail(`${page}: the hreflang set never names ${self}, so it is not self-referencing`);
    }
    for (const code of ["en", "de", "x-default"]) {
      if (!alternates.some((a) => a.hreflang === code)) {
        fail(`${page}: the hreflang set has no "${code}"`);
      }
    }
    for (const { href } of alternates) {
      if (!href.startsWith(`${ORIGIN}/`)) {
        fail(`${page}: hreflang href "${href}" is not absolute on ${ORIGIN}`);
      }
    }
  }

  /* 4. Four hostnames serve this file (wrangler.toml). Without a canonical
     they are four copies of the site competing with each other. */
  const canonical = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
  if (canonical !== self) {
    fail(`${page}: canonical is "${canonical}", expected "${self}"`);
  }
}

if (errors.length) {
  for (const e of errors) console.error(`check-seo: ${e}`);
  process.exit(1);
}
console.log(`check-seo: ok — ${PAGES.length} indexable pages, structured data matches data/event.json`);
