# Deploying

The guide is hosted on **Cloudflare Workers** as an assets-only Worker: a
directory of static files served from the edge, with no Worker script.
`.github/workflows/cloudflare.yml` deploys every push to `main`;
`wrangler.toml` holds the whole configuration. `cloudflare-preview.yml`
uploads every pull request from a branch in this repository as a preview
version of the same Worker — see *PR previews* below, including why forks are
deliberately left out.

The site still has no build step. `tools/build-site.sh` copies it into `dist/`,
which is the directory the Worker serves. An asset directory has to hold the
site and nothing else: aimed at the repo root, a deploy would ship the docs and
`wrangler dev` would reload forever on its own scratch files. The script
classifies every top-level entry as site or not-site and fails if it meets one
it does not recognise, so a new asset directory stops the deploy instead of
404ing quietly.

It moved off GitHub Pages for one reason: Pages serves a repository at exactly
one custom domain, and the guide needs four — `hallgui.de` and the three
hostnames draining behind it, `gamescom.guide`, `gc26.guide` and the original
`gc2026.inventivetalent.org`. All three have been handed out, bookmarked or
installed to home screens. Workers serves as many hostnames as you give it, so
all four answer at once and nobody's saved link breaks.

Pages is gone rather than dormant: every hostname resolves to Cloudflare, and
`pages.yml` and `CNAME` have been deleted, so `cloudflare.yml` is the only thing
that deploys anything. Turning Pages off in repository Settings → Pages is the
last of it, and has to be done there rather than here.

## Why `hallgui.de`

The address moved twice in three days, and the two moves are not the same kind
of thing.

**`gamescom.guide` had to go.** "gamescom" is a registered word mark held by
game — Verband der deutschen Games-Branche e.V., which licenses it to Koelnmesse
and to paying exhibitors; Koelnmesse's own conditions of participation put
domain registrations outside even that sublicence, requiring a separate written
agreement with game. The association has had operators of unofficial gamescom
information sites — the same shape as this one — warned off carrying the name in
their domains, at a reported €100,000 Streitwert. Proving that this one is
probably fine is not worth doing during the show itself.

**`gc26.guide` chose to go.** Nothing was wrong with it. It is an abbreviation
with a year in it: fine to type, useless to say across a queue, and due for
replacement again next August. The cost of moving was only going to rise. It was
a day and a half old and the printed QR codes had not been made yet, so the
moment to fix it was before anything set.

**`hallgui.de` is the one that stays.** It names what the guide is built around,
the hall map. It reads as "hallguide" once the dot stops being punctuation. And
it has no year in it, so this is the last time.

The trade-off is that a domain hack reads better than it speaks. That is why
`hallguide.de` — the spelling somebody who only *heard* the name would reach for
— is owned and redirected rather than left for a squatter. Owning both is what
lets the name be said out loud without a spelling lesson.

None of this changed the guide calling the show by its name — in the title, the
home-screen label and the copy throughout. That is referential use; it is what
the imprint's non-affiliation notice exists to support, and it is not the part
that draws letters. The domain was the exposed part, and the only part that
moved.

`hallguide.de`, `gc26.de`, `gc2026.de`, `gc27.de`, `gcgui.de` and `gcguide.de`
redirect to `hallgui.de` (step 6). They are aliases, not origins.

## One-time setup

1. **Add `hallgui.de` to Cloudflare** as a zone and point the registrar at
   the nameservers Cloudflare gives you. The deploy attaches a custom domain,
   which Cloudflare can only do inside a zone it controls — so the zone has to
   exist and be active before the first deploy can succeed. The same goes for
   each hostname still draining, and for the six alias names in step 6.

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
   first deploy creates the Worker and attaches `hallgui.de`.

5. **Web Analytics** is enabled in the Cloudflare dashboard (Web Analytics →
   the `hallgui.de` site, automatic setup — repoint it there, it was set up
   against `gamescom.guide`), which injects
   `static.cloudflareinsights.com/beacon.min.js` into the HTML on its way out
   of the edge. Nothing in this repo does that, so nothing in this repo would
   tell you it is happening — hence this note. It matters because
   `privacy.html` describes that beacon under Art. 6 (1) (f) GDPR: if the
   dashboard setting is ever turned off, or switched to manual injection,
   the privacy policy has to change with it.

