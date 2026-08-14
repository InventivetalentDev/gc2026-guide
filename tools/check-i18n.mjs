#!/usr/bin/env node
/* Verify the translations against the English source.
 *
 *   node tools/check-i18n.mjs            check, exit 1 on any error
 *   node tools/check-i18n.mjs --update   re-record the staleness hashes
 *
 * tools/build-site.sh runs this before staging dist/, so a deploy carrying
 * a missing or stale German string fails loudly rather than shipping a
 * half-translated page — the same spirit as that script's unclassified-file
 * check. Node ≥18, no dependencies (tools/fetch-hallplan.mjs already
 * requires node).
 *
 * Five classes of error:
 *   1. key parity          — every en key exists in de, and nothing extra
 *   2. plural parity       — an en "one|other" string is plural in de too
 *   3. placeholder parity  — the same {name} set on both sides
 *   4. referential         — data keys point at things the base data has
 *   5. staleness           — the English changed after the German was written
 *
 * (5) is what keeps a fast editorial cycle honest: data/i18n/en.json is
 * hand-edited every few days, and without a tripwire the German silently
 * describes last week's booth. tools/i18n-hashes.json records the English
 * each German string was translated from; --update re-stamps it once the
 * German has actually been revisited.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = "en";
const HASH_FILE = join(root, "tools", "i18n-hashes.json");

/* Tags the code tests against rather than only displaying — they must keep
   their raw spelling in data/exhibitors.json. They still get a translated
   label; this list only records that the raw value is load-bearing, so a
   future rename gets a second look. See isAbsent/isOffsite in js/app.js. */
const CODE_TAGS = ["not exhibiting", "offsite"];

const errors = [];
const warnings = [];
const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

const readJSON = (rel) => JSON.parse(readFileSync(join(root, rel), "utf8"));

/* The UI registries are plain scripts assigning onto window.GC_STRINGS, so
   they are evaluated with a stub rather than parsed — no bundler, matching
   how the browser actually loads them. */
function readRegistries() {
  const window = { GC_STRINGS: {} };
  for (const lang of ["en", "de"]) {
    const src = readFileSync(join(root, "js", "i18n", `${lang}.js`), "utf8");
    new Function("window", src)(window);
  }
  return window.GC_STRINGS;
}

