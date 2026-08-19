/* Regenerate the manifest screenshots — the images Chrome shows in its
   richer install dialog — and the link-preview cover.

   Optional: the guide installs fine without them, and they only need
   refreshing when the layout changes, not when the data does.

     npm i -g playwright && playwright install chromium
     python3 -m http.server 8123          # from the repo root, in another shell
     node tools/make-screenshots.mjs

   Writes icons/screenshot-narrow.png, icons/screenshot-wide.png and
   icons/og-cover.png.
*/

import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL || "http://localhost:8123/";

/* The first two are the manifest's own sizes. The third is the link preview:
   1200×630 is what every unfurler crops to, and it is reached with a 800px
   viewport at 1.5× rather than a 1200px one at 1× because the card is drawn
   at roughly 500px wide — laying the page out narrower is the only thing that
   leaves the booth numbers legible once it has been shrunk that far.

   800 stays clear of the 640px breakpoint, so the cover shows the desktop
   masthead rather than the phone one. */
const SHOTS = [
  { file: "screenshot-narrow.png", width: 540, height: 1170 },
  { file: "screenshot-wide.png", width: 1280, height: 800 },
  /* Filters shut: open, they fill the bottom half of the cover with chips,
     and what sells the guide in a link preview is a card reading HALL 9.1 /
     A070 / Capcom. The install dialog's two screenshots are the app as it
     actually opens, so they keep the panel. */
  { file: "og-cover.png", width: 800, height: 420, scale: 1.5, collapseFilters: true },
];

const browser = await chromium.launch();
for (const { file, width, height, scale = 1, collapseFilters = false } of SHOTS) {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: scale,
  });
  await page.goto(BASE, { waitUntil: "load" });
  await page.waitForFunction(() => document.querySelectorAll(".card").length > 0);
  if (collapseFilters) {
    await page.evaluate(() => {
      const panel = document.getElementById("toolbar-more");
      if (panel) panel.open = false;
    });
  }
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(ROOT, "icons", file) });
  console.log(`wrote icons/${file} (${width * scale}×${height * scale})`);
  await page.close();
}
await browser.close();