6. **Point the alias domains at `hallgui.de`.** Each one needs to be an active
   zone in Cloudflare — nameservers pointed there at the registrar — and then,
   on each zone:

   - **DNS** → a proxied `A` record on the apex, and one for `www`. The address
     is a placeholder (`192.0.2.1`, RFC 5737) and never receives a packet: the
     redirect happens at the edge before anything is forwarded. Proxied is not
     optional, though — Redirect Rules only run on proxied records, so an
     unproxied alias answers with nothing at all.
   - **Rules → Redirect Rules** → one rule matching all incoming requests,
     dynamic redirect, **301**, target
     `concat("https://hallgui.de", http.request.uri.path)`, **preserve query
     string on**.

   Matching all requests and carrying the path is what makes an alias forward a
   deep link instead of dumping every visitor on the front page.

   | Alias | Why it exists |
   |---|---|
   | `hallguide.de` | how somebody who only *heard* the name would spell it — the entry that makes the canonical name sayable, and the one to keep if you ever keep only one |
   | `gc26.de` | short, and was the one to say out loud to a German crowd |
   | `gc2026.de` | the older spelling, matching `gc2026.inventivetalent.org` |
   | `gc27.de` | next year's, parked so it is never a dead name |
   | `gcgui.de` | the same dot trick applied to the `gc` spelling |
   | `gcguide.de` | and its literal spelling, for the same reason as `hallguide.de` |

   The pairs are the point: say "hallguide" out loud and it does not matter
   whether the listener puts the dot before or after the *de* — both land, so
   the name never needs spelling out. The guide still calls itself nothing but
   `hallgui.de`. An alias is a way in, not a name the site answers to, which is
   why none of them appear in a canonical tag, the feedback address or the
   attribution line.

   The draining hostnames are **not** in that list and must never be added to
   it. They serve the guide and show a move notice; redirecting them would
   strand every saved list built on them.

   Redirects rather than routes in `wrangler.toml`, because a saved list is
   per-origin: serving the guide on all ten names would mean ten separate
   copies of everybody's plan, silently diverging. The fragment survives a 301
   without being sent to the server, so `gc26.de/#s?t=…` still arrives whole.

   To repoint the whole set — next August, say — edit each zone's rule. Six
   zones is tedious rather than hard: the target string is identical on every
   one of them, so it is copy-paste with the hostname changed.

Deploying from a laptop works the same way and needs no secrets — `npx wrangler
login` once, then:

```sh
tools/build-site.sh && npx wrangler deploy
```

`tools/build-site.sh && npx wrangler dev` serves `dist/` under the same routing
rules as production, which is the way to check the routing itself. For ordinary
work keep using `python3 -m http.server` in the repo root: it serves the real
files, so an edit shows up on reload instead of after another `build-site.sh`.

## PR previews

`.github/workflows/cloudflare-preview.yml` uploads every pull request from a
branch in this repository as a **version** of the production Worker — Workers'
own preview system, not a second Worker — and comments two URLs on the PR:

- `pr-<n>-gc2026-guide.<subdomain>.workers.dev` — the PR's alias, following
  its newest push, so the link in the comment stays good for the life of the
  review;
- `<version>-gc2026-guide.<subdomain>.workers.dev` — that one push, frozen.

A version is not a deployment. Nothing any real hostname serves changes until
the merge lands on `main` and `cloudflare.yml` deploys it — `versions upload`
does not even apply triggers, so the custom domains in `wrangler.toml` cannot
move from a preview. It runs on the same two repository secrets as the deploy
and needs no further token scope. `preview_urls = true` in `wrangler.toml` is
what keeps the URLs answering: left unset it follows `workers_dev`, and it is
pinned so that turning `workers_dev` off one day does not quietly take the
preview system down with it.

**Fork PRs deliberately get no preview.** GitHub already withholds the
repository secrets from fork-triggered runs; the workflow's same-repository
guard turns that into an honest skip instead of a red failure. The reason to
keep it that way is not the secrets, though: a preview publishes a PR's HTML
and JavaScript, live and public, on a `workers.dev` URL carrying this
project's name. Granting that automatically to anyone with a fork is free
hosting for phishing pages. To preview a fork PR, read the diff first, then
run exactly what the workflow runs, from a laptop:

```sh
git fetch origin pull/<n>/head && git checkout FETCH_HEAD
tools/build-site.sh && npx wrangler versions upload --preview-alias pr-<n>
```

Two behaviours to know before trusting a preview:

