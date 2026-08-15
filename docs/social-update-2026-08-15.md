# Social update draft — 2026-08-15

Cutoffs: Twitter last posted **Aug 9, ~20:00** (guide was at rev 3, 38 cards).
Reddit last posted **Aug 12, 09:57** (rev 10, 53 cards).
Current: **rev 25, 127 cards** (75 consumer + 52 trade), **151 games**.

Revs 22–25 all landed on Aug 15 and are new to *both* audiences: business halls on the
map, trade exhibitors, the entrances section, and the German translation.

---

## Twitter — covers rev 4 → 25 (everything since Aug 9 evening)

**Tweet 1**

> gamescom 2026 guide — big week. It now speaks German, covers the business halls,
> and draws every hall booth by booth.
> 38 → 127 booth cards.
> New home at gamescom.guide (old link still works).
> 🧵

**Tweet 2 — the new stuff**

- 🇩🇪 **Deutsch.** Picks your browser language on first visit, switcher in the header. Everything a visitor reads is translated; game and exhibitor names stay as they are, so share links keep working across both.
- 🗺️ **Hall map.** Every hall drawn booth by booth, exhibitor names *on* the booths, your saved ones lit up. Tap for lineup + queue call. Works offline.
- 🔗 Every hall/booth number in the guide taps through to that exact stand

**Tweet 3 — trade**

- 💼 **Trade exhibitors.** Flip "I have a trade badge" and the ~820 business-hall booths become saveable, plannable stops. Off by default — a consumer ticket doesn't open halls 2–4.
- 52 curated business-area cards, B2B names first: Cloudflare, AWS, Unity, Xsolla, Denuvo, Reddit, Fandom, Opera, Poki + the national pavilions
- Each one says walk-up or appointment. Almost all are walk-up; only ~20 of 821 are closed meeting compounds.
- 🟣 Exhibitors on both sides of the show (Capcom, Ubisoft, Xbox, Nintendo, CDPR…) get one card you turn over

**Tweet 4 — planning**

- 📅 **Your plan** — assign stops to a day, or walk them by hall. Hours and crowd advice inline, export to calendar.
- 🚪 **Entrances.** All four gates, what each is closest to, what it costs you in queueing. "West is best" — but the guide now says *when* that's true.
- ⏰ Trade badges open the entertainment halls at 09:00, an hour before the public Thu/Fri
- ⚠️ Business-hall stop on Sat/Sun? The planner warns you — that area shuts after Friday

**Tweet 5 — everything else**

- ✓ Played tracking — tick a game, it dims at every booth showing it
- 🔞 18+ filter + wristband checklist
- 📲 Share as link or QR, now syncing day plan + played marks between your own devices
- ⓘ Sources on every card with the date last checked
- 🏢 Trade-Wednesday reality check: Xbox closed, Capcom press-only mornings

---

## Reddit comment — covers rev 11 → 25 (since Aug 12, 09:57)

> Update since my last comment — quite a lot has landed, including three things today:
>
> - **The guide speaks German now.** It picks your browser's language on the first visit, and there's a switcher in the header. Booth descriptions, queue calls, visit advice — all of it. Game titles and exhibitor names stay in their own language, so any share link you've already handed out still works either way.
> - **Hall map.** Every hall drawn booth by booth, exhibitor names on the booths instead of the blank boxes the official plan gives you, saved booths in orange. Tap a booth for its lineup and queue call. Cached offline, since hall 3 eats reception.
> - **The business halls are on it too** — 2.1, 2.2, 3.2, 4.1, 4.2, another 366 stands. Colour-coded by area in the official plan's own colours: cyan for the halls your ticket opens, purple for trade-only.
> - **Everything links to the map.** Any hall or booth number — card, plan, queue list, full directory — opens on that stand.
> - **Your plan**, one board for everything you saved, with two lenses: **by day** (assign each stop a day, see that day's hours and crowd advice inline, export to calendar) or **by hall** (walking order, offsite and unannounced stops called out separately).
> - **Entrances section** covering all four gates — what each is closest to and what it costs you in queueing. South is where the rail crowd lands, North is shortest to halls 6–9, East opens into Hall 10, West is the quiet one. Trade badges get into the entertainment halls at 09:00, an hour before the public on Thu/Fri.
> - **53 → 75 consumer booth cards**, mostly from a full sweep of Hall 10 — the half of the show that never makes the news. New *Experiences & Activities* category for the sim rigs, the rideable Kawasaki CORLEO robot, the retro corner and the LAN area.
> - **Sources on every entry.** The ⓘ marker opens what the booth number, lineup and queue call were built from, and when it was last checked — so anything still marked "unconf." can be verified before you plan a day around it.
> - **Official gamescom profile links** on 46 of the booth cards, plus booth numbers for SEGA/Atlus, Square Enix, Plaion and Embark, and every stand for exhibitors holding several (Ubisoft's second booth, Nintendo's four).
> - **Sharing got better.** Links are much shorter so the QR code works again, and a link to your own other device now carries your day plan and played marks, not just the list.
> - **If you've got a trade badge**, there's a toggle that opens up the ~820 business-hall exhibitors as saveable stops, with 52 curated cards and walk-up vs appointment marked on each. Off by default.
> - **New domain: gamescom.guide.** The old gc2026.inventivetalent.org link still works and your saved list follows you across.

---

## Notes / open questions

- **Reddit cutoff is 09:57**, so rev 11 (official profile links, merged 10:04) and rev 12 (route by hall, 10:20) are in scope and included. Rev 10 (trade-Wednesday press-only caveats, 09:42) landed ~15 min before the post and is excluded — it's in the Twitter thread instead.
- Route by hall shipped as its own section in rev 12, then rev 15 merged it with the itinerary into one board. Since a Reddit reader saw neither, it's written up as the finished two-lens "Your plan" rather than as two separate arrivals.
- **The rev 22 collision resolved itself** on merge: business halls took 22, trade exhibitors 23, entrances 24, German 25. Nothing to fix.
- **Nothing user-facing is unmerged now.** The three "in the works" items from the earlier draft all shipped today, so both posts are pure changelog with no forward promises. The one commit still sitting on `claude/trade-halls-color-coding-mxt7p2` is the pre-squash version of what merged as #35.
- **Card count is worth phrasing carefully.** 127 total, but 52 are trade cards most readers can't use — hence "38 → 127" on Twitter with the trade section explaining it, and "53 → 75 consumer cards" on Reddit with trade kept separate at the bottom. Don't quote 127 to a consumer audience without that context.
