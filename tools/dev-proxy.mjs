/* One origin for local development, the way the edge gives you one in
   production.
 *
 * The site and the queue API are two Workers. In production a route puts them
 * on the same hostname — `hallgui.de/api/*` reaches the API, everything else
 * reaches the site — so the client can ask for `/api/…` relative to wherever it
 * was loaded from. `wrangler dev` has no equivalent: it serves one Worker per
 * process, on its own port, and nothing arranges them by path.
 *
 * Without something in the middle, the two halves cannot be exercised together
 * locally at all: the page loads from one port and its reports go nowhere. This
 * is that something. It serves the repository as files and forwards `/api/*` to
 * `wrangler dev --config wrangler-api.toml`.
 *
 * Deliberately not part of the deploy in any way. It is a development
 * convenience with no counterpart at the edge, and nothing in dist/ or either
 * Worker refers to it.
 *
 *   Terminal 1:  npm run dev:api      # the Worker, on 8787
 *   Terminal 2:  npm run dev          # this, on 8000
 *   Browser:     http://localhost:8000/?queue-dev=1
 */

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import http from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.env.PORT || 8000);
const API = process.env.API_ORIGIN || "http://127.0.0.1:8787";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
};

async function serveFile(res, pathname) {
  /* normalize() before the join is what stops ../ climbing out of the repo.
     This only ever listens on localhost, but a path traversal is not worth
     leaving open on the strength of that. */
  const rel = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  let file = join(ROOT, rel);
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    return res.end("Not found");
  }
  try {
    await stat(file);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    return res.end("Not found");
  }
  res.writeHead(200, {
    "Content-Type": TYPES[extname(file)] || "application/octet-stream",
    /* The service worker is the thing being developed as often as not, and a
       cached copy of it is the one that hides your change. */
    "Cache-Control": "no-store",
  });
  createReadStream(file).pipe(res);
}

async function proxyApi(req, res) {
  const url = new URL(req.url, API);
  const body =
    req.method === "GET" || req.method === "HEAD"
      ? undefined
      : await new Promise((resolve) => {
          const chunks = [];
          req.on("data", (c) => chunks.push(c));
          req.on("end", () => resolve(Buffer.concat(chunks)));
        });
  try {
    const upstream = await fetch(url, {
      method: req.method,
      headers: { ...req.headers, host: url.host },
      body,
    });
    const headers = Object.fromEntries(upstream.headers);
    delete headers["content-encoding"];
    delete headers["content-length"];
    res.writeHead(upstream.status, headers);
    res.end(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    /* The likely cause by far is that terminal 1 is not running, so say that
       rather than letting the page show an opaque network failure. */
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "dev_api_unreachable",
        detail: `No queue API at ${API} — is \`npm run dev:api\` running?`,
      })
    );
  }
}

http
  .createServer((req, res) => {
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (pathname === "/api" || pathname.startsWith("/api/")) return proxyApi(req, res);
    return serveFile(res, pathname);
  })
  .listen(PORT, () => {
    console.log(`site + API on http://localhost:${PORT}  (api → ${API})`);
    console.log(`open http://localhost:${PORT}/?queue-dev=1`);
  });