const placeholders = (s) =>
  [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

/* FNV-1a, the same hash js/app.js uses for share tokens — short, stable
   across runs, and its only job here is "did this string change". */
function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/* Every translatable string in one flat map, so the UI registry and the
   data overlay can be checked and hashed the same way. */
function flatten(value, prefix, out) {
  if (typeof value === "string") out.set(prefix, value);
  else if (Array.isArray(value)) value.forEach((v, i) => flatten(v, `${prefix}[${i}]`, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  }
  return out;
}

/* ---------- 1–3: parity between the source and each translation ---------- */

function checkParity(label, source, target, lang) {
  for (const [key, en] of source) {
    const translated = target.get(key);
    if (translated === undefined) {
      fail(`${label}: ${lang} is missing "${key}"`);
      continue;
    }
    if (translated === "") continue; // deliberately empty, e.g. en-only notes
    if (en.includes("|") !== translated.includes("|")) {
      fail(
        `${label}: "${key}" has ${en.includes("|") ? "two plural forms in en but one" : "one form in en but two"} in ${lang}`
      );
    }
    /* Compared per plural form: "{n} item|{n} items" and a German form that
       drops {n} from the singular would otherwise pass on the joined string. */
    const enParts = en.split("|");
    const deParts = translated.split("|");
    if (enParts.length === deParts.length) {
      enParts.forEach((part, i) => {
        if (placeholders(part) !== placeholders(deParts[i])) {
          fail(
            `${label}: "${key}" uses {${placeholders(part) || "none"}} in en but {${
              placeholders(deParts[i]) || "none"
            }} in ${lang}`
          );
        }
      });
    }
  }
  for (const key of target.keys()) {
    if (!source.has(key)) fail(`${label}: ${lang} has "${key}", which is not in ${SOURCE}`);
  }
}

/* ---------- 4: the data overlay must describe data that exists ---------- */

function checkReferences(strings, exhibitors, event) {
  const byId = new Map(exhibitors.map((ex) => [ex.id, ex]));

  for (const [id, entry] of Object.entries(strings.exhibitors || {})) {
    const ex = byId.get(id);
    if (!ex) {
      fail(`data: "${id}" has prose but is not in data/exhibitors.json`);
      continue;
    }
    const titles = new Set((ex.games || []).map((g) => g.title));
    for (const title of Object.keys(entry.games || {})) {
      /* The rot this catches: a game title corrected in the base data
         orphans its note, which would then silently never render. */
      if (!titles.has(title)) {
        fail(`data: "${id}" has a note for "${title}", which is not in its lineup`);
      }
    }
  }
  for (const ex of exhibitors) {
    if (!strings.exhibitors?.[ex.id]) fail(`data: "${ex.id}" has no prose entry`);
  }

  const dates = new Set((event.days || []).map((d) => d.date));
  for (const date of Object.keys(strings.event?.days || {})) {
    if (!dates.has(date)) fail(`data: event.days has "${date}", which is not a show day`);
  }
  for (const date of dates) {
    if (!strings.event?.days?.[date]) fail(`data: show day "${date}" has no prose`);
  }

  const areas = new Set((event.areas || []).map((a) => a.name));
  for (const name of Object.keys(strings.event?.areas || {})) {
    if (!areas.has(name)) fail(`data: event.areas has "${name}", which is not an area`);
  }
  for (const name of areas) {
    if (!strings.event?.areas?.[name]) fail(`data: area "${name}" has no description`);
  }

  /* Tags are raw identifiers in the base data and translated only for
     display, so every tag in use needs a label to render as. */
  const used = new Set(exhibitors.flatMap((ex) => ex.tags || []));
  for (const tag of used) {
    if (!strings.tags?.[tag]) warn(`data: tag "${tag}" has no display label`);
  }
  for (const tag of Object.keys(strings.tags || {})) {
    if (!used.has(tag)) warn(`data: tag "${tag}" is labelled but no longer used`);
  }
  for (const tag of CODE_TAGS) {
    if (!used.has(tag)) warn(`data: "${tag}" drives rendering logic but no exhibitor carries it`);
  }
}

/* ---------- 5: has the English moved on without the German? ---------- */

function checkStaleness(source, update) {
  let recorded = {};
  try {
    recorded = JSON.parse(readFileSync(HASH_FILE, "utf8")).keys || {};
  } catch {
    /* first run, or the file was removed — --update writes a fresh one */
    if (!update) {
      warn(`no ${HASH_FILE.replace(root + "/", "")} yet — run with --update to record the baseline`);
      return;
    }
  }

  if (update) {
    const keys = {};
    for (const [key, en] of source) keys[key] = hash(en);
    writeFileSync(
      HASH_FILE,
      JSON.stringify(
        {
          note:
            "Hash of each English string as of the last time its translations were confirmed. " +
            "Regenerate with: node tools/check-i18n.mjs --update",
          keys,
        },
        null,
        2
      ) + "\n"
    );
    console.log(`recorded ${source.size} hashes into ${HASH_FILE.replace(root + "/", "")}`);
    return;
  }

  for (const [key, en] of source) {
    const was = recorded[key];
    if (was === undefined) {
      fail(`stale: "${key}" is new — translate it, then run with --update`);
    } else if (was !== hash(en)) {
      fail(`stale: "${key}" changed in ${SOURCE} — re-check the translation, then run with --update`);
    }
  }
}

/* ---------- run ---------- */

const update = process.argv.includes("--update");

const registries = readRegistries();
const dataEN = readJSON("data/i18n/en.json");
const dataDE = readJSON("data/i18n/de.json");
const exhibitors = readJSON("data/exhibitors.json");
const event = readJSON("data/event.json");

const uiSource = flatten(registries[SOURCE], "", new Map());
const dataSource = flatten(dataEN, "", new Map());

checkParity("ui", uiSource, flatten(registries.de, "", new Map()), "de");
checkParity("data", dataSource, flatten(dataDE, "", new Map()), "de");
checkReferences(dataEN, exhibitors, event);
checkReferences(dataDE, exhibitors, event);

/* One namespace so a key can never collide across the two surfaces. */
const everything = new Map();
for (const [k, v] of uiSource) everything.set(`ui:${k}`, v);
for (const [k, v] of dataSource) everything.set(`data:${k}`, v);
checkStaleness(everything, update);

for (const w of warnings) console.warn(`warning: ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`error: ${e}`);
  console.error(`\ncheck-i18n: ${errors.length} error(s)`);
  process.exit(1);
}
if (!update) {
  console.log(
    `check-i18n: ok — ${uiSource.size} UI strings, ${dataSource.size} data strings, ` +
      `${warnings.length} warning(s)`
  );
}
