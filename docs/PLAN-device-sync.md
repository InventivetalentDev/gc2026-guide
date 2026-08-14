# Device sync for the saved list

## Context

`claude/old-domain-notice` taught the guide to carry a whole plan across a hop:
`buildMoveLink()` emits the share payload plus `p` (played marks) and `d` (day
assignments), and the receiving side already merges all three and restores all
three on Undo. But it is wired to exactly one crossing — the legacy hostname —
with `SHARE_ORIGIN` hard-coded as the destination and `offerMove()` as the only
caller. The **Share list** control still emits `l=` alone.

Two devices belonging to the same person want that payload and cannot reach it.
This plan promotes it into the share dialog behind an explicit mode, adds the
toggles that stop a casual share from leaking your progress, replaces the
encoding with one that fits a QR code, and settles what "sync" means when the
answer cannot be "merge everything forever".

Three things are wrong today, in order of how much they bite:

1. **The QR code is already broken.** At revision 20 the guide holds 75
   exhibitors and 142 distinct game keys. Exhibitor ids ride verbatim and now
   average 9.6 characters (`tencent-worlds-of-play` is 22). A 30-item saved list
   builds a 279-character URL against a 213-byte cap — `qrSvg()` returns null and
   the dialog falls back to "too long for a QR code". The practical ceiling is
   **about 19 items**, down from the ~30 the original plan sized for when the
   data held 38 exhibitors and 112 games. Desktop → phone is exactly the hop the
   QR exists for, and it is the hop that has quietly stopped working.
2. **Everything or nothing.** A move link carries played marks unconditionally.
   Handing a friend your plan should not hand them your progress through it, so
   the payload needs per-part toggles rather than one flag.
3. **Deletions never propagate.** `applyIncoming()` is a pure union. Remove a
   booth on the PC, share back to the phone, and it returns; hop again and it is
   restored on the PC too. A full round trip resurrects everything you deleted.

## Design decisions (settled)

- **Mode, not inference.** The dialog asks whether this is a share or a move.
  Deriving "replace my list" from "you happened to tick played marks" would be
  spooky; the link says which it is and the receiving side acts accordingly.
- **Share merges, move replaces.** Additive union stays the rule for a shared
  link — a friend's list is not yours to prune. A self-move is a full-state
  snapshot and offers **Replace my list**, which is what makes deletion and
  rescheduling travel. No tombstones: they only buy merge-with-deletions, which
  nothing here wants.
- **Content-addressed tokens stay.** Tokens get shorter but remain hashes of
  item identity. Indices into `data/exhibitors.json` would be far more compact
  and are disqualified: the file gained 37 exhibitors and 30 games this season
  alone, so an index made at one revision decodes to a *different exhibitor* at
  the next. That is silent corruption, where the hash vocabulary's failure mode
  is the honest "not in the guide any more" the UI already reports.
- **Base36 text, not base64.** See §4 — base64 loses to base36 for the one
  metric that matters here.

## 1. Share modes and toggles (`index.html`, `js/app.js`, `css/style.css`)

Above the link field in `#share-dialog`:

```
Sharing with
  (•) Someone else        (  ) Another of my devices
What to include
  [x] Saved list (30)   [ ] Day plan (20)   [ ] Played marks (10)
```

- The mode radio sets toggle defaults — *someone else* → saved only; *another of
  my devices* → all three — and sets the `m` flag. Toggles stay individually
  adjustable after the mode picks the defaults.
- **Saved list** is always checked and `disabled`. `buildMoveLink()` already
  returns null on an empty saved list, because played marks and day assignments
  hang off saved items; keeping it mandatory preserves that invariant.
- A part with nothing in it renders `disabled` with a `(0)` count rather than
  vanishing, so the row doesn't reflow as you tick things elsewhere.
- Every change re-runs `renderShareDialog()`, which already rebuilds link and QR
  from scratch on each open — extend that to read the toggles. Nothing caches,
  so nothing goes stale.
- Mode and toggles are **not** persisted to `gc2026.prefs.v1`. They reset per
  open, which is the safe default: a played list shared once by accident is not
  a mistake that should repeat silently.

## 2. Payload v2 (`js/app.js`, sharing section)

```
#s?t=<tokens>&d=<days>&p=<mask>&q=<tokens>&m
```

