# Shareable saved list (FEATURE-IDEAS #2)

## Context

The saved list (added in rev 3, `js/app.js`) lives only in `localStorage` under
`gc2026.saved.v1`. A plan built on a desktop can't be carried to the phone you
actually walk the halls with, can't be sent to the friend you're going with, and
dies with a cleared browser. `docs/FEATURE-IDEAS.md` ranks this as the best
effort-to-value item, with the constraint that the site stays fully static — no
build step, no backend, works offline.

The fix: encode the saved list into the URL fragment, share it, and offer it as
an *addition* on the receiving side. A QR code covers the desktop → phone hop,
where copying a link between devices is the awkward part.

Outcome: a **Share list** button that produces a link like
`https://…/#saved?l=xbox.capcom.k3f9a1.b72xd8` plus a scannable QR, and a
receiving side that never silently overwrites what's already saved.

## Design decisions (settled)

- **Compact tokens.** Exhibitors ride as their own slug id (38 stable, readable
  ids); games as a short base36 hash resolved against current data. Keeps links
  short enough for a small QR.
- **Ask, then merge.** Empty local list → import straight away with Undo.
  Non-empty → the toast offers "Add to my list" and nothing changes until it's
  tapped. Nothing is ever replaced or deleted.
- **Hand-rolled QR**, no dependency, offline-capable.

## 1. Encoding (`js/app.js`, new "sharing" section)

Format, versioned by the param name (`l` = v1):

```
#saved?l=<token>.<token>.<token>
```

- exhibitor → `ex.id` verbatim (`xbox`, `sega-atlus`)
- game → base36 FNV-1a-32 of its `gameKey(title)` (1–7 chars)
- tokens sorted (exhibitor ids alphabetically, then game codes) so the same list
  always produces the same link

Build a code map once after `loadData()`, from the distinct `gameKey` values
already used by the bookmark sets:

```js
function hash32(s) {                      // FNV-1a, 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}
```

Iterate game keys **sorted** when assigning codes, and if a code collides with an
exhibitor id or an already-taken code, re-hash `key + "#" + n` until free — both
sides derive the same map from the same `data/exhibitors.json`. I checked the
current data: 112 distinct game keys, zero code-space pressure and zero clashes
with exhibitor ids, so the salt path is a safety net, not the common case.

Decode, per token: known exhibitor id → exhibitor; else code map → `gameKey`;
else count it as unresolved (data moved on since the link was made) and report
the count rather than dropping it silently.

Reuse as-is: `gameKey()`, `bmSet()`, `persistBookmarks()`, `savedCount()`,
`state.exhibitors`.

## 2. Hash routing (`js/app.js`)

`showView()` currently takes the whole fragment as a route name, so a fragment
carrying a param would be rewritten away. Split it:

```js
function parseHash() {
  const raw = location.hash.slice(1);
  const i = raw.indexOf("?");
  return { route: i === -1 ? raw : raw.slice(0, i), params: new URLSearchParams(i === -1 ? "" : raw.slice(i + 1)) };
}
```

- the two `location.hash.slice(1)` call sites (`main()`, the `hashchange`
  listener) become `parseHash().route`
- `syncHash()` is unchanged: it writes bare routes, which is exactly the
  "consume the link once" behaviour we want — so the incoming list must be read
  and stripped *before* anything calls it

## 3. Import flow (`js/app.js`)

