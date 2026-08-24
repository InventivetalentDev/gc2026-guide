# Ideas: making the guide more useful *during* the show

Written 2026-08-24, two days before the doors open, against revision 47.

The guide is built well for the week *before* gamescom: browse the exhibitors,
save what you want, arrange a plan, learn the halls. Almost everything on this
list is about the five days *after* that — the questions you ask while standing
in a hall with 4% battery, not the ones you ask on the sofa in July.

Each entry says what it is, why it matters on the floor, and what it would cost
against the code as it stands. The seams referenced are real; line numbers are
from revision 47 and will drift.

---

## 1. Today's "worst queue" is a forecast, not the live number

**What.** `todayFirstStop()` (`js/app.js:5104`) picks the stop to walk to first
by sorting today's remaining stops on `ex.crowd` — the editorial 1–5 index
written in June — and only speaks up when that index is `>= 4`. The line it
renders (`js/app.js:5203`) then reads `t("plan.queueWith", { n: first.crowd })`.

Meanwhile `QUEUES.live(queue)` is already loaded, already polled, and already
rendered on cards (`queueLiveMarkup`, `js/app.js:2146`) and on plan rows
(`itemQueueSummary`, `js/app.js:2258`). Today is the one surface that ignores it.

**Why it matters.** The whole point of Today is answering "where do I walk
first", and on Thursday morning the honest answer is not a forecast from two
months ago. It is *"Capcom — 25 min right now; Nintendo is at 95."* The forecast
and the measurement can disagree by an hour, and when they do the forecast is
the one that's wrong.

**Cost.** The smallest change on this list with the largest payoff: everything
it needs is already in memory. Prefer the live figure where one exists, fall
back to `crowd` where it doesn't, and say which of the two is speaking — the
guide labels provenance everywhere else and should here too. The `>= 4` gate
also wants revisiting: it exists because a forecast of 3 is not worth acting on,
but a *measured* 70 minutes always is.

**Watch for.** Live figures go stale and vanish (`queueAge`, the `how` tier).
The line must degrade to the forecast rather than to nothing, and must not
flap between the two on every poll.

---

## 2. Nothing in the guide knows how long anything takes

Today lists stops in hall order and stops there. There is no clock model
anywhere: no walk time, no expected queue time, no notion that the doors shut.

Three sentences fall out of putting those together, and each is a decision
somebody actually makes:

- **Next up.** *Capcom, 9.1 — two halls over, ~7 min walk, ~25 min queue.*
- **Does it fit.** *These four fit before 20:00. The fifth doesn't — move it to
  Friday or drop it.*
- **Last realistic join time.** *This line is running 90 minutes and the hall
  shuts at 20:00, so you must be in it by 18:25.* Nobody gets this right
  unaided, and it is pure arithmetic over data the guide already holds.

**What it can be built from.** `data/hallplan/campus.json` is a real graph: 11
halls, 26 passages, 3 concourses, 4 entrances, every one with coordinates.
`data/event.json` has `open`/`close` per day. `QUEUES.live()` has the waits.
`routeGroups()` already produces today's stops in walking order.

