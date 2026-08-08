/* Regenerate the manifest screenshots — the images Chrome shows in its
   richer install dialog.

   Optional: the guide installs fine without them, and they only need
   refreshing when the layout changes, not when the data does.

     npm i -g playwright && playwright install chromium
     python3 -m http.server 8123          # from the repo root, in another shell
     node tools/make-screenshots.mjs

   Writes icons/screenshot-narrow.png and icons/screenshot-wide.png.
*/

import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.BASE_URL || "http://localhost:8123/";

const SHOTS = [
  { file: "screenshot-narrow.png", width: 540, height: 1170 },
  { file: "screenshot-wide.png", width: 1280, height: 800 },
];

const browser = await chromium.launch();
for (const { file, width, height } of SHOTS) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(BASE, { waitUntil: "load" });
  await page.waitForFunction(() => document.querySelectorAll(".card").length > 0);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(ROOT, "icons", file) });
  console.log(`wrote icons/${file} (${width}×${height})`);
  await page.close();
}
await browser.close();
