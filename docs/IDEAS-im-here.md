# Ideas: "I'm here" — advice that starts from where you stand

Written 2026-08-24, two days before the doors, against revision 47. Line
numbers are from that revision and will drift.

The plan, the route, Today and the map all assume one thing without ever
saying it: that you are wherever the plan says you should be by now. Follow
the arranged order and every piece of advice is right; wander — which is what
a show floor does to everyone by 11:30 — and the guide keeps advising the
person who didn't. There is no way to tell it "actually, I'm in hall 8", and
nothing that lets an impromptu stop become part of the day instead of a
detour the guide never hears about.

This document is the survey for fixing that: what a position would have to
be, the ways a visitor could set one, what it would feed, and the order I'd
build it in. The short version: **most of "I'm here" can be inferred from
things the visitor already tells us, one tap on the map covers the rest, and
geolocation is the wrong tool for this building.**

---

## Where the plan-following assumption actually lives

An inventory, because the fix has to land in each of these seams:

- **The walking route is absolute, not relative.** `routeGroups()` orders
  halls ascending (`js/app.js:4682`), and the "next door / across the site"
  steps on each hall heading measure from the *previous group in the plan*
  (`routeBoard`, `js/app.js:4831`) — the first hall gets no steps at all
  (`from: null`). Deviate once and every label describes somebody else's
  walk.
- **Today's "go here first" ignores where you are.** `todayFirstEntry()`
  (`js/app.js:5266`) picks the worst queue of the day's remaining stops.
  Right answer at the door in the morning; at 15:00 in hall 9 the honest
  answer weighs the 95-minute line across the site against the 25-minute one
  you are standing next to, and nothing here can.
- **The map walks the same fixed order.** The day route numbers pins in plan
  order (`routeStops()`, `js/map.js:1745`) — which is correct and must stay —
  but the legs bar's "and then where?" (`dayHalls()`, `js/map.js:1782`) also
  answers from the plan sequence, never from the hall you're standing in. A
  bare `map.html` opens on `DEFAULT_HALL` 7.1 (`js/map.js:50`) rather than
  on your hall.
- **Reporting an impromptu queue means finding it first.** The Live queues
  tab searches all ~160 queues (`buildQueueIndex`, `js/app.js:5937`), or
  arrives pre-scoped from a booth's card (`#queues?ex=`, `js/app.js:2223`).
  Both assume you approached through the guide. Standing in a line you
  joined on a whim, typing the booth's name into a search is the only way
  in — which is exactly the moment (phone in one hand, spot in the queue at
  stake) the flow should be shortest.
- **An unplanned visit never becomes part of the day.** Save exists on the
  card and the map sheet, day assignment lives in the planner — so a booth
  you walked into because the line was short stays invisible to Today, its
  ✓ lands in no day's Done fold, and the "N of today's stops fit" arithmetic
  (`todayFit`, `js/app.js:5227`) counts a day you are no longer having.

And one asset, sitting unused: **the guide already knows, booth-accurately,
where you are at exactly the moments that matter.** A queue join
(`js/queue.js:657`) is a statement that you are physically standing at that
exhibitor's booth — you just counted the people ahead of you. `update`,
`entered`, `left` and a closure vote are the same statement at later moments.
The `✓` is one more: you tick it walking away from the demo. Every one of
these is timestamped, and nothing reads them as a position.

---

## What a position has to be

**Hall-granular, booth-level when it's free.** Everything the consumers below
need — steps, scope, "near you" — is keyed by hall (`hallSteps`,
`js/app.js:4627`, already computes between-hall distance over the campus
adjacency). A booth refines the advice when we have it (queue join, ✓, a
tapped stand) but must never be *required*: nobody should scroll a booth
list to say which aisle they're in. Fourteen-ish halls is a tappable set;
~1,900 booths is not.

**Fresh or absent.** A position from 45 minutes ago is wrong more often than
it is right, and advice built on it is worse than the plan-order advice we
give today. So it decays — read as null past ~45 minutes, never across a
date — the same shape as the queue tiers' `FRESH_SECONDS`
(`js/queue.js:48`). Every consumer degrades to exactly today's behaviour
when the position is null; a visitor who never touches any of this loses
nothing.

