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

   Run it from anywhere (no dependencies):

     node tools/fetch-hallplan.mjs

   It fetches all halls first and only writes when every one validated,
   so a broken or changed endpoint leaves the last committed snapshot in
   place. Re-run it when Koelnmesse revises the layout — the join report
   it prints at the end (guide exhibitors → official stands) is a QA aid
   only; nothing from exhibitors.json is baked into the output. The map
   joins by hall + booth code at runtime, so booth edits in
   data/exhibitors.json move highlights without re-running this.

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

/* Guide hall id → official (halle, level). The guide's "10.2" is
   Koelnmesse's hall 10, upper storey — verified against live data
   (Xbox A061 in 7/1, Bilibili A-090 in 10/1, Razer E-020 D-021 in 10/2). */
const HALLS = {
  "5.2": ["5", "2"],
  "6.1": ["6", "1"],
  "7.1": ["7", "1"],
  "8.1": ["8", "1"],
  "9.1": ["9", "1"],
  "10.1": ["10", "1"],
  "10.2": ["10", "2"],
};

/* Fallback mirror/rotation per hall, lifted from the official page's
   campus `hallen` array. Only consulted when a hall's API response
   carries no scalex/scaley/rotation of its own (halls 6, 8, 9 today). */
const CAMPUS = {
  5: { rot: 0, dx: -1, dy: 1 },
  6: { rot: 0, dx: -1, dy: 1 },
  7: { rot: 0, dx: -1, dy: 1 },
  8: { rot: 0, dx: -1, dy: 1 },
  9: { rot: 0, dx: -1, dy: 1 },
  10: { rot: 90, dx: -1, dy: 1 },
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
function transformer(minmax, campus) {
  const { minx, miny, w, h } = minmax;
  const dw = minmax.dw || 0;
  const dh = minmax.dh || 0;
  const sx = sign(minmax.scalex ? minmax.scalex : campus.dx);
  const sy = sign(minmax.scaley ? minmax.scaley : campus.dy);
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
  const t = transformer(raw.minmax, CAMPUS[halle]);

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
  return { hall: id, official: { halle, level: HALLS[id][1] }, size, blocks, stands };
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

const codeSet = (str) =>
  new Set(
    String(str || "")
      .split(/[\s/,+]+/)
      .map((c) => c.replace(/[^0-9a-z]/gi, "").toUpperCase())
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
}

/* ---- main ---- */

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

mkdirSync(OUT, { recursive: true });
for (const hall of halls) writeFileSync(join(OUT, `hall-${hall.hall}.json`), serialise(hall));
writeFileSync(
  join(OUT, "index.json"),
  JSON.stringify(
    {
      fetched: new Date().toISOString().slice(0, 10),
      source: "https://exhibitors.gamescom.global/en/gamescom-exhibitors/hall-plan/",
      halls: halls.map((h) => ({ id: h.hall, file: `hall-${h.hall}.json`, size: h.size, stands: h.stands.length })),
    },
    null,
    1
  ) + "\n"
);
console.log(`wrote data/hallplan/ (${halls.length} halls + index)`);
joinReport(halls);