`takeIncomingList()`: parse `l`, `history.replaceState` back to `#saved`
immediately (a reload must not re-prompt, and the address bar shouldn't keep
someone else's list), return the resolved `{exhibitors, games, unresolved}`.

In `main()`, after `loadBookmarks()`: take the incoming list, render, then
`showView(incoming ? SAVED_ROUTE : parseHash().route || VIEWS[0], {push:false})`
and offer the import. Add the same check to the front of the `hashchange`
listener so pasting a link into an already-open tab works.

Offer rules:

| situation | toast |
|---|---|
| local list empty | "Loaded 12 saved items from a shared link." · **Undo** |
| local list non-empty | "A shared link has 12 saved items — 8 new to you." · **Add to my list** |
| nothing resolved | "That shared list is out of date — nothing left to add." (no action) |
| some unresolved | append "2 aren't in the guide any more." |

`applyIncoming()` snapshots both sets first (that snapshot *is* Undo), unions the
incoming ids in, calls `persistBookmarks()`, then the same three renders the
`storage` listener already uses (`renderExhibitors`, `renderSavedControls`,
`renderPriority`).

## 4. Toast ownership (`js/app.js` + `js/pwa.js`)

The toast helper is currently trapped inside the IIFE in `js/pwa.js:20`, and
`pwa.js` is `defer` while `app.js` is not. Move the ~20-line `showToast` /
`hideToast` pair into the misc section of `app.js`, expose it as
`window.gcToast`, and switch `pwa.js`'s four call sites to
`window.gcToast?.show(...)`. That removes the ordering question and keeps
`pwa.js`'s stated rule — nothing in it touches the guide's content.

## 5. Share UI (`index.html`, `css/style.css`, `js/app.js`)

- `#share-list` button in `.toolbar-foot` beside `#clear-saved`, styled like
  `.reset`, shown/hidden by `renderSavedControls()` on the same `savedCount()`
  test the clear button already uses.
- `<dialog id="share-dialog">` next to the existing toast markup: item count, a
  readonly `<input>` with the link (select-all on focus), **Copy link**,
  **Share…** (only when `navigator.share` exists), the QR block, and a close
  button. `showModal()` gives Esc and focus handling for free; add a backdrop
  click-to-close listener.
- Copy: `navigator.clipboard.writeText` in `try/catch` → toast "Link copied."; on
  failure select the input and toast "Press ⌘C / Ctrl+C to copy." (clipboard is
  blocked on plain HTTP and in some embedded browsers).
- Rebuild the link and the QR on every open — cheap, and it can't go stale.

## 6. QR encoder (`js/qr.js`, new — the biggest single piece, ~220 lines)

Deliberately narrow scope: **byte mode only, ECC level M, versions 1–10**, which
is all a link of this length needs. Exposes one function,
`window.qrSvg(text) -> string | null` (null = doesn't fit).

Contents: GF(256) log/antilog tables, Reed–Solomon generator polynomials,
per-version block structure for level M (10 rows), alignment-pattern centres,
the 15-bit format BCH and the 18-bit version BCH (needed from v7 up), all eight
masks with penalty rules 1–4 scored to pick the best.

Two things to get right:

- **Render dark-on-light** — a white plate with black modules, even though the
  site is dark. Inverted QR codes defeat a lot of phone scanners; it's a
  scannable object, not a design element. Output SVG (crisp at any size,
  printable) with a 4-module quiet zone.
- **Capacity cap.** v10/M byte mode holds 213 bytes. A 20-item list is ~130
  chars, so this is comfortable, but a maximal 150-item list is not — when
  `qrSvg()` returns null, hide the QR block and show "This list is too long for a
  QR code — send the link instead."

Load it `defer` after `app.js` (only used on click) and add `"js/qr.js"` to
`SHELL` in `sw.js:28` so it's precached for offline use.

## 7. Docs and copy

- `README.md`: a feature bullet, and a note that the link encodes ids only and
  is built entirely in the browser — nothing is sent anywhere.
- `index.html:149` footer line — "nothing leaves the device" needs a qualifier
  now: "…unless you share a link yourself."
- `data/changelog.json` + `data/meta.json`: a revision 5 entry describing the
  feature, following the rev-3 precedent where the saved list itself was logged.
- `docs/FEATURE-IDEAS.md` lives on a different branch, so it isn't touched here.

## Files

| file | change |
|---|---|
| `js/app.js` | sharing section (encode/decode/import), `parseHash()`, share dialog wiring, toast moved in |
| `js/qr.js` | **new** — dependency-free QR encoder |
| `index.html` | share button, `<dialog>`, `qr.js` script tag, footer wording |
| `css/style.css` | dialog, link field, QR plate styles |
| `js/pwa.js` | toast calls delegate to `window.gcToast` |
| `sw.js` | `js/qr.js` added to `SHELL` |
| `README.md`, `data/changelog.json`, `data/meta.json` | docs / changelog |

## Verification

Serve locally (`python3 -m http.server 8000`) and walk these:

1. **Round trip** — save 3 booths and 5 games, Share, copy the link, open it in a
   private window: all 8 land, the exhibitor grid shows them, the queue-priority
   list counts them.
2. **Non-destructive** — with a different list already saved, open a shared link:
   nothing changes until "Add to my list"; then both lists are present; **Undo**
   returns exactly the previous state, including after a reload (it persists).
3. **Consume once** — after import the address bar reads `#saved`, and reloading
   doesn't re-offer the list.
4. **Paste into an open tab** — changing the hash live triggers the same offer.
5. **Stale link** — hand-edit a token to garbage: it's reported as "not in the
   guide any more", everything else still imports.
6. **Stable links** — sharing the same list twice yields a byte-identical URL.
7. **QR** — scan the rendered code with a phone camera at both dialog sizes; it
   must open the same link. If `zbarimg` is available, decode the SVG rendered
   to PNG as a second check. Then check a maximal list falls back to the
   "too long" message instead of drawing a broken code.
8. **Offline** — load once, go offline (DevTools), reload: share dialog and QR
   still work, since both are in the precached shell.
9. **Storage blocked** — Safari private mode / DevTools-blocked storage: import
   still works for the session and throws nothing (`persistBookmarks()` already
   swallows).
10. **Regression** — the existing `#saved` route, saved-only filters, the
    `storage` cross-tab sync and the SW update toast all still behave.

Then commit to `claude/sharable-saved-list-plan-dlhplp` and push.