**An input to advice, never a record.** It does not write `planorder`, does
not mark anything played, does not ride in any link the guide builds, and
does not leave the device — it is one hall number in `localStorage`. The
plan stays the record of intent; the position is the fact the advice reads.
That framing is the whole fix for "relies on following the plan exactly":
deviation stops being an error state because the plan was never the thing
claiming to know where you are.

**One truth for two pages.** The map will write it and the guide will read
it (and vice versa), which is `js/marks.js`'s own charter — the rules both
pages must agree on, byte for byte. `gc2026.here.v1`, shape
`{ hall, ex?, at, src }`, synced across tabs by the `storage` event like
every other key. `ex` is the exhibitor id (a `dir:` key for a business
stand), kept alongside `hall` so neither page needs the other's data files
loaded to answer "which hall".

---

## Ways to set it

### A. For free, from what the visitor already says — the backbone

Stamp the position from statements of physical fact the app already
handles:

- any queue action — join, update, entered, left, a closure vote — stamps
  that exhibitor's hall and booth;
- ticking `✓` played (false→true only, and only while the doors are open
  per `dayStatus` — people tidy their lists from the hotel at night).

Zero new UI, and it covers precisely the moments the plan advances. The
stamp must happen in the *gesture* handlers in `js/app.js`, not inside
`js/queue.js`'s transport: a deferred `entered` replays when the network
returns (`replayPending`), possibly hours later from a train, and the
transport layer must not claim you're still at the booth.

The rule that keeps this honest: **only statements of fact set a position —
never attention, never intent.** Opening a hall on the map is browsing;
saving a booth is wanting; neither means standing there. The moment the
guide mistakes looking for being, one wrong "you're in hall 4" teaches the
visitor to distrust every position-flavoured line it ever renders.

Weakness, stated: the signals are sparse. Between a ✓ in hall 6 and the
next action, a visitor can cross the whole site unseen. That is what B and
C are for — and why decay matters more than coverage.

### B. One tap on the map — "I'm in this hall"

The map is the thing you open *because* you're somewhere, and the hall on
screen is usually the hall around you. A small control on the hall screen —
"I'm here" beside the hall's name, plus the same chip in the stand sheet
(`map.html:180`) for booth accuracy with zero new gestures — sets the
position explicitly. This is the correction path and the cold-start path in
one, on the page that already thinks spatially. Show days only, like every
queue surface (`QUEUES.visible()`, dev override included).

### C. Today asks, once, when it can't know

