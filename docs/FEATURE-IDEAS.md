# Feature ideas: visit planning

Ideas for future planning features, roughly prioritized. The guiding constraint
is the site's architecture: fully static, no build step, no backend — features
should work offline and deploy anywhere.

## Highest value, natural next steps

### 1. Day-by-day itinerary builder
The planner currently gives generic per-day advice, but saved booths/games
aren't tied to a day. Let users assign each saved item to a specific day
(Thu/Fri/…), showing that day's hours and crowd notes inline, so the saved
list becomes an actual plan.

- Bonus: "export to calendar" (.ics) button — Opening Night Live and hall
  hours are already structured in `data/event.json`.

### 2. Shareable saved list
Bookmarks live only in localStorage, so a plan is stuck on one device.
Encode the saved list into a URL (e.g. `#saved=xbox,fable,...`) to:

- sync between phone and desktop
- share a plan with friends
- survive a cleared browser

Zero backend needed.

### 3. Route view / hall grouping
Group the saved list by hall in a sensible walking order (5 → 6 → 7 → …) so
users aren't criss-crossing Koelnmesse. Even a simple "your day, ordered by
hall" view saves real walking time.

- Step further: a simple SVG hall map with saved booths highlighted —
  PWA-friendly since it works offline.

### 4. "Played it" tracking
By day two, the queue-priority list should distinguish what's already done.
A checkmark per game that greys it out and re-sorts the priority list makes
the planner useful across the whole visit.

### 5. Structured multi-booth cross-references
The data already says things like "also at SEGA's booth — compare queues" in
free-text notes. Make that a real field (`"alsoAt": ["sega"]`) so the planner
can actively suggest the booth with the shorter expected queue — one of the
biggest queue-time wins at gamescom.

## Also worth considering

### 6. Timed-events schedule
ONL, the GDQ showcase, FanFest, stage shows and signings are time-bound,
unlike booths. A schedule tab with "add to my day" and clash warnings against
the queue plan would cover the part of gamescom the exhibitor grid can't.

### 7. "Today" mode
On show days, open straight to: today's hours, the plan for today, what's
still unplayed, and a "doors close in 2h" hint. All derivable from existing
data plus the device clock.

### 8. 18+ / age-rating flag and filter
Several game notes mention "18+ wristband required". As a structured flag it
becomes filterable, and the planner can advise getting the wristband first
thing in the morning.

### 9. Prep checklist
Static content, high value: tickets bought (which day sells out), epix quests
for free Sunday entry, water/powerbank, the VRS public-transport inclusion,
bag policy.

## Probably out of scope

Live crowd/queue reporting, push notifications, and friend location sharing
all need a backend or server push, which would give up the "fully static, no
build step" simplicity that makes this deployable anywhere.

## Suggested order

Best effort-to-value ratio first: the shareable saved list (#2) and
hall-grouped day view (#3) are small and immediately useful; the itinerary
builder (#1) is the biggest feature-level upgrade.