- The alias URL is one origin across a PR's pushes, so `sw.js` behaves there
  as it does in production: the first load after a push can serve the push
  before, stale-while-revalidate. Reload once more, or use the per-push URL —
  a fresh origin every time, so always clean.
- Preview URLs are public to anyone who has the link, and old ones keep
  answering: versions cannot be unpublished, and only the 1000 newest aliases
  are kept. Nothing secret ships in this repo, so today that costs nothing; if
  that ever changes, Cloudflare Access can put a login in front of the
  `workers.dev` preview URLs.

## Verifying a deploy

```sh
curl -sI https://hallgui.de/          | head -1   # HTTP/2 200
curl -sI https://hallgui.de/map.html  | head -1   # HTTP/2 200 — not a 307
curl -s  https://hallgui.de/data/meta.json | head -c 120
curl -sI https://gc26.de/             | head -2   # HTTP/2 301 → https://hallgui.de/
curl -s  https://hallgui.de/sitemap.xml | head -4 # generated at build, not committed
curl -s  https://hallgui.de/robots.txt  | tail -1 # Sitemap: https://hallgui.de/sitemap.xml
```

The second one is the check that matters. `/map.html` must answer **200**, not a
redirect to `/map`. A redirect there gets the hall map filed under the guide's
own cache key, so the app opens on the wrong page, and it leaves the precached
copy of the map unusable offline — which is the one place the map is for.
`html_handling = "none"` in `wrangler.toml` is what keeps it a 200, and the
comments there spell out the mechanism.

Then open the site, load a hall map, turn the network off and reload. If the
guide and the map both still come up, the shell cached correctly.

The last two lines are worth a look because `sitemap.xml` is the one file in
`dist/` with no counterpart in the repo — `tools/build-site.sh` generates it,
so a deploy made any other way is a deploy without one. It should list four
URLs: the guide and the map, each in both languages.

Nothing here indexes on its own. After a deploy that changed any of it, the
sitemap wants submitting once in Google Search Console (Indexing → Sitemaps),
and `?lang=de` is worth a spot-check through the URL Inspection tool — the
question being whether the rendered page comes back in German, which is the
whole point of the `hreflang` set.

## Retiring the old hostnames

All three of `gamescom.guide`, `gc26.guide` and `gc2026.inventivetalent.org` are
served by the Worker off this same deploy, so none can drift behind. None is a
redirect at the edge, and that is the point: the service worker, the saved list,
the itinerary and the played marks are all per-origin, so a blanket redirect
would strand every plan built on them. They serve the guide, show the move
notice once, and come off when the people on them have had a fair chance to
answer it.

The one visit that is redirected is the one with nothing to strand — see *The
first-arrival redirect* below.

Retire them in this order:

1. **`gamescom.guide` first**, and sooner than comfort suggests — see *Why
   `hallgui.de`* above. It answered for about a day, so the population holding a
   plan on it is small and the notice clears most of it on first load. Delete
   its `[[routes]]` block, push, then let the registration lapse. Do not hand it
   out again in the meantime, and if a letter arrives before you have got to
   this, deleting the route is the whole of the immediate fix.
2. **`gc26.guide` after the show.** No hurry — nothing is wrong with the name,
   it is simply not the one in use, and its population is small for the same
   reason `gamescom.guide`'s is. Worth keeping through the show so that anyone
   who wrote it down in the days it was live still lands somewhere. When it does
   come off, it can become a plain alias redirect like the ones in step 6
   rather than lapsing — by then nobody's list is on it.
3. **`gc2026.inventivetalent.org` last.** It has been bookmarked and installed
   since the site went up, its population is the real one, and it costs nothing
   to keep — it is a subdomain of a domain that is staying.

The rule behind the order: a hostname may only stop serving once the lists built
on it have had somewhere to go. Route deleted before that, and those plans are
gone with no way to reach the people holding them.

Anyone who reinstalls from `hallgui.de` without accepting the notice starts with
an empty list, because it is a different origin. That is what the notice is for.

### The first-arrival redirect

People keep typing the old addresses and keep following old links, and a
first-time arrival on one has no plan on it, no history with it and no reason to
be there. There is nothing to weigh for that visit, so it does not get a notice:
the inline block in the head of `index.html` and `map.html` replaces the URL with
the same path on `hallgui.de` before anything paints.