**The honest caveat, which is a feature.** `campus.json` says of itself that it
is a diagram and not a plan — fitted to Koelnmesse's artwork, ~1.4–2.1 m per
unit depending on the hall and direction, no single scale converts it to metres.
So walk estimates are coarse and must ship saying so ("~7 min", "two halls
over"). That is exactly the labelling the rest of the guide does with
`locationConfirmed` and `status`, so it fits rather than fights.

**Cost.** The largest of the top three. Wants a small routing module both
`js/app.js` and `js/map.js` can read — `js/marks.js` is the precedent for
"rules both pages must agree on", and a walk estimate that differed between the
list and the map would be worse than none.

---

## 3. The hall map has no live queue layer at all

`js/map.js` is 2,960 lines of booth-by-booth hall drawing and it never loads
`js/queue.js` — `map.html` pulls `i18n`, `marks`, `map`, `pwa` and nothing else.
So ~160 live queues exist and the one surface that could show them all at once
doesn't know they're there.

**Why it matters.** "Where is it hell right now?" is a spatial question and
deserves a spatial answer. Colouring booths by current measured wait turns the
whole floor into one glance, and it is the single most screenshot-able thing
the guide could do — which matters, because the guide spreads by being held up
in queues.

**Cost.** Mostly wiring plus a colour ramp. The app side already joins queue
data to exhibitors; the map already joins exhibitors to stands. Note the map's
existing colour language is load-bearing (cyan entertainment / purple business,
straight off the official plan), so a heat ramp has to sit *on* that without
competing with it — probably an explicit layer toggle rather than an always-on
recolour.

**Watch for.** Coverage is uneven: a booth nobody has reported is not a quiet
booth. Absence has to read as absence, not as green.

---

## 4. Everything that isn't a booth

By 15:00 on day three nobody is searching for Capcom. They are looking for a
toilet, water, a seat, a socket, and the 18+ wristband desk.

The map draws halls booth-by-booth and already carries a hand-authored layer
for things the official data doesn't file — `data/hallplan/outline.json` holds
walls and doorways for exactly that reason. A POI layer per hall belongs beside
it: toilets, food, water, seating, charging, lockers, first aid, ATMs,
wristband desks, quiet/sensory space, step-free routes.

This is probably the most-used screen in the whole guide once it exists, it is
almost entirely data rather than code, and no other fan guide does it well.
It is also the one entry here that would help disabled and neurodivergent
visitors more than anyone, which is worth doing on its own terms.

**Cost.** Low in code, real in editorial: somebody has to walk the halls or read
the official plans. Could ship hall by hall rather than all at once.

---

## 5. Morning entrance picker

Event info lists four entrances statically. The question at 09:30 is not "which
four exist", it is *which gate, given that my first stop is 7.1 and one of them
is jammed*. `campus.json` has all four with coordinates, so the "nearest to your
first hall" half is derivable today.

The crowded half is nearly free too: the queue system could carry four
pseudo-queues for gate waits without a schema change — `buildQueueAllowlist()`
in `worker/core.js` is the only thing that decides what a valid queue is.

**Cost.** Small, and front-loaded into the exact hour it's useful.

---

## 6. One-tap "this is wrong" from a card

During the show the booth numbers are at their most stale and ~160 people are
standing in front of the ground truth. `worker/admin.js` is already a
phone-first moderation console.

A correction report reusing that pipeline turns the crowd into the data refresh
loop for five days — "this booth isn't here", "the number is A061 not A060",
"this demo is gone". It fits the guide's existing stance that every entry
carries its sources and its check date: a floor report is just another source,
and the moderation step is what keeps it editorial rather than a wiki.

**Cost.** Moderate. Mostly a new report kind and a console view; the auth,
rate limiting and device-id machinery all exist.

---

## 7. Opportunistic mode — "go now"

A lens on the remaining stops (the way Today is a lens), re-sorted by live wait
ascending and proximity rather than by planned order. The plan says what you
meant to do; this says what is worth doing in the next twenty minutes, which on
a show floor is a different question.

Pairs naturally with **watch this queue** — tell me when a saved booth drops
below 30 minutes. Honest caveat: reliable only while foregrounded, or installed
on iOS 16.4+ for real push, and the guide should not promise more than the
platform delivers.

**Cost.** The lens is small — it reads the same state Today does. The alert is
the expensive half.

---

## 8. Queue mechanics as a morning instruction

`queue_meta` already stores `qtype` (`single`/`pairs`/`group`/`wave`) and
`batch` per queue, crowd-voted. The *actionable* form of that is one editorial
sentence per big booth: *"timed tickets handed out at open — be there by 09:15
or don't bother."*

For a booth like that, this is the highest-leverage sentence in the entire
guide, and it is worth nothing at 14:00. It has to be on Today, in the morning,
above everything else.

**Cost.** Small code, small editorial, high value. Arguably belongs in the
top three and only isn't because it needs facts we may not have until day one.

---

## 9. Leaving

After 18:00, and on ONL night especially, the question flips from "what next"
to "how do I get out of here". Which station, which side of the building, and
the fact that 20:00 is a crush. `data/event.json` already carries `onl`.

**Cost.** Data plus a conditional strip on Today. Cheap.

---

## 10. Power saver

The actual failure mode is a phone at 12% at 16:00, and a dead phone makes the
whole guide worth zero. A mode that stops queue polling, freezes the map and
pins Today to a static list is a small amount of code defending everything else
on this list.

Related: a "my day on one screen" view designed to be *screenshotted*, so the
plan survives the battery dying.

---

## 11. Timed programme content

Stages, signings, tournaments, meet & greets — the guide has no time-based
content at all, and "now & next near you" would be a strong Today strip.

Highest ceiling here, but it is a real editorial burden to collect and keep
correct, and two days out is the wrong moment to take it on. Noted for next
year rather than this one.

---

## Order I'd take them in

For the two days before the show: **1, then 2, then 3** — that trio answers
"what next, how long, and where is it worst", which is most of what anyone
actually asks a guide while inside the building.

**4** is the one to start collecting data for immediately even if the code
lands later, because it is the entry that needs feet on the floor.

**8** is nearly free and should be folded in wherever the facts turn up.
