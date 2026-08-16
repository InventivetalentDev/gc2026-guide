/* Snapshot booth geometry for the hall map from Koelnmesse's exhibitor
   database — the same unauthenticated endpoint the official interactive
   hall plan (https://exhibitors.gamescom.global/en/gamescom-exhibitors/hall-plan/)
   loads its data from:

     POST /global/asdb.php?…route=hallenplan2/api&halle=<H>&level=<L>

   Per hall level it returns booth polygons in metres, booth numbers and
   exhibitor names. This tool trims that to what the map renders — no
   logos, no duplicated exhibitor records, no session junk — and writes
   one static JSON per hall level plus an index:

     data/hallplan/index.json
     data/hallplan/hall-<id>.json      e.g. hall-7.1.json

   data/hallplan/entrances.json is the exception in that directory: it is
   hand-authored and this tool neither reads nor writes it. The endpoint
   files blocks and stands and nothing else — no wall, no doorway — so
   where a hall opens onto the Boulevard or into its neighbour is not
   ours to snapshot. Re-running this leaves that file alone.

   Run it from anywhere (no dependencies):

     node tools/fetch-hallplan.mjs             # re-snapshot, then report
     node tools/fetch-hallplan.mjs --report    # report on the committed snapshot

   It fetches all halls first and only writes when every one validated,
   so a broken or changed endpoint leaves the last committed snapshot in
   place. Re-run it when Koelnmesse revises the layout — the join report
   it prints at the end (guide exhibitors → official stands) is a QA aid
   only; nothing from exhibitors.json is baked into the output. The map
   joins by hall + booth code at runtime, so booth edits in
   data/exhibitors.json move highlights without re-running this.

   Each hall also carries the area it belongs to — entertainment or
   business — and the index repeats the area colours the official plan
   paints those halls with, so the map can tell a hall a consumer ticket
   opens from one it does not.

   Coordinates: the endpoint's polygons live in a per-hall metre frame
   with hall-specific mirror/rotation quirks. We replicate the official
   renderer's transform (its buildLatLangs()) so our halls match the
   official plan's orientation — but only its SIGNS and rotation. The
   official map also scales each hall by fudge factors (scalex −1.06,
   scaley 0.75, …) to squeeze it onto their campus artwork; we drop the
   magnitudes so halls keep their true aspect ratio in metres. */

const SOURCE =
  "https://exhibitors.gamescom.global/global/asdb.php" +
  "?sV=0480&sJ=2026&sS=3&route=hallenplan2/api&useNoSession=1&fw_ajax=1";

/* The page that endpoint belongs to: the map credits it, and the area
   colours are checked against it (see checkAreaColours). */
const PLAN_PAGE = "https://exhibitors.gamescom.global/en/gamescom-exhibitors/hall-plan/";

/* Guide hall id → official (halle, level, area). The guide's "10.2" is
   Koelnmesse's hall 10, upper storey — verified against live data
   (Xbox A061 in 7/1, Bilibili A-090 in 10/1, Razer E-020 D-021 in 10/2).

   Order is the order of the map's hall row: the entertainment halls a
   consumer ticket opens first, the trade-only business halls after. */
const HALLS = {
  "5.2": ["5", "2", "entertainment"],
  "6.1": ["6", "1", "entertainment"],
  "7.1": ["7", "1", "entertainment"],
  "8.1": ["8", "1", "entertainment"],
  "9.1": ["9", "1", "entertainment"],
  "10.1": ["10", "1", "entertainment"],
  "10.2": ["10", "2", "entertainment"],
  "2.1": ["2", "1", "business"],
  "2.2": ["2", "2", "business"],
  "3.2": ["3", "2", "business"],
  "4.1": ["4", "1", "business"],
  "4.2": ["4", "2", "business"],
};

/* The two areas the drawn halls fall into, with the colour the official
   plan fills that area's halls with — checked against the source on every
   run (see checkAreaColours), so a repaint by Koelnmesse stops this tool
   rather than quietly leaving the map a season behind.

   Only `access` is ours: the map has to say out loud that a business hall
   is a door a consumer ticket does not open, and no colour says that. */
const AREAS = {
  entertainment: { label: "Entertainment", colour: "#00B9FF" },
  business: {
    label: "Business",
    colour: "#7800FF",
    trade: true,
    access:
      "trade & media badge only. A consumer ticket does not open these halls, " +
      "and they close after Friday.",
  },
};

/* Fallback mirror/rotation per hall, lifted from the official page's
   campus `hallen` array. Only consulted when a hall's API response
   carries no scalex/scaley/rotation of its own (halls 6, 8, 9 today). */