Versioned by the param name, which is v1's own convention (`l` was v1): `t` is
v2, and a `v=2&l=` spelling would cost 8 characters the QR budget turns out to
need. Two more small spends of the same currency, found when the measured link
came out over budget: `#s` is `#saved` in payload links only — `parseHash()`
normalises it on arrival, so the alias never reaches the address bar or
anything that compares routes — and `m` is a bare flag, presence being the
message (the decoder accepts v1's `m=1` too).

**`t` — the saved list.** Every item, exhibitor or game alike, becomes a
**5-character base36 prefix** of the FNV-1a-32 hash of its identity string
(`ex.id` for exhibitors, `gameKey(title)` for games):

```js
const token = (identity) => hash32(identity).toString(36).padStart(7, "0").slice(0, 5);
```

Fixed width means **no separators**, which is most of the saving. Exhibitors
stop riding verbatim, so `tencent-worlds-of-play` costs 5 characters instead of
22. Tokens are sorted, so the same list still yields a byte-identical link.

Collisions are resolved by **exclusion, not salting**. If two items share a
prefix, both drop out of the encode map and the prefix drops out of the decode
map: it is never emitted, and an old link carrying it resolves to nothing and is
counted in `unresolved`. Salting is what `buildShareCodeMap()` does today, and
it is relational — which item gets salted depends on what else is in the
dataset, so adding an exhibitor can silently repoint a token in links already
shared. Exclusion can only ever lose an item, never mistranslate one, and the
loss surfaces through UI that exists: `renderShareDialog()` already says "N older
items are no longer in the guide", and the import toast already says "N aren't
in the guide any more".

At 5 characters, **0 of the current 217 items collide**, with room to roughly
1000 items before it is worth revisiting. (4 characters would save 30 more
characters on a 30-item list but already strands 2 items today.)

**`d` — the day plan.** One character per token, positionally aligned to `l`:
the base36 **day of month**, or `-` for unscheduled. A 30-item list carries its
entire schedule in 30 characters, against ~370 for the current `token~date`
pairs.

Alignment is to the token list *in the same payload*, not to external data, so
it cannot drift. The day is absolute rather than an index into `event.days` —
the same reason `3f544dc` gave for carrying dates literally, at a twentieth of
the cost. Decode maps the character back through `state.event.days`; anything
that matches no show day is dropped, the guard `loadItinerary()` already
applies. This assumes no two show days share a day of month, i.e. that the show
is shorter than a month; assert it when building the map and fall back to
omitting `d` if it ever fails.

**`p` — played marks**, as a base36 bitmask over `l` order, 5 bits per
character: 30 items in 6 characters.

**`q` — played but not saved.** The bitmask can only express played items that
are also saved, and ticking `✓` does not require saving first. These ride as
explicit tokens. Usually empty, costs nothing when it is, and without it a move
would silently drop part of what it promised to carry.

**`m`** marks a self-move (§3).

**Presence over emptiness.** A part that rides empty still writes its param:
`p=` with nothing in it says "the played part came, and it is empty", which on
a replace is the difference between clearing the local marks and leaving them
alone. An absent param means the part did not ride, and a replace leaves that
list untouched — absent is "not moved", never "none".

## 3. Merge, replace, and Undo (`js/app.js`)

| link | destination empty | destination has a list |
|---|---|---|
| share (`m` absent) | import, **Undo** — unchanged | "…N new to you" · **Add to my list** — unchanged |
| move (`m=1`) | import, **Undo** | "Your plan from another device has N items." · **Replace my list** |

Replace is the whole point: it is the only path on which a removal, a
rescheduled day, or an untick travels. `applyIncoming()` grows a replace branch
that assigns the three lists instead of unioning them, then calls
`pruneItinerary()` and `persistMarks`/`persistItinerary` as it already does.

Merge changes in one deliberate way: an incoming day assignment fills blanks
only, never overwriting a day the visitor already chose. The move payload's
`.set()`-over-local behaviour was fine for a one-time migration onto an empty
device, but a friend's link rescheduling your own booth silently is not an
addition — overwriting is now exactly what replace is for, and nothing else
does it.

Undo needs no work — `3f544dc` already snapshots saved, played and itinerary
together and restores all three, precisely so a move landing on a used device
stays reversible. Replace inherits that for free.

Two constraints worth stating rather than discovering:

- `showToast()` takes **one** action. A move therefore offers Replace *or*
  nothing, not "Replace / Merge". If both are wanted, the toast needs a second
  action slot — a real change to `renderToast()` and its markup, and out of
  scope here.
- Replace is destructive in a way nothing else in the guide is, so the toast
  must name what goes: "Replace my list (12 items you have here aren't in it)".

## 4. QR capacity (`js/qr.js`)

Measured end-to-end against the real encoder at the production origin, 30
saved items with 20 scheduled and 10 played:

| | chars | QR |
|---|---|---|
| v1 share link, saved only | 279 | no |
| v1 move link, all three | 749 | no |
| **v2, saved only** | **178** | yes |
| **v2, saved + day plan** | **211** | yes |
| **v2, all three** | **222** | no |

So v2 fixes the common cases: a plain share and a share-with-schedule both
scan, where today a plain share of 20 items already does not. The full
three-part move misses at 30 items and fits at around 24 — and it is also the
one case that least needs a QR, since `q` and the played bitmask only matter
device-to-device, where the link travels by messenger as easily as by camera.
The saved + day plan number is why the format is as terse as it is: it fits
the 213-character cap with 2 to spare, found only by measuring — the estimate
in the planning stage said 209 and was wrong by enough to matter.

**On base64.** For an ASCII token string it is a straight 4/3 expansion. Packing
the hashes as raw bits first does help — 103 characters against 116 for the same
saved list, about 11% — but it is the wrong trade for a QR code. QR's
**alphanumeric mode** encodes `0-9 A-Z` and a few symbols at 5.5 bits per
character against byte mode's 8, and uppercase base36 sits inside that charset
while base64url's lowercase, `-` and `_` do not. Base36 text in alphanumeric
mode beats packed base64 in byte mode by roughly 22%, and stays greppable in a
bug report. Base64 is worth revisiting only if the payload ever stops being
hashes.

If the three-part move needs to scan at 30+ items, two ways to buy room, both
deliberately deferred out of this plan:

- **Extend `RS_BLOCKS`/`ALIGNMENT` to versions 11–15.** ~10 lines of table data;
  v15/M byte mode holds 412 characters against v10's 213. Nearly double, for
  almost no code. Cost: 77×77 modules against 57×57, so the printed code gets
  visibly denser and phone cameras have to work harder.
- **Add alphanumeric mode.** +46% at the same module density (311 characters at
  v10/M), but the payload charset loses `?`, `=`, `&` and `_`, so the query
  syntax would have to be rebuilt on `.`/`-`/`:` and `parsePayload()` rewritten
  off `URLSearchParams`. It also needs mixed-mode segments, since `#` is not in
  the alphanumeric charset either.

Take the first if it becomes necessary; the second only if module density turns
out to matter more than implementation cost.

## 5. Compatibility

v1 links exist in the wild and must keep working. They carry `l`, v2 carries
`t`, so detection is one `has()` call. `parsePayload()` branches once at the
top and keeps `resolveTokens()`/`resolveDays()` intact for the v1 path;
everything downstream of `incoming` is shared, including `m=1` from the old
deploy's move links reading as a move.

`buildShareCodeMap()` builds both vocabularies — v1's variable-length codes for
decoding old links, v2's 5-char prefixes for everything new. Both derive from
the same data in one pass.

The pending-payload path needs no change: `takeIncomingList()` already stashes
the whole query string in `sessionStorage`, so a v2 payload survives an
unanswered prompt exactly as a v1 one does.

## Files

| file | change |
|---|---|
| `js/app.js` | v2 encode/decode, mode + toggles in `buildShareLink()`/`renderShareDialog()`, replace branch in `applyIncoming()`, v1 fallback in `parsePayload()` |
| `index.html` | mode radios and three toggles in `#share-dialog` |
| `css/style.css` | mode row, toggle row |
| `README.md` | sharing section: modes, what each carries, replace semantics |
| `data/changelog.json`, `data/meta.json` | revision entry |
| `sw.js` | cache VERSION bump — see below |

`js/qr.js` is untouched — v2 fits the existing encoder for the cases that matter.

One deploy-mechanics lesson, learned by reproducing it: the SW serves
`index.html` network-first but `js/app.js` stale-while-revalidate, so the
first load after this deploy pairs the new dialog markup with the old script —
toggles that render but do nothing. Bumping the cache VERSION makes the new
worker announce itself through the existing update toast, whose Reload lands a
coherent shell; and the share bindings tolerate the reverse pairing (new
script, cached pre-modes markup) by the `bindSourcesDialog` rule, degrading to
a saved-only share instead of throwing.

## Verification

Serve locally (`python3 -m http.server 8000`) and walk these:

1. **The round trip that fails today** — save 8 items on A, share to B, add 2 on
   B, remove 1, schedule 3, move back to A with all toggles on and Replace: A
   ends up matching B exactly, deletion and schedule included.
2. **Share stays additive** — the same link built in *someone else* mode offers
   **Add to my list**, and the removed item survives on the receiving side.
3. **Toggles** — untick day plan and played; the link loses `d`, `p` and `q`,
   and the receiving side reports only the saved list. Tick played on a device
   with no saved items and confirm the row is `disabled` at `(0)`.
4. **QR** — 30 items saved-only and saved+schedule both render; scan each with a
   phone and confirm it opens the same link. All three parts at 30 items must
   show the "too long" fallback rather than a broken code, and must fit at 20.
5. **Replace is reversible** — Undo after a replace restores saved, played *and*
   day assignments exactly, and survives a reload.
6. **v1 links** — a link captured from `main` before this change still imports,
   still reports stale tokens, and still offers **Add to my list**.
7. **Stable links** — building the same selection twice yields a byte-identical
   URL, per mode.
8. **Collision exclusion** — hand-add two exhibitors whose ids collide at 5
   characters; both must disappear from the share count with the "no longer in
   the guide" note, and neither may decode to the other.
9. **Stale day** — hand-edit a `d` character to a day outside `event.days`: that
   assignment drops, everything else imports.
10. **Consume once** — after either import the bar reads `#saved`, and reloading
    does not re-offer. Dismissing and reloading re-offers, once.
11. **Regression** — the legacy-host move notice, `#saved` routing, cross-tab
    `storage` sync and the SW update toast all still behave.

Then commit to `claude/sharing-behavior-devices-cijcu2` and push.
