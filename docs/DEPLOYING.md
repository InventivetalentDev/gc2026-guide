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
one custom domain, and the guide needs three — `gc26.guide` and the two
hostnames draining behind it, `gamescom.guide` and the original
`gc2026.inventivetalent.org`. Both of those have been handed out, bookmarked and
installed to home screens. Workers serves as many hostnames as you give it, so
all three answer at once and nobody's saved link breaks.

## Why `gc26.guide`

`gamescom.guide` was the home address for about a day. "gamescom" is a
registered word mark held by game — Verband der deutschen Games-Branche e.V.,
which licenses it to Koelnmesse and to paying exhibitors; Koelnmesse's own
conditions of participation put domain registrations outside even that
sublicence, requiring a separate written agreement with game. The association
has had operators of unofficial gamescom information sites — the same shape as
this one — warned off carrying the name in their domains, at a reported
€100,000 Streitwert. Being probably-fine is not worth establishing during the
show itself, so the domain went.

What did not change is the guide calling the show by its name: the title, the
home-screen label, the copy throughout. That is referential use, it is what the
imprint's non-affiliation notice exists to support, and it is not the part that
draws letters. The domain was the exposed part, and it is the only part that
moved.

`gc26.de`, `gc2026.de` and `gcguide.de` redirect to `gc26.guide` (below). They
are aliases, not origins.

## One-time setup

1. **Add `gc26.guide` to Cloudflare** as a zone and point the registrar at
   the nameservers Cloudflare gives you. The deploy attaches a custom domain,
   which Cloudflare can only do inside a zone it controls — so the zone has to
   exist and be active before the first deploy can succeed. The same goes for
   each hostname still draining, and for the three `.de` names in step 6.

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
   first deploy creates the Worker and attaches `gc26.guide`.

5. **Web Analytics** is enabled in the Cloudflare dashboard (Web Analytics →
   the `gc26.guide` site, automatic setup — repoint it there, it was set up
   against `gamescom.guide`), which injects
   `static.cloudflareinsights.com/beacon.min.js` into the HTML on its way out
   of the edge. Nothing in this repo does that, so nothing in this repo would
   tell you it is happening — hence this note. It matters because
   `privacy.html` describes that beacon under Art. 6 (1) (f) GDPR: if the
   dashboard setting is ever turned off, or switched to manual injection,
   the privacy policy has to change with it.

6. **Point the `.de` names at `gc26.guide`.** Add `gc26.de`, `gc2026.de` and
   `gcguide.de` as zones, then on each one: Rules → Redirect Rules → a single
   rule matching all incoming requests, dynamic redirect, 301, target
   `concat("https://gc26.guide", http.request.uri.path)`, **preserve query
   string on**. Each zone also needs a proxied DNS record for the apex (an
   `A` to `192.0.2.1` is the usual placeholder) or there is nothing for the
   rule to run on.

   Redirect Rules rather than routes in `wrangler.toml`, because a saved list
   is per-origin: serving the guide on all five names would mean five separate
   copies of everybody's plan, silently diverging. The fragment survives a 301
   without being sent to the server, so `gc26.de/#s?t=…` still arrives whole.

   `gc26.de` is the short one to say out loud; the other two exist so the
   obvious misses land somewhere.

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
curl -sI https://gc26.guide/          | head -1   # HTTP/2 200
curl -sI https://gc26.guide/map.html  | head -1   # HTTP/2 200 — not a 307
curl -s  https://gc26.guide/data/meta.json | head -c 120
curl -sI https://gc26.de/             | head -2   # HTTP/2 301 → https://gc26.guide/
```

The second one is the check that matters. `/map.html` must answer **200**, not a
redirect to `/map`. A redirect there gets the hall map filed under the guide's
own cache key, so the app opens on the wrong page, and it leaves the precached
copy of the map unusable offline — which is the one place the map is for.
`html_handling = "none"` in `wrangler.toml` is what keeps it a 200, and the
comments there spell out the mechanism.

Then open the site, load a hall map, turn the network off and reload. If the
guide and the map both still come up, the shell cached correctly.

## Retiring the old hostnames

Both `gamescom.guide` and `gc2026.inventivetalent.org` are served by the Worker
off this same deploy, so neither can drift behind. Neither is a redirect, and
that is the point: the service worker, the saved list, the itinerary and the
played marks are all per-origin, so a redirect would strand every plan built on
them. They serve the guide, show the move notice once, and come off when the
people on them have had a fair chance to answer it.

Retire them in this order:

1. **`gamescom.guide` first**, and sooner than comfort suggests — see *Why
   `gc26.guide`* above. It answered for about a day, so the population holding a
   plan on it is small and the notice clears most of it on first load. Delete
   its `[[routes]]` block, push, then let the registration lapse. Do not hand it
   out again in the meantime, and if a letter arrives before you have got to
   this, deleting the route is the whole of the immediate fix.
2. **`gc2026.inventivetalent.org` after the show.** It has been bookmarked and
   installed since the site went up, its population is the real one, and it
   costs nothing to keep — it is a subdomain of a domain that is staying.
3. **Delete `.github/workflows/pages.yml` and `CNAME`**, and turn off Pages in
   repository Settings → Pages. Both hostnames are already served by Cloudflare,
   so this is leftover from that cutover rather than a step in this one.
   (`CNAME` never reaches Cloudflare — `tools/build-site.sh` lists it as
   not-site — so it is inert either way.)

Anyone who reinstalls from `gc26.guide` without accepting the notice starts with
an empty list, because it is a different origin. That is what the notice is for.

**Share list** is the way across, but only because `buildShareLink()` makes it
one: on either legacy hostname it builds the link against `gc26.guide` instead
of the current origin (`LEGACY_HOSTS` / `SHARE_ORIGIN` in `js/app.js`). Left to
`location.origin` it would return a link to the origin the list is trying to
leave, which moves nothing.

Nothing on either old hostname looks broken, so `offerMove()` (also `js/app.js`)
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

The notice is remembered in `gc2026.moved.v2` as soon as it is answered either
way. It appears on the guide only; the hall map has no toast of its own, so a
visitor who lands straight on `map.html` sees it when they next open the guide.

The key was `…v1` while `gamescom.guide` was the destination, and bumping it is
what reopens the notice for everyone who already answered that version — the
ones who accepted are now sitting on `gamescom.guide` with a remembered "yes",
and the ones who dismissed are still on `gc2026.inventivetalent.org` with a
remembered "no". Both need telling once more, and only once. `sw.js` is bumped
to `v7` for the same move: without it the old `app.js` is served
stale-while-revalidate on the first load back, and the old `app.js` has never
heard of `gc26.guide`.

`LEGACY_HOSTS`, `SHARE_ORIGIN`, `offerMove()`, `buildMoveLink()` and
`gc2026.moved.v2` all come out once both old hostnames are finally retired. The
`t`/`d`/`p`/`q`/`m` params stay — they are the share dialog's own format now —
and only the v1 `l=` decode path goes, once links made before the format
change stop turning up.

## Rolling back

`wrangler deployments list` shows the history and `wrangler rollback` returns to
the previous one, which is the fastest way out of a bad data push. Reverting the
commit on `main` and letting the workflow run is the durable fix — do that too,
or the next push carries the same broken file back to the edge.