const CAMPUS = {
  2: { rot: 0, dx: -1, dy: 1 },
  3: { rot: 0, dx: -1, dy: 1 },
  4: { rot: 0, dx: -1, dy: 1 },
  5: { rot: 0, dx: -1, dy: 1 },
  6: { rot: 0, dx: -1, dy: 1 },
  7: { rot: 0, dx: -1, dy: 1 },
  8: { rot: 0, dx: -1, dy: 1 },
  9: { rot: 0, dx: -1, dy: 1 },
  10: { rot: 90, dx: -1, dy: 1 },
};

/* Per-level overrides of the signs the API filed, for the one case where
   following it faithfully draws a hall upside down.

   Hall 2 is filed with scaley −0.92 on level 1 and +0.89 on level 2, so
   the two storeys of one building come out mirrored against each other.
   Two independent checks agree that level 1 is the odd one: its stand
   rows run E→A up the hall where every other level of every hall filed
   with a sign of its own runs A→E, and flipping it raises the overlap of
   the two levels' structural blocks — the same walls, so they should
   coincide — from 0.72 to 0.80. Every other hall's levels agree as
   filed. Ground truth is a walk through hall 2 with the map open;
   until then this is a documented guess, and it is one sign to undo. */
const SIGN_FIX = {
  "2.1": { dy: 1 },
};

import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "data", "hallplan");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sign = (v) => (v < 0 ? -1 : 1);
const round1 = (v) => Math.round(v * 10) / 10;

/* Exhibitor titles arrive with HTML entities baked in ("gamescom &nbsp;",
   "K&ouml;ln") — decode the ones that actually occur plus numeric refs,
   then collapse the leftover whitespace. */
const ENTITIES = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
  auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö", Uuml: "Ü",
  szlig: "ß", eacute: "é", egrave: "è", agrave: "à", ccedil: "ç",
};
const decodeName = (s) =>
  String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => ENTITIES[name] ?? m)
    .replace(/\s+/g, " ")
    .trim();

async function fetchHall(halle, level) {
  const res = await fetch(`${SOURCE}&halle=${halle}&level=${level}&stage=`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      /* an honest UA — this is a fan guide taking a periodic snapshot */
      "user-agent": "gc2026-guide hall-map snapshot (github.com/InventivetalentDev/gc2026-guide)",
    },
    body: `halle=${halle}&level=${level}`,
  });
  if (!res.ok) throw new Error(`halle ${halle}/${level}: HTTP ${res.status}`);
  return res.json();
}

/* The official transform, magnitudes dropped (see header). Returns a
   function point → [x, y] in a y-down frame; bbox-normalised later. */
function transformer(minmax, campus, fix = {}) {
  const { minx, miny, w, h } = minmax;
  const dw = minmax.dw || 0;
  const dh = minmax.dh || 0;
  const sx = fix.dx ?? sign(minmax.scalex ? minmax.scalex : campus.dx);
  const sy = fix.dy ?? sign(minmax.scaley ? minmax.scaley : campus.dy);
  const rot = minmax.rotation ? parseInt(minmax.rotation, 10) : campus.rot;
  const th = (-(rot + 180) * Math.PI) / 180;
  const cos = Math.cos(th);
  const sin = Math.sin(th);
  return ([px, py]) => {
    const x = (px - minx - w / 2 + dw) * sx;
    const y = (py - miny - h / 2 + dh) * sy;
    return [x * cos - y * sin, x * sin + y * cos];
  };
}

function trimHall(id, raw) {
  const [halle] = HALLS[id];
  const t = transformer(raw.minmax, CAMPUS[halle], SIGN_FIX[id]);

  const polys = [];
  const collect = (pl) => {
    if (!Array.isArray(pl) || pl.length < 3) return null;
    const p = pl.map(t);
    polys.push(p);
    return p;
  };

  const blocks = (raw.bloecke || []).map((b) => collect(b.pl)).filter(Boolean);
  const stands = (raw.staende || [])
    .map((s) => {
      const poly = collect(s.pl);
      if (!poly) return null;
      const names = [...new Set((s.kunden || []).map((k) => decodeName(k.TITEL || "")).filter(Boolean))];
      return { nr: String(s.standnr2 || s.standnr || "").trim(), a: Math.round(s.area || 0), poly, names };
    })
    .filter(Boolean);

  /* normalise the shared bbox to [0..W]×[0..H] and round to 0.1 m */
  const xs = polys.flat().map((p) => p[0]);
  const ys = polys.flat().map((p) => p[1]);
  const min = [Math.min(...xs), Math.min(...ys)];
  const size = [round1(Math.max(...xs) - min[0]), round1(Math.max(...ys) - min[1])];
  for (const poly of polys)
    for (const pt of poly) {
      pt[0] = round1(pt[0] - min[0]);
      pt[1] = round1(pt[1] - min[1]);
    }

  stands.sort((a, b) => a.nr.localeCompare(b.nr));
  blocks.sort((a, b) => a[0][0] - b[0][0] || a[0][1] - b[0][1]);
  return {
    hall: id,
    official: { halle, level: HALLS[id][1] },
    area: HALLS[id][2],
    size,
    blocks,
    stands,
  };
}

