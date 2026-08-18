/* Open the guide with the clock moved into the show week, so the Today tab
   can be used before Aug 26.

   Today only exists on the five show days — showDay() in js/app.js returns
   null the rest of the year, and the tab, the view and the #today route all
   go with it (see docs/PLAN-today-mode.md). That is deliberate, and it means
   the one thing you cannot do is just click on it. This script hands you a
   real browser with a fake date instead.

     npm i -g playwright && playwright install chromium
     python3 -m http.server 8123          # from the repo root, in another shell
     node tools/preview-today.mjs

   Options:
     --day=2      which show day, 1-5, or an ISO date (default 1)
     --time=17:30 the time in Cologne, HH:MM (default 11:00)
     --lang=de    force a language (default: whatever the browser picks)
     --empty      skip the demo plan and land on the empty state
     --route=#planner   open somewhere else; the clock still applies

   Environment:
     BASE_URL              default http://localhost:8123/
     HEADLESS=1            no window — for a smoke check rather than a look
     PLAYWRIGHT_CHROMIUM   explicit browser path, when the pinned build is
                           somewhere Playwright does not look

   The clock is fixed, not started: Date reads the same instant for as long as
   the window is open, so "closes 20:00 · 3h left" will not tick down. Pass a
   different --time to see another moment. Fixing it rather than faking the
   timers is what keeps the app's own debounces real.

   Nothing here is part of the site — tools/ never reaches the edge (see the
   NOT_SITE list in tools/build-site.sh). Node >= 18. */

import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL || "http://localhost:8123/";
const readJSON = (rel) => JSON.parse(readFileSync(join(ROOT, rel), "utf8"));

const arg = (name, fallback) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const flag = (name) => process.argv.slice(2).includes(`--${name}`);

const event = readJSON("data/event.json");
const days = event.days || [];
if (!days.length) {
  console.error("data/event.json has no days — nothing to preview.");
  process.exit(1);
}

/* --day takes an index into the schedule or a date, so both "the third day"
   and "the Saturday the business halls are shut" are one flag. */
const wanted = String(arg("day", "1"));
const day = /^\d{4}-/.test(wanted)
  ? days.find((d) => d.date === wanted)
  : days[Number(wanted) - 1];
if (!day) {
  console.error(`no such show day: ${wanted}\nshow days: ${days.map((d) => d.date).join(", ")}`);
  process.exit(1);
}

const time = arg("time", "11:00");
if (!/^\d{1,2}:\d{2}$/.test(time)) {
  console.error(`--time wants HH:MM, got "${time}"`);
  process.exit(1);
}

/* Late August is CEST, which is what js/app.js already assumes for the
   countdown. The app re-reads the instant in Europe/Berlin itself, so this
   only has to name the right moment, not the right wall clock. */
const at = new Date(`${day.date}T${time.padStart(5, "0")}:00+02:00`);

/* Picked out of the data rather than hardcoded: booth ids come and go with
   every refresh, and a preview that quietly seeds nothing is worse than one
   that fails. Busiest first, one per hall, so the walking route has more than
   one group in it. */
function demoPlan() {
  const byHall = new Map();
  /* data/exhibitors.json is a bare array — the same thing js/app.js hands
     straight to state.exhibitors. */
  for (const ex of readJSON("data/exhibitors.json"))
    if (ex.type !== "trade" && ex.hall && !byHall.has(ex.hall)) byHall.set(ex.hall, ex);
  const stops = [...byHall.values()].sort((a, b) => (b.crowd || 0) - (a.crowd || 0)).slice(0, 5);
  if (stops.length < 3) return null;

  const onDay = stops.slice(0, 3);
  const [otherDay, unplaced] = stops.slice(3);
  const exhibitors = Object.fromEntries(onDay.map((ex) => [ex.id, day.date]));
  /* One stop parked on another day and one left without one, so the two
     things Today says about the rest of the plan both have something to say:
     the day filter that excludes it, and the "still has no day" count. */
  const otherDate = (days.find((d) => d.date !== day.date) || day).date;
  if (otherDay) exhibitors[otherDay.id] = otherDate;

  return {
    "gc2026.saved.v1": JSON.stringify({
      exhibitors: [...onDay, otherDay, unplaced].filter(Boolean).map((ex) => ex.id),
      games: [],
    }),
    "gc2026.itinerary.v1": JSON.stringify({ exhibitors, games: {} }),
    /* One already ticked, so the Done fold and the progress meter are not
       both empty on arrival. */
    "gc2026.played.v1": JSON.stringify({ exhibitors: [onDay[0].id], games: [] }),
  };
}

try {
  await fetch(BASE);
} catch {
  console.error(`nothing is serving ${BASE}\n  python3 -m http.server 8123    # from the repo root`);
  process.exit(1);
}

const seed = flag("empty") ? null : demoPlan();
/* Loudly, not as a footnote on the status line: a preview that silently seeds
   nothing looks exactly like the empty state it is supposed to contrast with. */
if (!seed && !flag("empty")) {
  console.error("could not build a demo plan from data/exhibitors.json — pass --empty to preview without one.");
  process.exit(1);
}

const browser = await chromium.launch({
  headless: process.env.HEADLESS === "1",
  ...(process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {}),
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  ...(arg("lang") ? { locale: arg("lang") } : {}),
});
const page = await context.newPage();
page.on("pageerror", (err) => console.error("page error:", err.message));

await page.clock.setFixedTime(at);
if (seed)
  await page.addInitScript((entries) => {
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
  }, seed);

await page.goto(BASE + arg("route", "#today"), { waitUntil: "load" });

console.log(`${BASE}  —  ${day.date} ${time} in Cologne${seed ? "" : ", no plan seeded"}`);
console.log(day.trade ? "  trade & media day" : "  public day");
console.log(day.business === "closed" ? "  business halls shut" : `  business halls ${day.business}`);
if (process.env.HEADLESS === "1") {
  await page.waitForFunction(() => document.querySelectorAll(".card").length > 0);
  const seen = await page.evaluate(() => ({
    strip: document.querySelector(".today-strip")?.innerText.replace(/\n/g, " · ") ?? "no Today strip",
    count: document.querySelector(".today-count")?.textContent,
    stops: document.querySelectorAll("#today-body .route-item").length,
    empty: document.querySelector("#today-empty.hidden") ? null : document.querySelector("#today-empty")?.textContent,
  }));
  console.log(`  ${seen.strip}`);
  console.log(`  ${seen.count || seen.empty} — ${seen.stops} row(s) on screen`);
} else {
  console.log("  close the window to finish");
  await new Promise((done) => {
    page.on("close", done);
    browser.on("disconnected", done);
  });
}
await browser.close().catch(() => {});
