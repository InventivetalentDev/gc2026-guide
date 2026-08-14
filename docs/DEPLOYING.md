# Deploying

The guide is hosted on **Cloudflare Workers** as an assets-only Worker: a
directory of static files served from the edge, with no Worker script.
`.github/workflows/cloudflare.yml` deploys every push to `main`;
`wrangler.toml` holds the whole configuration.

The site still has no build step. `tools/build-site.sh` copies it into `dist/`,
which is the directory the Worker serves, because an asset directory has to hold
the site and nothing else — aimed at the repo root, a deploy ships the docs and
`wrangler dev` reloads forever on its own scratch files. The script classifies
every top-level entry as site or not-site and fails if it meets one it does not
recognise, so a new asset directory stops the deploy instead of 404ing quietly.

It moved off GitHub Pages for one reason: Pages serves a repository at exactly
one custom domain, and the guide needs two — `gamescom.guide` and the original
`gc2026.inventivetalent.org`, which has been handed out, bookmarked and
installed to home screens since the site went up. Workers serves as many
hostnames as you give it, so both can answer at once and nobody's saved link
breaks.

## One-time setup

1. **Add `gamescom.guide` to Cloudflare** as a zone and point the registrar at
   the nameservers Cloudflare gives you. The deploy attaches a custom domain,
   which Cloudflare can only do inside a zone it controls.

2. **Create an API token** — Cloudflare dashboard → My Profile → API Tokens →
   *Create Token* → the **Edit Cloudflare Workers** template. It carries the
   permissions a deploy needs: Workers Scripts (edit) to upload, Workers Routes
   (edit) plus DNS (edit) to attach the custom domain, and Zone (read). Scope it
   to the account and to the zones the guide will be served from.

3. **Add two repository secrets** (Settings → Secrets and variables → Actions):

   | Secret | Value |
   |---|---|
   | `CLOUDFLARE_API_TOKEN` | the token from step 2 |
   | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → Workers & Pages → Account ID |

4. **Push to `main`**, or run the workflow by hand from the Actions tab. The
   first deploy creates the Worker and attaches `gamescom.guide`.

5. **Web Analytics** is enabled in the Cloudflare dashboard (Web Analytics →
   the `gamescom.guide` site, automatic setup), which injects
   `static.cloudflareinsights.com/beacon.min.js` into the HTML on its way out
   of the edge. Nothing in this repo does that, so nothing in this repo would
   tell you it is happening — hence this note. It matters because
   `privacy.html` describes that beacon under Art. 6 (1) (f) GDPR: if the
   dashboard setting is ever turned off, or switched to manual injection,
   the privacy policy has to change with it.

Deploying from a laptop works the same way and needs no secrets — `npx wrangler
login` once, then:

```sh
tools/build-site.sh && npx wrangler deploy
```

`tools/build-site.sh && npx wrangler dev` serves `dist/` under the same routing
rules as production, which is the way to check the routing itself. For ordinary
work keep using `python3 -m http.server` in the repo root: it serves the real
files, so an edit shows up on reload instead of after another `build-site.sh`.

## Verifying a deploy

```sh
curl -sI https://gamescom.guide/          | head -1   # HTTP/2 200
curl -sI https://gamescom.guide/map.html  | head -1   # HTTP/2 200 — not a 307
curl -s  https://gamescom.guide/data/meta.json | head -c 120
```

The second one is the check that matters. `/map.html` must answer **200**, not a
redirect to `/map`. A redirect there gets the hall map filed under the guide's
own cache key, so the app opens on the wrong page, and it leaves the precached
copy of the map unusable offline — which is the one place the map is for.
`html_handling = "none"` in `wrangler.toml` is what keeps it a 200, and the
comments there spell out the mechanism.

Then open the site, load a hall map, turn the network off and reload. If the
guide and the map both still come up, the shell cached correctly.

## Moving `gc2026.inventivetalent.org` across

The old hostname stays on GitHub Pages until you deliberately move it, so the
two hosts run side by side for as long as you want. Both workflows deploy the
same commit, so neither domain drifts behind while that lasts.

When `gamescom.guide` has proven itself:

1. Delete the DNS record for `gc2026.inventivetalent.org` that points at
   `inventivetalentdev.github.io`. Wrangler will not create a custom domain
   while another record holds the name — it fails the deploy instead of
   clobbering it, so the old site cannot go dark by accident.
2. Uncomment the second `[[routes]]` block in `wrangler.toml` and push. The
   hostname is now served by the Worker, off the same deploy as
   `gamescom.guide`.
3. Delete `.github/workflows/pages.yml` and `CNAME`, and turn off Pages in
   repository Settings → Pages. (`CNAME` never reaches Cloudflare — it is listed
   as not-site in `tools/build-site.sh` — so it is inert either way.)

Visitors with the app installed from the old domain keep working throughout: the
service worker, the saved list, the itinerary and the played marks are all
per-origin, so that installation carries on against
`gc2026.inventivetalent.org` and simply follows it to Cloudflare. It is a
different origin from `gamescom.guide` though, so anyone who reinstalls from the
new domain starts with an empty list.

**Share list** is the way across, but only because `buildShareLink()` makes it
one: on the legacy hostname it builds the link against `gamescom.guide` instead
of the current origin (`LEGACY_HOST` / `SHARE_ORIGIN` in `js/app.js`). Left to
`location.origin` it would return a link to the origin the list is trying to
leave, which moves nothing.

Nothing on the old hostname looks broken, so `offerMove()` (also `js/app.js`)
tells visitors there once that the guide has moved. It is a toast, not a
redirect — nobody mid-plan on a show floor gets the page pulled out from under
them — and its **Open** action brings their plan along rather than asking them
to move it by hand.

`buildMoveLink()` is what carries it: the share dialog's device-mode link with
every part switched on, because a move is one person's own data rather than a
plan handed to someone else. The format is the dialog's own (the sharing
section in `js/app.js`):

| Param | Carries |
|---|---|
| `t` | saved booths and games, as fixed-width 5-character hash tokens |
| `d` | day assignments — one day-of-month character per token, `-` for none |
| `p` | played marks on saved items, a base36 bitmask over the token order |
| `q` | played marks on items that are not saved, as explicit tokens |
| `m` | marks this as a move, so the arrival offers replace instead of merge |

It all rides in the hash, so none of it is sent to a server, and the arrival
goes through the existing import path — with Undo, and anything the guide no
longer recognises dropped on the way in. A device with nothing saved imports
straight away; one already holding a list is offered **Replace my list**, the
cost counted out in the prompt first. A visitor with nothing saved gets a
link-free notice and a plain navigation.

The notice is remembered in `gc2026.moved.v1` as soon as it is answered either
way. It appears on the guide only; the hall map has no toast of its own, so a
visitor who lands straight on `map.html` sees it when they next open the guide.

`LEGACY_HOST`, `SHARE_ORIGIN`, `offerMove()`, `buildMoveLink()` and
`gc2026.moved.v1` all come out once the old hostname is finally retired. The
`t`/`d`/`p`/`q`/`m` params stay — they are the share dialog's own format now —
and only the v1 `l=` decode path goes, once links made before the format
change stop turning up.

## Rolling back

`wrangler deployments list` shows the history and `wrangler rollback` returns to
the previous one, which is the fastest way out of a bad data push. Reverting the
commit on `main` and letting the workflow run is the durable fix — do that too,
or the next push carries the same broken file back to the edge.