/* The area colours in AREAS, checked against their source.

   The official plan carries a `farbenvorgabe` table in the hall-plan
   page — hall (or hall_level) → fill colour — and it is what paints
   halls 6–9 cyan and halls 2–4 purple on Koelnmesse's own map. We ship
   the colours as constants rather than reading them at runtime, because
   two of the halls we draw are missing from that table: halls 5 and 10
   hold several areas each (merch, cards, indie, retro, campus) and are
   left uncoloured there, while the guide treats them as what they are, a
   consumer ticket's halls. So the constants are the map's palette and
   this only checks that the halls the table *does* colour still agree —
   a repaint by Koelnmesse fails the run instead of leaving our map a
   season behind.

   A page that no longer parses is a warning, not an error: booth
   geometry is the point of this tool, and a markup change at the source
   is not a reason to refuse to refresh it. */
async function checkAreaColours() {
  let html;
  try {
    const res = await fetch(PLAN_PAGE, {
      headers: { "user-agent": "gc2026-guide hall-map snapshot (github.com/InventivetalentDev/gc2026-guide)" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (err) {
    console.log(`colours: could not read the hall-plan page (${err.message}) — keeping the committed area colours`);
    return;
  }
  const table = html.match(/var\s+farbenvorgabe\s*=\s*(\{.*?\})\s*;/s);
  if (!table) {
    console.log("colours: no farbenvorgabe table on the hall-plan page — keeping the committed area colours");
    return;
  }
  const official = JSON.parse(table[1]);
  const seen = new Set();
  for (const [id, [halle, level, area]] of Object.entries(HALLS)) {
    const theirs = official[`${halle}_${level}`] || official[halle];
    if (!theirs) continue;
    seen.add(area);
    if (theirs.toUpperCase() !== AREAS[area].colour.toUpperCase())
      throw new Error(
        `hall ${id}: official plan now fills the ${area} area ${theirs}, ` +
          `AREAS says ${AREAS[area].colour} — check the plan and update the constant`
      );
  }
  console.log(`colours: ${[...seen].join(", ")} still match the official plan`);
}

function validate(hall) {
  const [W, H] = hall.size;
  if (!hall.stands.length) throw new Error(`${hall.hall}: no stands`);
  for (const poly of [...hall.blocks, ...hall.stands.map((s) => s.poly)])
    for (const [x, y] of poly)
      if (x < -0.5 || y < -0.5 || x > W + 0.5 || y > H + 0.5)
        throw new Error(`${hall.hall}: point ${x},${y} outside ${W}×${H}`);
}

/* One stand/block per line: reviewable git diffs at booth granularity
   without a five-figure line count. */
function serialise(hall) {
  const stands = hall.stands.map((s) => "  " + JSON.stringify(s)).join(",\n");
  const blocks = hall.blocks.map((b) => "  " + JSON.stringify(b)).join(",\n");
  return `{
"hall": ${JSON.stringify(hall.hall)},
"official": ${JSON.stringify(hall.official)},
"area": ${JSON.stringify(hall.area)},
"size": ${JSON.stringify(hall.size)},
"blocks": [
${blocks}
],
"stands": [
${stands}
]
}
`;
}

/* ---- join QA: which guide exhibitors will land on the map? ---- */

/* mirror of GCMarks.boothCodes in js/marks.js — keep the two identical */
const codeSet = (str) =>
  new Set(
    String(str || "")
      .split(/[\s/,+]+/)
      .flatMap((part) => part.match(/[A-Za-z]\d+[a-z]?/g) || [part.replace(/[^0-9a-z]/gi, "")])
      .map((c) => c.toUpperCase())
      .filter(Boolean)
  );

function joinReport(halls) {
  let exhibitors;
  try {
    exhibitors = JSON.parse(readFileSync(join(ROOT, "data", "exhibitors.json"), "utf8"));
  } catch {
    console.log("join report skipped: data/exhibitors.json not readable");
    return;
  }
  const inScope = exhibitors.filter((e) => e.hall && HALLS[String(e.hall)] && e.booth);
  const misses = [];
  for (const ex of inScope) {
    const hall = halls.find((h) => h.hall === String(ex.hall));
    const codes = codeSet(ex.booth);
    const hit = hall.stands.some((s) => [...codeSet(s.nr)].some((c) => codes.has(c)));
    if (!hit) misses.push(`  ${ex.id} — hall ${ex.hall}, booth ${ex.booth}`);
  }
  console.log(`join: ${inScope.length - misses.length}/${inScope.length} guide exhibitors matched to a stand`);
  if (misses.length)
    console.log(`join: NO stand found for (check the booth code, or the stand may not be filed yet):\n${misses.join("\n")}`);
  unclaimedReport(halls, exhibitors);
}

/* Legal forms and the industry filler every third company name carries.
   Stripped so "Ubisoft GmbH" and "Ubisoft" compare equal — worth it here
   because a miss costs a booth nobody finds, and a false hit costs a line
   of output someone reads and dismisses. */
const NOISE =
  /\b(gmbh|mbh|ug|haftungsbeschränkt|ag|kg|ohg|e\.?k\.?|se|ltd|limited|llc|inc|corp|co|company|plc|b\.?v\.?|n\.?v\.?|ab|a\/s|as|oy|aps|s\.?a\.?|sas|sarl|s\.?r\.?l\.?|s\.?l\.?|spa|sp|z|o\.?o\.?|pte|pty|holdings?|studios?|entertainment|interactive|games?|gaming|group|europe|deutschland|germany|international|digital|media|software|the)\b/g;
const nameKey = (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(NOISE, " ").replace(/\s+/g, " ").trim();

/* The direction that actually rots, and the reason this exists: a stand
   filed under a name the guide already covers, that no card claims.
   Ubisoft's second Hall 6.1 booth sat unclaimed like that for a while,
   so the map called a plainly-Ubisoft stand "not covered by the guide"
   while the big one across the aisle was fine.

   Nothing here joins anything. The comparison is deliberately loose —
   trusted, it would sooner or later put one company's name on another
   company's booth, which is the one thing this guide must not do. It
   prints candidates; a human decides, and the fix is a booth number in
   exhibitors.json, where the comma separates stands. A card's name is
   read up to its first "/" or "(" so "SEGA / Atlus" and "Plaion (Deep
   Silver)" still recognise "SEGA Europe" and "PLAION GmbH". */
function unclaimedReport(halls, exhibitors) {
  const found = [];
  for (const ex of exhibitors) {
    const hall = halls.find((h) => h.hall === String(ex.hall));
    if (!hall) continue;
    const key = nameKey(String(ex.name).split(/[/(]/)[0]);
    if (!key) continue;
    const codes = codeSet(ex.booth);
    const unclaimed = hall.stands.filter(
      (s) =>
        ![...codeSet(s.nr)].some((c) => codes.has(c)) &&
        s.names.some((n) => {
          const filed = nameKey(n);
          return filed === key || filed.startsWith(`${key} `);
        })
    );
    for (const s of unclaimed)
      found.push(`  ${ex.id} — hall ${ex.hall} stand ${s.nr} (~${s.a} m²) filed as "${s.names[0]}"`);
  }
  if (!found.length) return console.log("join: no stand names an exhibitor we cover but did not claim");
  console.log(
    `join: stands naming an exhibitor we cover, that their card does not claim` +
      ` (add to that card's booth after a comma, or ignore — names are matched loosely):\n${found.join("\n")}`
  );
}

/* ---- main ---- */

/* The QA on its own, against the committed snapshot: booth numbers in
   exhibitors.json change far more often than Koelnmesse's layout does,
   and checking one should not mean asking them for the other again. */
if (process.argv.includes("--report")) {
  const index = JSON.parse(readFileSync(join(OUT, "index.json"), "utf8"));
  joinReport(index.halls.map((h) => JSON.parse(readFileSync(join(OUT, h.file), "utf8"))));
  process.exit(0);
}

const halls = [];
for (const id of Object.keys(HALLS)) {
  const [halle, level] = HALLS[id];
  const raw = await fetchHall(halle, level);
  const hall = trimHall(id, raw);
  validate(hall);
  halls.push(hall);
  console.log(`hall ${id}: ${hall.stands.length} stands, ${hall.blocks.length} blocks, ${hall.size[0]}×${hall.size[1]} m`);
  await sleep(300);
}

await checkAreaColours();

mkdirSync(OUT, { recursive: true });
for (const hall of halls) writeFileSync(join(OUT, `hall-${hall.hall}.json`), serialise(hall));
writeFileSync(
  join(OUT, "index.json"),
  JSON.stringify(
    {
      fetched: new Date().toISOString().slice(0, 10),
      source: PLAN_PAGE,
      /* Only the areas actually drawn, so the map's legend can be built
         from this file alone without listing a key nothing uses. */
      areas: Object.fromEntries(
        Object.entries(AREAS).filter(([key]) => halls.some((h) => h.area === key))
      ),
      halls: halls.map((h) => ({
        id: h.hall,
        file: `hall-${h.hall}.json`,
        area: h.area,
        size: h.size,
        stands: h.stands.length,
      })),
    },
    null,
    1
  ) + "\n"
);
console.log(`wrote data/hallplan/ (${halls.length} halls + index)`);
joinReport(halls);