A quiet line in Today's header while the doors are open and the position is
null or stale: *"Where are you?"* followed by hall chips — today's plan
halls first (that's usually the answer), the rest behind an "elsewhere"
expander, reusing the day-chip pattern. Once set it collapses to
*"You're in hall 8 · change"*. This is the only place the guide ever
volunteers the question, and it earns the space by replacing advice that
would otherwise be silently wrong.

### D. Per-stop check-in on route rows — probably not

"I'm at this stop" on every Today row sounds natural and duplicates what A
already gives (arriving at a planned stop, your first act is joining its
queue or playing it), while adding a fourth action to a row that carries
three. The impromptu half of it — "I'm at a booth that *isn't* on today" —
is better handled on the consumer side (see below) than by another button.
Verdict: skip, revisit only if A's signals prove too sparse in practice.

### E. Geolocation — measured, not asked: no

Tempting precisely because it removes the tap, and wrong for this project
three ways. Nothing in the repo is georeferenced — `campus.json` says of
itself it is a diagram fitted to artwork, not a plan, and carries no
lat/long anywhere, so there is nothing to project a fix *onto* without
first surveying anchor points. The halls are steel boxes in which phone GPS
is at its worst, and a confidently wrong "you are in hall 4" violates the
rule the map already states for its route line (`js/map.js:1710`): never
draw as fact the one thing a visitor would follow literally. And a
permission prompt for location, from a guide that self-hosts fonts to avoid
leaking an IP to Google, spends trust for a tap it barely saves. If it ever
returns, it returns as a *suggestion* ("Are you in hall 8?") — never a
silent set.

### F. Booth-number entry / QR — no

Every stand wears its number, and `boothCodes()` (`js/marks.js:254`)
already normalises them — a "booth A-061" field would be precise. But
typing beats nobody's one tap, the numbers are exactly what people misread,
and QR would need signage this guide doesn't control. The map sheet chip in
B gives booth accuracy to anyone who wants it.

---

## What it would feed

In value order; each degrades to current behaviour with no position set.

1. **Today's strip answers "from here".** `todayFirstMarkup`
   (`js/app.js:5285`) grows position-awareness: name the remaining stops in
   *your* hall first, then the nearest next stop with its steps and wait,
   and keep the worst-queue line when it differs — *"You're in 8: Ubisoft
   is here (15 min). Nearest next: Capcom, next door (25 min). Longest
   left: Nintendo, across the site (95)."* Distance is `hallSteps` from
   you; ties break on shortest wait. This single strip is most of the
   feature's value.
2. **"You are here" on the route.** The hall heading matching your position
   gets a marker; the first group's steps read from your hall instead of
   from nothing (`js/app.js:4831`). The between-hall steps on the *other*
   headings stay measured from the previous group — they describe the walk
   the list is, not fourteen distances from you.
3. **The map opens where you are.** A bare open lands on your hall instead
   of 7.1; the overview and the hall chip row mark it. A few lines each.
4. **Queues around you.** A hall scope beside the existing exhibitor scope
   (`queueScopeEx`, `js/app.js:5934`): with a position set, the Live queues
   tab offers "near you" — the dozen-odd queues of your hall, join buttons
   ready — and unscoped search results rank your-hall matches first. This
   is the impromptu-line fix: any queue on the floor becomes two taps, no
   typing.
5. **Impromptu stops fold into the day.** With a booth-level position at a
   stop that is saved but not on today, Today's footer offers *"You're at
   Capcom — put it on today?"* (`assignToDay`, `js/app.js:1781`). At an
   unsaved booth, the queue row you're already touching offers save. The
   visit becomes part of the record the moment it happens, instead of never.
6. **The go-now lens** (`IDEAS-show-days.md` #7) gets its missing input:
   "worth doing in the next twenty minutes" is unanswerable without knowing
   where the twenty minutes start. With position + `hallSteps` + live
   waits, it becomes an honest screen. Build after v1.
7. **Deadlines and fit, refined.** `stopDeadline`/`todayFit` could add a
   coarse walk allowance (steps × a few minutes) from your position. Only
   worth doing alongside the walk-time module idea #2 wants, and only with
   the "~" the campus data demands.
8. **Entrances are positions too.** `campus.json` carries the four gates
   with coordinates; "at Entrance Nord" is the 09:00 special case of this
   whole feature and feeds idea #5's morning picker. Compatible extension,
   not v1.

---

## The invariants this must respect

- **A lens, never a rearrangement.** The position never writes
  `gc2026.planorder.v1` and never silently reorders the board or the map's
  pins — pin 3 stays the third row of the list it was read from
  (`js/marks.js:129`). Anything that *sorts* by position is its own,
  explicitly-entered lens (the go-now screen), not a mutation of the
  walking route.
- **Progressive, like the live layer.** Position-less renders are today's
  renders. No consumer may get worse for a visitor who ignores the feature
  entirely — the same contract the queue chips honour.
- **Show days only, local only.** The controls appear with the queue
  surfaces and vanish with them; the stored value is one hall number that
  never leaves the device and never rides in a share link — the same
  stance `?now` and `?lang` take on URLs.
- **No new timers.** Decay is checked at read time; nothing polls. Power
  saver has nothing to pause.

---

## The slice I'd build first

Two days out, smallest coherent v1: the `gc2026.here.v1` module in
`js/marks.js`; the implicit stamps (A) in the queue-action and played
handlers; the map's "I'm here" hall control and sheet chip (B); consumers
1, 2 and 3. That is a position that mostly maintains itself, one tap to
correct, and Today/map advice that starts from it — no worker changes, no
schema, no new storage beyond one key, offline like everything else.

Then, in order: C (Today's ask-once row), 4 (queues near you), 5 (fold-in),
and 6 once the show has proven the position trustworthy. E and F stay
rejected until someone surveys anchor points or prints stickers, and D
stays out unless the implicit signals turn out too sparse on day one.
