# Deploying

The guide is hosted on **Cloudflare Workers** as a hybrid Worker: the site is
still a directory of static files served directly from the edge, while the
selective `/api/*` route runs `worker/index.js` for live queues. D1 holds the
short-lived reports. `.github/workflows/cloudflare.yml` verifies pull requests
and deploys `main`; `wrangler.toml` holds the bindings and routing.

The client still has no compilation step. `tools/build-site.sh` copies it into `dist/`,
which is the directory the Worker serves, because an asset directory has to hold
the site and nothing else — aimed at the repo root, a deploy ships the docs and
`wrangler dev` reloads forever on its own scratch files. The script classifies
every top-level entry as site or not-site and fails if it meets one it does not
recognise, so a new asset directory stops the deploy instead of 404ing quietly.
`worker/`, tests and package metadata are explicitly classified as not-site and
must never appear below `dist/`.

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
their domains, at a reported €100,000 Streitwert. Being probably-fine is not
worth establishing during the show itself.

**`gc26.guide` chose to go.** Nothing was wrong with it. It is an abbreviation
with a year in it: fine to type, useless to say across a queue, and due for
replacement again next August. The cost of moving was only ever going to rise —
it was a day and a half old, and the printed QR codes had not been made yet, so
the moment to fix it was before anything set.

**`hallgui.de` is the one that stays.** It names what the guide is built around,
the hall map. It reads as "hallguide" once the dot stops being punctuation. And
it has no year in it, so this is the last time.

The trade-off is that a domain hack is cleverer written than spoken, which is
why `hallguide.de` — the spelling somebody who only *heard* the name would
reach for — is owned and redirected rather than left for a squatter. Owning
both is what lets the name be said out loud without a spelling lesson.

What none of this changed is the guide calling the show by its name: the title,
the home-screen label, the copy throughout. That is referential use, it is what
the imprint's non-affiliation notice exists to support, and it is not the part
that draws letters. The domain was the exposed part, and it is the only part
that ever moved.

`hallguide.de`, `gc26.de`, `gc2026.de`, `gc27.de`, `gcgui.de` and `gcguide.de`
redirect to `hallgui.de` (step 6). They are aliases, not origins.

## One-time setup

1. **Add `hallgui.de` to Cloudflare** as a zone and point the registrar at
   the nameservers Cloudflare gives you. The deploy attaches a custom domain,
   which Cloudflare can only do inside a zone it controls — so the zone has to
   exist and be active before the first deploy can succeed. The same goes for
   each hostname still draining, and for the six alias names in step 6.

2. **Create an API token** — Cloudflare dashboard → My Profile → API Tokens →
   *Create Token* → start from the **Edit Cloudflare Workers** template, then
   add **D1 (edit)** so CI can apply tracked migrations before the Worker is
   deployed. The rest is Workers Scripts (edit), Workers Routes (edit), DNS
   (edit) and Zone (read). Scope it to the account and to the zones the guide
   will be served from.

3. **Add two repository secrets** (Settings → Secrets and variables → Actions):

   | Secret | Value |
   |---|---|
   | `CLOUDFLARE_API_TOKEN` | the token from step 2 |
   | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → Workers & Pages → Account ID |