It is in the page, not in a Worker route or a Redirect Rule, because the
question it has to answer — *has this browser got anything on this hostname?* —
is one only the browser can answer. Four things stop it, and each of them is a
way of saying somebody chose to be here:

| Stops on | Why |
|---|---|
| anything in `localStorage` | a saved booth, a chosen language, a dismissed move notice, the installed marker below. They get `offerMove()` instead, which carries the plan across |
| `display-mode: standalone` or `minimal-ui` | the installed app is running it. Its address bar does not update, so a redirect would leave the app on another origin with no sign of what happened and no way back |
| `navigator.onLine === false` | `hallgui.de` has no service worker and no cache on that device yet, so a redirect with no network is a redirect to an error page — and a Koelnmesse hall is where that is likeliest |
| `localStorage` throwing | Safari private mode, or cookies blocked. Unreadable is not empty, and staying is the reversible half |

Path, query and hash all ride along, so an old `#s?t=…` share link arrives as a
share link and `?lang=de` arrives in German. It uses `replace()` rather than
`assign()`, so Back leaves for wherever the visitor came from instead of
returning to a URL that redirects again.

`js/pwa.js` writes `gc2026.installed.v1` on a standalone launch and on
`appinstalled`. That is the "installed app" signal the first row above then
enforces on its own: without it, somebody who installed the app and never saved
anything is indistinguishable from a first arrival, since the move notice
records an answer only when it is answered and an ignored toast leaves no trace.
`navigator.getInstalledRelatedApps()` is the API that names it directly and is
deliberately unused — Chromium-only, asynchronous (so it cannot gate something
that must happen before the first paint), and it reads the manifest link that
`map.html` deliberately does not have. iOS home-screen apps keep a storage
container of their own, so nothing there is visible to Safari on the same origin
and no API offers the install either; a tab there is judged on its own storage.

The host list is spelled out in three places — `js/app.js` (`LEGACY_HOSTS`) and
the head of each page — because nothing loaded as a file runs early enough to
share it, the same trade the language stamp makes with `SUPPORTED` in
`js/i18n.js`. All three come out together at the end of this section.

No `sw.js` bump goes with this. The block is inline in the two HTML files, which
are served network-first, so it lands on the first online load; nothing in it
needs a script that rides stale-while-revalidate to agree with it.

**Share list** is the way across, but only because `buildShareLink()` makes it
one: on any draining hostname it builds the link against `hallgui.de` instead
of the current origin (`LEGACY_HOSTS` / `SHARE_ORIGIN` in `js/app.js`). Left to
`location.origin` it would return a link to the origin the list is trying to
leave, which moves nothing.

Nothing on any old hostname looks broken, so `offerMove()` (also `js/app.js`)
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

The notice is remembered in `gc2026.moved.v3` as soon as it is answered either
way. It appears on the guide only; the hall map has no toast of its own, so a
visitor who lands straight on `map.html` sees it when they next open the guide.

**The key's version tracks the destination, not the notice.** It was `…v1` while
`gamescom.guide` was the address and `…v2` while `gc26.guide` was, and each bump
is what reopens the notice for everyone who already answered the previous one.
Answering does not settle anybody permanently: it moves them to whatever the
answer pointed at, and twice now that has become a host which is itself
draining. Someone who accepted at v1 is sitting on `gamescom.guide` with a
remembered "yes"; someone who dismissed at v2 is still where they were with a
remembered "no". Both need telling once more, and only once.

`sw.js` bumps alongside it — `v7` for the `gc26.guide` move, `v8` for this one.
Without that, the old `app.js` is served stale-while-revalidate on the first
load back, and an `app.js` that has never heard of the new address cannot offer
the move it exists to offer. Whenever `MOVED_KEY` changes, `VERSION` changes
with it.

`LEGACY_HOSTS`, `SHARE_ORIGIN`, `offerMove()`, `buildMoveLink()`,
`gc2026.moved.v3`, both copies of the first-arrival redirect and the
`gc2026.installed.v1` marker that feeds it all come out once every old hostname
is finally retired. The
`t`/`d`/`p`/`q`/`m` params stay — they are the share dialog's own format now —
and only the v1 `l=` decode path goes, once links made before the format
change stop turning up.

## Rolling back

`wrangler deployments list` shows the history and `wrangler rollback` returns to
the previous one, which is the fastest way out of a bad data push. Reverting the
commit on `main` and letting the workflow run is the durable fix — do that too,
or the next push carries the same broken file back to the edge.