4. **Complete [Queue backend: first deployment](#queue-backend-first-deployment)**
   first: create both D1 databases, replace and commit both draft UUIDs, apply
   the migrations, verify staging, and set the production admin secret. Only
   then push to `main` (or run the workflow by hand). The production workflow
   can now migrate the real database before it creates or updates the Worker
   and attaches `hallgui.de`.

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
   zones is a tedious afternoon rather than a hard one, and the target string
   is identical on every one of them, so it is copy-paste with the hostname
   changed.

## Queue backend: first deployment

Use Node 22 or newer. Production and staging must have separate D1 databases;
the ordinary `gc2026-guide.<subdomain>.workers.dev` address belongs to the
production Worker and is **not** a staging environment. `wrangler.toml` defines
an explicit `staging` Worker with no custom-domain routes for this reason.

1. Install the pinned development tools and authenticate:

   ```sh
   npm install
   npx wrangler login
   ```

2. Create both databases in Western Europe. Wrangler prints each UUID. Replace
   the draft production UUID in the top-level `QUEUE_DB` binding and the draft
   staging UUID in `env.staging`'s `QUEUE_DB` binding:

   ```sh
   npx wrangler d1 create gc2026-queues --location weur
   npx wrangler d1 create gc2026-queues-staging --location weur
   ```

   Do not point both environments at one UUID: a phone test that purges a queue
   must not purge the live show. Commit the resolved binding ids once created.

3. Apply the tracked migration to staging first and set its admin secret. The
   secret prompt is interactive; never put the token in this repository or a
   command argument.

   ```sh
   npx wrangler d1 migrations apply QUEUE_DB --remote --env staging
   npm test
   npx wrangler deploy --env staging
   npx wrangler secret put ADMIN_TOKEN --env staging
   ```

3b. Provision Turnstile. Both halves go together — a site key the client sends
   and a secret the Worker verifies with — and until both exist the Worker
   accepts reports unverified rather than rejecting everyone, which is what
   makes deploying before this step safe.

   In the Cloudflare dashboard, **Turnstile → Add widget**. Set the widget mode
   to **Invisible**, and list every hostname the guide answers on in one widget
   rather than making several: `hallgui.de`, `gamescom.guide`, `gc26.guide`,
   `gc2026.inventivetalent.org`, both `workers.dev` names, and `localhost`.
   Then:

   ```sh
   # the site key is public — paste it into TURNSTILE_SITEKEY in js/queue.js
   npx wrangler secret put TURNSTILE_SECRET --env staging
   npx wrangler secret put TURNSTILE_SECRET
   ```

   Commit the site key with the deploy that turns enforcement on, so client and
   Worker cross over together. `/api/admin/data` reports `turnstile.configured`
   and `turnstile.enforcing`; check both read `true` after the deploy, because
   a missing secret is otherwise a silent hole rather than an error.

   **If it goes wrong during the show**, the moderation page has *Turnstile
   off*. That leaves reports flowing and still logged while you look into it —
   the failure mode this guards against is honest visitors being refused on
   hall Wi-Fi, and it is the one failure the show floor cannot wait out.

4. Before the show window opens, run the full behavioral loop locally with the
   time-controlled setup below and two independent browser profiles: join the
   same queue, update people-ahead after the throttle window, enter, and confirm
   the other profile sees the aggregate after the cache window. On the real
   staging hostname, verify routing and environment isolation instead: static
   pages answer 200, live/report endpoints return the intentional out-of-hours
   403, and `/api/admin/` can authenticate, deny a planted UUID, purge an empty
   queue, force/clear closure, and pause/resume writes. A deployed staging
   Worker deliberately has no clock override.

   During an actual Aug 26–30 access window, repeat the two-device live loop on
   staging as a launch-day check. This is not a pre-show deployment gate: making
   it one would be impossible while both client and Worker correctly enforce
   the event calendar.

5. Only after staging passes, migrate production and set its independent token:

   ```sh
   npx wrangler d1 migrations apply QUEUE_DB --remote
   npm test
   npx wrangler secret put ADMIN_TOKEN
   ```

   The GitHub token now also needs **D1 edit** permission. The workflow applies
   pending production migrations before it deploys the matching Worker, then
   performs the normal deploy. Keep migrations backward-compatible: rolling
   back Worker code does not roll back a D1 schema.

For local work before Aug 26, copy `.dev.vars.example` to `.dev.vars`, apply
the migration with `--local`, stage the assets, run `npx wrangler dev`, and open
`http://localhost:8787/?queue-dev=1`. The configured instant is the local
clock's starting point and advances with real elapsed time, so the two-minute
throttle can be checked normally. It is honored only when the separate
`QUEUE_TEST_CLOCK_ENABLED=local-development-only` opt-in is also present; both
values live in the ignored local Worker environment and neither belongs in
deployed configuration. Production never accepts a browser-supplied clock.

Deploying from a laptop works the same way and needs no secrets — `npx wrangler
login` once, then:

```sh
npx wrangler d1 migrations apply QUEUE_DB --remote
tools/build-site.sh && npx wrangler deploy
```

`tools/build-site.sh && npx wrangler dev` serves `dist/` under the same routing
rules as production, which is the way to check the routing itself. For ordinary
work keep using `python3 -m http.server` in the repo root: it serves the real
files, so an edit shows up on reload instead of after another `build-site.sh`.

## Verifying a deploy

```sh
curl -sI https://hallgui.de/          | head -1   # HTTP/2 200
curl -sI https://hallgui.de/map.html  | head -1   # HTTP/2 200 — not a 307
curl -s  https://hallgui.de/data/meta.json | head -c 120
curl -sD - -o /dev/null https://hallgui.de/api/queue/live | sed -n '1p;/cache-control/ip'
curl -sD - -o /dev/null https://hallgui.de/api/not-a-route | head -1  # 404, never index.html
curl -sD - -o /dev/null https://hallgui.de/api/admin/ | sed -n '1p;/cache-control/ip'
curl -sI https://gc26.de/             | head -2   # HTTP/2 301 → https://hallgui.de/
```

The second one is the check that matters. `/map.html` must answer **200**, not a
redirect to `/map`. A redirect there gets the hall map filed under the guide's
own cache key, so the app opens on the wrong page, and it leaves the precached
copy of the map unusable offline — which is the one place the map is for.
`html_handling = "none"` in `wrangler.toml` is what keeps it a 200, and the
comments there spell out the mechanism.

Then open the site, load a hall map, turn the network off and reload. If the
guide and the map both still come up, the shell cached correctly.

During show hours, also join a low-risk test queue, verify the POST response is
`no-store`, and watch a second device receive it within the 60-second edge
window. In DevTools → Application → Cache Storage, no `/api/` URL may appear.
Visit `/api/admin/`, return to the guide, go offline and reload: the guide (not
the admin shell) must still be the `./` navigation fallback. The live endpoint
returns 403 outside an active show-hours window and 410 after the final window.
During a scheduled window, either status indicates a clock/timezone
configuration fault, not an empty-data state.

## Retiring the old hostnames

All three of `gamescom.guide`, `gc26.guide` and `gc2026.inventivetalent.org` are
served by the Worker off this same deploy, so none can drift behind. None is a
redirect, and that is the point: the service worker, the saved list, the
itinerary and the played marks are all per-origin, so a redirect would strand
every plan built on them. They serve the guide, show the move notice once, and
come off when the people on them have had a fair chance to answer it.

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

`sw.js` bumps alongside it — `v7` for the `gc26.guide` move, `v8` for this one;
`v9` is the live-queue client plus its load-bearing API cache bypass.
Without that, the old `app.js` is served stale-while-revalidate on the first
load back, and an `app.js` that has never heard of the new address cannot offer
the move it exists to offer. Whenever `MOVED_KEY` changes, `VERSION` changes
with it.

`LEGACY_HOSTS`, `SHARE_ORIGIN`, `offerMove()`, `buildMoveLink()` and
`gc2026.moved.v3` all come out once every old hostname is finally retired. The
`t`/`d`/`p`/`q`/`m` params stay — they are the share dialog's own format now —
and only the v1 `l=` decode path goes, once links made before the format
change stop turning up.

## Rolling back

`wrangler deployments list` shows the history and `wrangler rollback` returns to
the previous one, which is the fastest way out of a bad data push. Reverting the
commit on `main` and letting the workflow run is the durable fix — do that too,
or the next push carries the same broken file back to the edge.

A Worker rollback does not undo a D1 migration or resurrect rows removed by a
moderation action. Migrations therefore stay additive/backward-compatible, and
the previous Worker must remain able to run against the new schema. If the API
itself is the incident, pausing writes in `/api/admin/` keeps reads available
while the code rollback propagates.

## After the show

The privacy promise requires deletion, but delete in a recoverable order:

1. Let the final close + 30-minute window pass and verify the deployed API now
   returns 410 for live reads and ordinary writes without querying D1. A valid
   deferred `entered` outcome is the deliberate exception: it may still close
   its existing, server-anchored session after a phone regains reception.
2. Keep D1 for the 24-hour retention horizon after the final window so the
   last legitimate deferred outcomes can land and the hourly cleanup can remove
   their device-linked rows. Then export anything genuinely needed for an
   aggregate, non-device-linked postmortem, and remove that temporary export
   once the postmortem is done.
3. Confirm no open session remains. Remove both D1 bindings, the cron trigger
   and rate-limit bindings from `wrangler.toml`, remove the admin secret, and
   deploy once more. Verify that ordinary requests and an old deferred
   completion both receive 410; the Worker's missing-binding guard makes this
   an intentional end-of-event response instead of a database error. CI detects
   the removed production binding and skips its normal migration step for this
   teardown deploy.
4. Only after that unbound deploy is live, delete the staging and production
   D1 databases from the Cloudflare dashboard or with `wrangler d1 delete`,
   recording the exact names you confirmed. This is destructive and Time
   Travel is not a substitute for the stated deletion. Keep the client date
   gate and API 410 behavior so an old installed PWA fails honestly rather
   than falling through to the SPA shell.

Do not delete D1 first: an installed client still carrying the pre-close script
would turn a missing binding into a 500, while the staged 410 gives it the
intentional, truthful end-of-event response.
