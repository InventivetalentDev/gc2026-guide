/* gamescom 2026 guide — English UI strings.

   The source language: this is where a new string is written first, and
   every other locale is checked against it (tools/check-i18n.mjs). Keys
   are flat and dot-namespaced by the surface they appear on.

   Two conventions:
     {name}  interpolation, filled by t(key, { name })
     one|other  plural forms, chosen by t(key, { n }) on n === 1

   Editorial prose (booth descriptions, visit advice, event info) is NOT
   here — that lives in data/i18n/<lang>.json, keyed by exhibitor id.
   This file is the app's own chrome. */

window.GC_STRINGS = window.GC_STRINGS || {};

window.GC_STRINGS.en = {
  /* ---------- document & navigation ---------- */
  /* The tab label, the bookmark, and the blue line of a search result — one
     string doing three jobs, which is why it names what the guide is for
     rather than only what it is called. map.html has had its own since it
     was written; this is index.html's. */
  "doc.title": "gamescom 2026 Guide — exhibitors, games & hall plan",
  "meta.description":
    "Unofficial guide to gamescom 2026 — exhibitors, games, hall & booth locations, crowd forecasts and visit planning.",
  "nav.skip": "Skip to content",
  "nav.sections": "Sections",
  "brand.kicker": "Unofficial visitor guide",
  "header.eventFallback": "Koelnmesse, Cologne · Aug 26–30, 2026",
  "header.offline": "Offline · showing saved data",
  "power.title": "Power saver",
  "power.lede":
    "Stops the live queue polling and the map's background work. Everything already saved still works.",
  "power.enable": "Turn on power saver",
  "power.disable": "Turn off",
  "power.on": "Power saver on · live queues paused",
  "power.refresh": "Refresh now",
  "power.refreshAria": "Fetch live queue times once",
  "power.refreshSuccess": "Live queue figures refreshed.",
  "power.refreshFailed": "Couldn't refresh live queue figures.",
  "power.paused": "paused",
  "tab.exhibitors": "Exhibitors",
  "tab.planner": "Visit planner",
  "tab.event": "Event info",
  "tab.updates": "Updates",
  "tab.today": "Today",
  "tab.queues": "Live queues",

  /* ---------- toolbar & filters ---------- */
  "field.search": "Search",
  "field.sort": "Sort by",
  "search.placeholder": "Exhibitor, game or tag…",
  "sort.crowdDesc": "Crowd — busiest first",
  "sort.crowdAsc": "Crowd — calmest first",
  "sort.name": "Name A–Z",
  "sort.hall": "Hall number",
  "toolbar.filters": "Filters",
  "toolbar.category": "Category",
  "toolbar.age": "Age",
  "toolbar.onlyShow": "Only show",
  "toggle.playable": "Playable demos",
  "toggle.onl": "Featured at ONL",
  "toggle.confirmed": "Confirmed locations",
  "toggle.saved": "Saved",
  "toggle.savedOnly": "Saved only",
  "toggle.hidePlayed": "Hide played",
  "filter.all": "All",
  "action.shareList": "Share list",
  "action.clearSaved": "Clear saved list",
  "action.clearPlayed": "Clear played",
  "action.yourPlan": "Your plan →",
  "action.clearFilters": "Clear filters",
  "action.exportIcs": "Export to calendar (.ics)",
  "action.resetOrder": "Reset order",
  "action.undo": "Undo",
  "action.dismiss": "Dismiss",

  /* Filter summary — the one line that says what is still filtered when
     the drawer is shut, so every constraint gets a short name. */
  "summary.none": "All categories, all halls",
  "summary.hideAdult": "hide 18+",
  "summary.onlyAdult": "18+ only",
  "summary.playableOnly": "playable only",
  "summary.onlOnly": "ONL only",
  "summary.confirmedOnly": "confirmed only",
  "summary.savedOnly": "saved only",
  "summary.playedHidden": "played hidden",

  "count.exhibitors": "{n} exhibitor|{n} exhibitors",
  "count.exhibitorsFiltered": "{n} / {total} exhibitors",
  "empty.noMatches": "Nothing matches — try clearing filters.",
  "empty.noSavedYet":
    "Nothing saved yet — hit + on a booth or on any game in its lineup to start a list.",

  /* ---------- vocabularies ---------- */
  "type.platform": "Platforms",
  "type.publisher": "Publishers",
  "type.hardware": "Hardware",
  "type.indie": "Indie",
  "type.experience": "Experiences & Activities",
  "type.media": "Media & Community",
  "type.merch": "Merch & Lifestyle",
  /* Business-area booths. One type rather than a second classification
     axis: the chip row is derived from `type`, so this earns its filter for
     free, and `type === "trade"` is the single predicate that keeps these
     out of the queue and wristband lists. */
  "type.trade": "Trade & Business",

  "crowd.0": "Unknown",
  "crowd.1": "Calm",
  "crowd.2": "Light",
  "crowd.3": "Moderate",
  "crowd.4": "Busy",
  "crowd.5": "Extreme",

  "status.confirmed": "Confirmed",
  "status.expected": "expected",
  "status.rumored": "rumored",
  "badge.playable": "playable",
  "badge.onl": "ONL",

  "age.filter.all": "All",
  "age.filter.hide": "Hide 18+",
  "age.filter.only": "18+ only",
  "age.confirmedTitle": "18+ wristband required",
  "age.expectedTitle": "18+ expected — not confirmed",
  "age.expectedBadge": "18+ expected",

  "hall.word": "Hall",
  "where.hall": "Hall {hall}",
  /* A run of them — "Halls 5–10", the way the areas list files a whole area. */
  "where.halls": "Halls {hall}",
  "where.hallBooth": "Hall {hall}, booth {booth}",
  "where.hallDotBooth": "Hall {hall} · {booth}",
  "kind.booth": "Booth",
  "kind.game": "Game",
  "kind.trade": "Trade",

  /* ---------- exhibitor cards ---------- */
  "plate.statusKicker": "Status",
  "plate.absent": "Absent",
  "plate.noBooth": "no booth",
  "plate.tba": "TBA",
  "plate.notAnnounced": "not announced",
  "plate.boothTba": "booth TBA",
  "plate.unconfSuffix": " · unconf.",
  "plate.confirmedTitle": "Officially confirmed location",
  "plate.unconfirmedTitle": "Best guess — not officially confirmed",

  "card.lineup": "Lineup",
  "card.titles": "{n} title|{n} titles",
  "card.playableCount": "{n} playable",
  "card.showFewer": "− Show fewer",
  "card.showMore": "+ {n} more",
  "card.queueIndex": "Queue index",
  "card.queueAria": "Queue index {n} of 5",
  "card.planLabel": "Plan",
  "card.officialPage": "Official exhibitor page",
  "card.officialPageAria": " for {name}, opens in a new tab",

  /* ---------- live queue reports ---------- */
  "queue.nameGame": "{game} at {exhibitor}",
  "queue.live.flow": "Live: ~{n} min",
  "queue.live.done": "~{n} min for people just in",
  "queue.live.sofar": "{n}+ min so far",
  /* At the estimator's ceiling the number is a floor, not a point estimate, so
     this says "4 h+" the way the top report bucket says "2 h+". Only the
     completed tier needs it: "sofar" already renders "{n}+", and a flow
     projection past the ceiling is discarded rather than clamped. */
  "queue.live.doneCapped": "{n} h+ for people just in",
  "queue.live.closed": "Queue closed",
  /* Nothing reported today: the server pools yesterday's measured waits for
     this queue instead of showing nothing. Worded as yesterday's figure, and
     the detail line says "from yesterday" where the age would stand. */
  "queue.live.typical": "Yesterday: ~{n} min",
  "queue.live.typicalCapped": "Yesterday: {n} h+",
  "queue.typicalAge": "from yesterday",
  "queue.liveUnavailable": "Live queue unavailable",
  "queue.reports": "{n} report|{n} reports",
  "queue.ageNow": "just now",
  "queue.ageMinutes": "1 min ago|{n} min ago",
  "queue.elapsed": "Waiting · {n} min",
  "queue.atExhibitor": "at {exhibitor}",
  "queue.mechanics.single": "moves one by one",
  "queue.mechanics.pairs": "moves in pairs",
  "queue.mechanics.group": "moves in groups",
  "queue.mechanics.wave": "moves in waves",
  "queue.mechanics.groupBatch": "moves in groups of ~{n}",
  "queue.mechanics.waveBatch": "moves in waves of ~{n}",
  "queue.action.join": "I'm in this queue",
  "queue.action.joinAria": "Start a queue report for {queue}",
  "queue.action.update": "Still waiting",
  "queue.action.updateAria": "Report that you are still waiting for {queue}",
  "queue.action.entered": "I'm in!",
  "queue.action.enteredAria": "Report that you got into {queue}",
  "queue.action.left": "I left",
  "queue.action.leftAria": "Report that you left the queue for {queue}",
  "queue.action.closed": "Queue closed",
  "queue.action.closedAria": "Report that the queue for {queue} is closed",
  "queue.dialogOverline": "Live queue",
  "queue.dialogTitle": "Queue report",
  "queue.closeAria": "Close queue report",
  "queue.done": "Done",
  /* Shown when a join would end a line this device is already standing in.
     The Worker closes it either way, so the wording states a consequence
     rather than offering a choice about whether it happens. */
  "queue.switchQuestion": "You're already in a queue",
  "queue.switchHeld": "{queue} — waiting {n} min. You can only track one line at a time.",
  "queue.switchConfirm": "Leave it and start here",
  "queue.switchCancel": "Keep waiting there",
  "queue.claimQuestion": "How long have you already been waiting?",
  "queue.claimAria": "Time already spent in this queue",
  "queue.claim.0": "Just joined",
  "queue.claim.10": "Waiting ~10",
  "queue.claim.20": "~20",
  "queue.claim.30": "~30",
  "queue.claim.45": "~45",
  "queue.claim.60": "~1 h",
  "queue.claim.90": "~1½ h",
  "queue.claim.120": "2 h+",
  "queue.aheadQuestion": "Roughly how many people are ahead of you?",
  /* The second answer and after: the line has moved, which is why you are
     back. The chip you last reported is marked, so this reads as a
     correction rather than the same question asked twice. */
  "queue.aheadQuestionAgain": "How many are ahead of you now?",
  "queue.aheadAria": "People ahead in this queue",
  "queue.ahead.value": "~{n}",
  "queue.ahead.200": "200+",
  "queue.aheadSkip": "Not sure / skip",
  "queue.detailsQuestion": "How does this queue move?",
  "queue.detailsHelp": "Optional — tap what you can tell by now, then Done.",
  "queue.typeAria": "How this queue moves",
  "queue.type.single": "One by one",
  "queue.type.pairs": "Pairs",
  "queue.type.group": "Groups",
  "queue.type.wave": "Waves",
  "queue.batchQuestion": "About how many move at once?",
  "queue.batchAria": "Approximate group or wave size",
  "queue.detailsSaved": "Queue details saved. Thank you.",
  "queue.sending": "Sending…",
  "queue.joinedSuccess": "Timer started. Everything from here is optional.",
  "queue.updatedSuccess": "Queue update sent. Thank you.",
  "queue.enteredSuccess": "Wait completed — thank you for reporting it.",
  "queue.leftSuccess": "Queue session closed.",
  "queue.closedSuccess": "Queue closure reported. Thank you.",
  "queue.enteredDeferred":
    "You're marked as in. The measured wait will be sent when the connection returns.",
  "queue.pendingCompletion": "Completed wait waiting to sync",
  /* ---------- the Live queues view ---------- */
  "queue.reportLink": "Report a queue →",
  "queue.reportLinkActive": "You're in 1 line here →|You're in {n} lines here →",
  "queue.reportLinkAria": "Report a queue at {exhibitor}",
  "queue.noReports": "No reports yet",
  "queues.title": "Live queues",
  "queues.lede":
    "Report the line you are standing in, and read what everyone else is reporting. Nothing here needs an account — reports carry a random ID for this device and nothing else.",
  "queues.mine": "Queues you are in",
  "queues.mineSub":
    "Your timer runs on this device. Tell the queue you got in and the wait becomes a measurement everyone can see.",
  "queues.report": "Report a queue",
  "queues.searchLabel": "Find the queue",
  "queues.searchPlaceholder": "Game or booth…",
  "queues.scopedTo": "Showing queues at {exhibitor}",
  "queues.scopedToHall": "Showing the queues in hall {hall}",
  "queues.nearShow": "Show {n} queue near you|Show {n} queues near you",
  "queues.showAll": "Search all queues",
  "queues.countMatches": "{n} queue|{n} queues",
  "queues.countSaved": "{n} queue from your saved list|{n} queues from your saved list",
  "queues.emptyDefault":
    "Search for the game you are queueing for. Save booths on the Exhibitors tab and their queues show up here first.",
  "queues.emptySearch": "Nothing matches “{query}”.",
  "queues.emptyScoped": "Nothing at this booth matches “{query}”. Search all queues to look wider.",
  "queues.emptyScopedHall": "Nothing in hall {hall} matches “{query}”. Search all queues to look wider.",
  "queues.previewWhen": "Live queues open on {day}, {date} — the first day of gamescom.",
  "queues.previewOver": "gamescom 2026 is over, and live queues closed with it.",
  "queues.previewHow":
    "While the show runs, anyone waiting can start a timer here and say roughly how many people are ahead of them. Those reports become the wait shown on the booth cards and in your plan.",
  "queues.previewCost":
    "Reporting is optional and needs no account. The rest of the guide works the same whether you use it or not.",
  "queues.noticeClosed": "The show is closed right now, so reports are paused. Live figures return when it opens.",
  "queues.noticeOffline": "No connection — live figures are unavailable. A wait you finish now is kept and sent when you are back online.",
  "queue.leftOffline":
    "Queue session closed on this device. The outcome was not sent while offline.",
  "queue.offlineNotSent": "No connection — this report was not sent.",
  "queue.error": "Couldn't send the queue report: {error}",
  "queue.errorUnknown": "unknown error",
  "queue.errorRate": "That was too soon. Wait a moment before reporting again.",
  "queue.errorTooSoon": "Please wait before sending another update.",
  "queue.errorMetaReported": "Queue details from this device were already recorded today.",
  "queue.errorExpired": "This queue timer expired. Start a new one if you're still waiting.",
  "queue.errorCompletionExpired": "This completed wait could not be synced and was removed.",
  "queue.errorPaused": "Queue reporting is temporarily paused.",
  "queue.errorHours": "Queue reporting is closed outside show hours.",
  "queue.errorDenied": "Queue reports from this device are disabled.",
  "queue.errorUnavailable": "This queue is no longer available for reporting.",
  "queue.errorCompletionPending": "The previous completed wait is still waiting to sync.",
  "queue.promptTitle": "Still queueing?",
  "queue.prompt": "Still queueing for {queue}? {n} min",

  /* Whole sentences rather than assembled fragments: German declines
     around the name, so "the {name} booth" cannot be a reusable piece. */
  "mark.save": "Save",
  "mark.saved": "Saved",
  "mark.played": "Played",
  "mark.aria.booth.save": "Save the {name} booth to your list",
  "mark.aria.booth.unsave": "Remove the {name} booth from your saved list",
  "mark.aria.booth.play": "Mark the {name} booth as played",
  "mark.aria.booth.unplay": "Mark the {name} booth as not played",
  "mark.aria.game.save": "Save {name} to your list",
  "mark.aria.game.unsave": "Remove {name} from your saved list",
  "mark.aria.game.play": "Mark {name} as played",
  "mark.aria.game.unplay": "Mark {name} as not played",

  /* ---------- the map, linked from every hall number ---------- */
  "map.cue": "Map →",
  "map.openTitle": "Open on the hall map",
  "map.openTitleWith": "{what} — open the hall map",
  "map.openAria": "{where} — open the hall map",
  /* The areas list, where the plate names a span of halls and the map opens
     one of them: both are spoken, so the link is still findable by the number
     printed on it. */
  "map.openAreaAria": "{halls} — open {where} on the hall map",

  /* ---------- full official directory ---------- */
  "directory.title": "Full directory",
  "directory.summaryLede": "Every booth registered with gamescom, not just the curated ones",
  "directory.booths": "{n} booth|{n} booths",
  "directory.boothsFiltered": "{n} / {total} booths",
  "directory.loading": "Loading the official list…",
  "directory.loadFailed": "failed to load",
  "directory.error":
    "Couldn't load the directory ({error}). It needs one online load before it works offline.",
  "directory.lede":
    "The raw official list as published on {date} — booths with a card above included, and no lineups, crowd ratings or saving down here.",
  "directory.tradeOnly":
    "{n} of these is only in the business area (halls 2–4), which a consumer ticket does not open.|{n} of these are only in the business area (halls 2–4), which a consumer ticket does not open.",
  "directory.noMatches": "Nothing here matches the current search or hall.",
  "directory.showMore": "Show {n} more",
  "directory.noBooth": "no booth listed",
  "directory.hostedAt": " at {name}",
  "directory.filedAs": "registered as {name}",
  "directory.entryAria": ", official directory entry, opens in a new tab",
  "directory.businessArea": "Business area — trade & media only",
  "directory.fallbackHint":
    "No card matches — but one booth in the full directory below does.|No card matches — but {n} booths in the full directory below do.",

  "preview.tag": "Preview",
  "preview.when": "the guide is running as if it were {day}, {date}, {time} in Cologne",
  "preview.exit": "back to the real date",

  /* ---------- Today ----------
     The show-day mode: the walking route scoped to the day it is, with the
     played stops folded away. Live only on the five show days. */
  "today.spanHm": "{h}h {m}m",
  "today.spanH": "{h}h",
  "today.spanM": "{m}m",
  "today.beforeOpen": "Doors at {at} · {span} to go",
  "today.openNow": "Open now · closes {at} · {span} left",
  "today.closedNext": "Closed for today · {day} opens {at}",
  "today.closedLast": "That was gamescom 2026 — see you next year.",
  "today.left": "{n} stop left today|{n} stops left today",
  "today.leftNone": "Nothing left today",
  "today.doneSuffix": " · {n} done",
  "today.meterAria": "{done} of {total} of today's stops done",
  "today.firstLabel": "Go here first",
  "today.hereLabel": "In your hall",
  "today.nearestLabel": "Nearest",
  "today.longestLabel": "Longest queue left",
  "today.hereIn": "You're in hall {hall}",
  "today.hereChange": "change",
  "today.hereQuestion": "Where are you?",
  "today.hereElsewhere": "Elsewhere",
  "today.hereAria": "Tell the guide which hall you are in",
  "today.hereSetAria": "I'm in hall {hall}",
  "today.joinBy": "Join by {at}",
  "today.tooLate": "Too late to start",
  "today.fitCount":
    "{n} of {total} fits before closing, counting queue time only|{n} of {total} fit before closing, counting queue time only",
  "today.fitUnmeasured": " · {n} without a measured wait",
  "today.doneFold": "Done · {n}",
  "today.allDone": "Everything you planned for {day} is done — nice work.",
  "today.nothingToday": "Nothing planned for {day} yet.",
  "today.emptyNoSaved":
    "Nothing saved yet — hit + on a booth or game on the Exhibitors tab, then give it a day.",
  "today.unplaced":
    "{n} saved item still has no day, so it will not appear here.|{n} saved items still have no day, so they will not appear here.",
  "today.openPlan": "Open your plan →",

  /* ---------- planner ---------- */
  "planner.title": "When to visit what",
  "planner.lede":
    "Rough strategy based on expected crowd levels. High-demand booths (queue index 4–5) mean long waits — hit those first thing in the morning or accept the queue. Calm booths are good afternoon fillers.",
  "planner.fiveDays": "The five days",
  "planner.yourPlan": "Your plan",
  "planner.queuePriority": "Queue priority",
  "planner.queueSub":
    "Busiest booths first. If any of these matter to you, make one your first stop of the day.",
  "planner.wristband": "18+ wristband",
  "planner.wristbandSub":
    "Booths with 18+ demos check ID and hand out a red wristband — get it on arrival, not at the front of the queue.",
  "planner.crowdTips": "General crowd tips",
  "planner.jumpAria": "Jump to a planner section",
  "planner.dayPlanned": "{n} stop in your plan|{n} stops in your plan",
  "planner.dayPlannedAria": "Show {day}'s stops in your plan",

  "plan.sub.day":
    "Give each saved booth and game a day, then put the day in the order you'll walk it — the arrows move a stop up or down. Unassigned items sit at the top until you place them.",
  "plan.sub.hall":
    "Your stops grouped by hall, in hall-number order — work down the list to avoid criss-crossing the halls. The arrows set the order inside a hall, which is the order the map numbers its pins in, and the day chips give a stop its day without leaving that order.",
  "plan.arrangeAria": "Arrange your plan",
  "plan.lensDay": "By day",
  "plan.lensHall": "By hall",
  "plan.dayFilterAria": "Show one day's stops",
  "plan.unassigned": "Unassigned",
  "plan.dayMapAria": "Show {day} on the hall map",
  "plan.savedHere": "Saved here",
  "plan.absentStop": "Absent — no booth",
  "plan.offsite": "Offsite",
  "plan.hallTba": "Hall TBA",
  "plan.boothTba": "Booth TBA",
  "plan.queueWith": "Queue {n}/5 {label}",
  "plan.queueUnknown": "Queue unknown",
  "plan.moveAria": "Move {name} in the plan — {n} of {total}",
  "plan.move.up": "Move {name} up",
  "plan.move.down": "Move {name} down",
  "plan.resetOrderTitle": "Sort the plan by queue index again, busiest first",
  "plan.assignAria": "Assign {name} to a day",
  "plan.assignStopAria":
    "Assign {name} to a day — the booth and everything you saved there move together",
  "plan.assignToDay": "Assign to {day}",
  "plan.removeFromDay": "Remove from {day}",
  "plan.dayTradeSuffix": "{action} (trade & media only)",
  "plan.itemCount": "{n} item|{n} items",
  "plan.placedSuffix": " · {n} placed",
  "plan.emptyNoSaved": "Nothing saved yet — hit + on a booth or game on the Exhibitors tab.",
  "plan.browseCta": "Browse exhibitors →",
  "plan.emptyStale":
    "Nothing you saved is in the current lineup anymore — exhibitors come and go between data updates.",

  /* ---------- planner, hall lens ---------- */
  "route.locationKicker": "Location",
  "route.locationTba": "Location TBA",
  "route.locationTbaShort": "location TBA",
  "route.stops": "{n} stop|{n} stops",
  "route.halls": "{n} hall|{n} halls",
  "route.queueShort": "Q{n}",
  "route.stepsNear": "Next hall along",
  "route.stepsAcross": "Across the site",
  "route.stepsFar": "Far side of the site",
  "route.hereTag": "you're here",
  "route.allDays": "All days",
  "route.allDaysTitle": "Every stop on your list",
  "route.onlyDay": "Only stops planned for {day}",
  "route.onlyUnassigned": "Only stops without a day yet",
  "route.absentNote": "On your list but not on the show floor: {names}.",
  "route.emptyNoSaved":
    "Nothing saved yet — hit + on a booth or game over on the Exhibitors tab, and your stops will line up here hall by hall.",
  "route.emptyAllPlayed": "Every stop here is played — nice work.",
  "route.emptyAllAssigned": "Every stop on your list has a day — flip to By day to review the plan.",
  "route.emptyForDay":
    "Nothing planned for {day} yet — show all days and tap {day} on the stops you want here.",
  "route.emptyStale": "No current stops match your saved list — the exhibitor data may have changed.",

  /* ---------- queue priority ---------- */
  "priority.count": "{n} high-queue booth|{n} high-queue booths",
  "priority.countFiltered": "{n} / {total} high-queue booths",
  "priority.playedSuffix": " · {n} played",
  "priority.emptyAllPlayed": "Everything on your list in the high-queue group is played — nice work.",
  "priority.emptyNoneHigh":
    "Nothing you saved is in the high-queue group — good news, those booths should be closer to a walk-up.",
  "priority.emptyNoSaved": "Nothing saved yet — hit + on a booth or game over on the Exhibitors tab.",
  "wristband.wholeBooth": "Booth-wide age-restricted zone",

  /* ---------- event info ---------- */
  "event.theShow": "The show",
  "event.tickets": "Tickets",
  "event.ticketsFallback": "See gamescom.global for tickets.",
  /* Escaped at the render site, so plain "&" here — not an entity. */
  "event.areas": "Halls & areas",
  /* On the section heading, where the visible label is only "Map →". The
     plates in the list say which hall they open; this one opens all of
     them, so it says so. */
  "event.areasMapAria": "Open the whole site on the hall map",
  "event.entrances": "Entrances",
  /* Lead-in to the trade paragraph; the sentence after it comes from the data. */
  "event.entrancesTradeLabel": "On a trade badge.",
  "event.officialLinks": "Official links",
  "event.compiledNote": "Compiled from published sources, not from gamescom itself.",
  "links.officialSite": "Official site",
  "links.exhibitorDirectory": "Exhibitor directory",
  "links.officialList": "Official list",
  "links.hallPlan": "Hall plan",
  "links.officialMap": "Official map",

  /* ---------- updates ---------- */
  "updates.title": "Data updates",
  "updates.lede":
    "This guide is refreshed every few days until the show as exhibitors announce lineups and booth locations. What changed in each revision:",
  "updates.rev": "rev {n}",
  /* Shown to German readers only — see data-i18n-only in index.html. */
  "updates.englishOnly": "",
  /* The kind labels are chrome, not changelog prose, so they translate like
     "rev {n}" does even though the bullets they mark stay English. Kept to one
     word each: they are set in letterspaced uppercase mono and repeat down the
     whole page. */
  "updates.filterLabel": "Show",
  "updates.kind.feature": "Feature",
  "updates.kind.fix": "Fix",
  "updates.kind.content": "Content",
  "updates.noneOfKind": "No changes of that kind are recorded yet.",

  /* Every exhibitor and game a bullet names is a link to its card (see
     changeMarkup). The name is already in the sentence, so the label says
     where the link goes rather than repeating it — and for a game it names
     the booth, because that is the card that opens. */
  "updates.refExhibitor": "Open the {exhibitor} card",
  "updates.refGame": "Open {exhibitor}, showing {game}",

  /* ---------- countdown & freshness ---------- */
  "countdown.days": "T−{n} day|T−{n} days",
  "countdown.live": "● Live now",
  "countdown.over": "See you next year",
  "meta.freshness": "Data updated {date} · rev {rev}.",

  /* ---------- sharing ---------- */
  "share.overline": "Your plan",
  "share.title": "Share saved list",
  "share.closeAria": "Close share dialog",
  "share.withLegend": "Sharing with",
  "share.modeFriend": "Someone else",
  "share.modeDevice": "Another of my devices",
  "share.includeLegend": "What to include",
  "share.partSaved": "Saved list",
  "share.partDays": "Day plan",
  "share.partPlayed": "Played marks",
  "share.linkLabel": "Share link",
  "share.copyAction": "Copy link",
  "share.nativeAction": "Share…",
  "share.nativeTitle": "gamescom 2026 saved list",
  "share.qrHint": "Scan to open this list on another device.",
  "share.qrAlt": "QR code",
  "share.qrTooLong": "This list is too long for a QR code — send the link instead.",
  "share.qrFailed": "The QR code could not be loaded — send the link instead.",
  "share.copied": "Link copied.",
  "share.copyManually": "Press ⌘C / Ctrl+C to copy.",
  "share.failed": "Sharing failed — copy the link instead.",

  /* Sharing the guide itself, not a saved list. */
  "shareSite.action": "Share",
  "shareSite.actionAria": "Share this guide",
  "shareSite.overline": "Pass it on",
  "shareSite.title": "Share this guide",
  "shareSite.closeAria": "Close share dialog",
  "shareSite.lede": "Free, unofficial, and it keeps working offline once opened — worth passing to anyone heading to the show.",
  "shareSite.qrHint": "Hold this up to someone's camera to open the guide on their phone.",
  "shareSite.linkLabel": "Link",
  "shareSite.nativeTitle": "gamescom 2026 visitor guide",

  /* Sharing one booth — the third row of a card's action corner. The link is
     #exhibitors?ex=<id>, the same address the hall map sends people to, so
     what arrives is the guide scrolled to that card rather than the top of a
     list of a hundred and eleven of them. */
  "shareBooth.action": "Share",
  "shareBooth.aria": "Share the {name} booth",
  "shareBooth.overline": "Send someone here",
  "shareBooth.title": "Share this booth",
  "shareBooth.closeAria": "Close share dialog",
  "shareBooth.qrHint": "Or hold this up to someone's camera to open this booth on their phone.",
  "shareBooth.nativeTitle": "{name} at gamescom 2026",

  "share.items": "{n} saved item|{n} saved items",
  "share.readyWithStale": "{items} ready to share.",
  "share.staleOlder": " {n} older item is no longer in the guide.| {n} older items are no longer in the guide.",
  "share.stale": " {n} isn't in the guide any more.| {n} aren't in the guide any more.",
  "share.carried.days": "a day plan",
  "share.carried.played": "played marks",
  "share.carried.join": " and ",
  "share.carried.note": " It carries {what} too.",
  "share.outOfDate": "That shared list is out of date — nothing left to add.",
  "share.loadedMoved": "Loaded {items} you moved over.",
  "share.loadedShared": "Loaded {items} from a shared link.",
  "share.newToYou": " — {n} new to you",
  "share.replaceCost":
    " Replacing removes {n} item you only have here.| Replacing removes {n} items you only have here.",
  "share.movedPlan": "Your moved plan has {items}{news}.",
  "share.replaceAction": "Replace my list",
  "share.replaced": "Your list now matches the moved plan.",
  "share.alreadyHave": "You already have everything in this shared link.",
  "share.linkHas": "A shared link has {items} — {n} new to you.",
  "share.addAction": "Add to my list",
  "share.added": "Added {items} from the shared link.",
  "toast.orderReset": "Plan back in queue order.",
  "toast.dayMoved": "{name} is all on {day} now.",
  "toast.moveUndone": "Move undone.",
  "toast.importUndone": "Shared list import undone.",
  "moved.withList": "The guide has moved to hallgui.de. Your list comes with you.",
  "moved.plain": "The guide has moved to hallgui.de.",
  "moved.open": "Open",

  /* ---------- sources & attribution ---------- */
  "sources.overline": "Where this comes from",
  "sources.title": "Sources",
  "sources.closeAria": "Close sources",
  "sources.thisGuide": "this guide",
  "sources.aria": "Sources for {name} — {n} link|Sources for {name} — {n} links",
  "sources.note.event":
    "The dates, hours, tickets and hall areas on this page come from {n} source.|The dates, hours, tickets and hall areas on this page come from {n} sources.",
  "sources.note.card":
    "The location, lineup and queue call on this card come from {n} source.|The location, lineup and queue call on this card come from {n} sources.",
  "sources.lastUpdated": " Last updated {date}.",
  "sources.lastChecked": " Sources re-checked {date}.",
  "sources.caveat":
    "This is an unofficial guide, and booth numbers and lineups keep changing until the doors open. If a detail decides your day, check it at the source.",

  /* ---------- calendar export ---------- */
  "ics.filename": "gamescom-2026-itinerary.ics",
  "ics.locationFallback": "Koelnmesse, Cologne",
  "ics.summary": "gamescom — {day} plan ({n} stop)|gamescom — {day} plan ({n} stops)",
  "ics.exhibitor": "{name} — {where} (queue {queue})",
  "ics.hallBooth": "Hall {hall}, booth {booth}",
  "ics.queueUnknown": "unknown",
  "ics.gameAt": "{name} — at {booths}",
  "ics.gameNoBooth": "{name} — booth not listed",

  /* ---------- confirmations & boot ---------- */
  "confirm.clearSaved":
    "Forget all {n} saved item, its day assignment and its place in the plan? This can't be undone.|Forget all {n} saved items, their day assignments and the order you put them in? This can't be undone.",
  "confirm.clearPlayed":
    "Forget all {n} played mark? This can't be undone.|Forget all {n} played marks? This can't be undone.",
  "boot.loadFailed":
    "Failed to load data ({error}). If you opened this file directly, serve it instead:",

  /* ---------- footer ---------- */
  "footer.unofficial": "Unofficial fan-made guide.",
  "footer.notAffiliated":
    "Not affiliated with gamescom, Koelnmesse or game (the German games industry association).",
  "footer.storage":
    "Your saved list stays in this browser. Queue reports are optional; only the queue facts and a random device ID are sent to the live service.",
  "footer.createdBy":
    'Created by <a class="subtle-link" href="https://inventivetalent.org">inventivetalent</a> with Claude Code. <a class="subtle-link" href="https://github.com/InventivetalentDev/gc2026-guide">Open Source</a>.',
  "footer.imprint": "Imprint",
  "footer.privacy": "Privacy",
  "footer.statusKey": "Game status key",
  "legend.confirmed":
    '<span class="dot" data-status="confirmed"></span> <b>Confirmed</b> — officially announced for gamescom',
  "legend.expected":
    '<span class="dot" data-status="expected"></span> <b>Expected</b> — strongly implied, not announced',
  "legend.rumored":
    '<span class="dot" data-status="rumored"></span> <b>Rumored</b> — our guess, unverified',
  "legend.age":
    '<span class="badge badge-age" data-age-status="confirmed">18+</span> — demo is age-gated, ID and red wristband needed',

  /* ---------- install & offline (js/pwa.js) ---------- */
  "pwa.install": "Install app",
  "pwa.addToHome": "Add to Home Screen",
  "pwa.iosHint": "In Safari, tap Share, then “Add to Home Screen”.",
  "pwa.installed": "Installed. The guide now works offline.",
  "pwa.updateReady": "A newer version of the guide is ready.",
  "pwa.reload": "Reload",

  /* ---------- hall map page (map.html, js/map.js) ---------- */
  "map.metaDescription":
    "Booth-level hall maps for gamescom 2026, with your saved booths marked. Works offline.",
  "map.docTitle": "Hall map · gamescom 2026 guide",
  "map.title": "Hall map",
  "map.offline": "Offline",
  "map.backAria": "Back to the guide",
  "map.hallsAria": "Halls",
  "map.loading": "loading hall …",
  "map.loadFailed": "could not load the hall plan — {error}",
  "map.closeSheetAria": "Close stand details",
  "map.openInGuide": "open in guide →",
  "map.planAria": "Schematic plan of hall {hall}",
  "map.stand": "Stand",
  "map.standNr": "Stand {nr}",
  "map.standAria": "{name} — stand {nr}",
  "map.sheetLoc": "Hall {hall} · Stand {nr}",
  "map.sheetAlso": " · also {list}",
  "map.unconfBadge": "Location unconfirmed",
  "map.queueForecast": "queue forecast Q{n} {label}",
  "map.gamesCount": "{n} game|{n} games",
  "map.plusMore": ", +{n} more",
  "map.alsoHere": "also here",
  "map.notCovered": "not covered by the guide",
  "map.notCoveredSaveOne": "not covered by the guide — save it as a stop of your own",
  "map.notCoveredSaveAny": "not covered by the guide — save any of these as a stop of your own",
  "map.listedLede": "{n} company filed on this stand|{n} companies filed on this stand",
  "map.listedFilter": "Filter by name",
  "map.listedFilterAria": "Filter the companies on this stand by name",
  "map.listedNoMatch": "nobody on this stand matches that",
  "map.noExhibitor": "no exhibitor filed for this stand",
  /* ---- the sheet's report link ----
     The guide's one corrections channel (footer.feedback), opened from in
     front of the booth it is wrong about. Subject and body are prefilled
     by selectStand (js/map.js) with the stand, what the sheet claims and
     the map link; the body ends on an open question on purpose, leaving
     the cursor where the reporter's half of the story goes. */
  "map.reportLink": "report a missing or wrong exhibitor",
  "map.reportAria": "Report a missing or wrong exhibitor for stand {nr} in hall {hall} by e-mail",
  "map.reportSubject": "gamescom guide: booth report — hall {hall}, stand {nr}",
  "map.reportBody":
    "Stand {nr} in hall {hall}\n{link}\n\nThe guide currently lists: {shown}\n\nWho or what is actually there:\n",
  "map.reportShownNone": "nothing yet",
  "map.saveBooth": "+ Save booth",
  "map.unsaveBooth": "− Remove from saved",
  "map.plannedFor": "planned · {days}",
  "map.zoomIn": "Zoom in",
  "map.zoomOut": "Zoom out",
  "map.zoomFit": "Show the whole hall",
  "map.rotate": "Rotate hall clockwise",
  "map.counts": "{n} stands · {covered} in the guide",
  "map.countsSaved": " · {n} saved",
  "map.countsPlanned": " · {n} planned",
  "map.chipSavedAria": ", {n} saved",
  "map.heat": "Queues",
  "map.heatAria": "Show live queue times on the map",
  "map.heatOffAria": "Hide live queue times",
  "map.here": "I'm here",
  "map.hereOn": "You're here",
  "map.hereAria": "Mark hall {hall} as where you are",
  "map.hereOnAria": "Hall {hall} is marked as where you are — tap to refresh",
  "map.chipHereAria": ", you're here",
  /* ---- the day route overlay (see renderRoute in js/map.js) ----
     The bar names what the numbers mean and stops short of claiming a walk:
     the snapshot files stands, never aisles, so the line joining the pins is
     the plan's order and nothing more. */
  "map.routeAria": "Show one day's stops",
  "map.routeKicker": "Plan",
  "map.routeDayOn": "Show {day}'s stops",
  "map.routeDayOff": "Hide {day}'s stops",
  "map.routeUnplacedOn": "Show the stops without a day yet",
  "map.routeUnplacedOff": "Hide the stops without a day yet",
  "map.routeHint": "pick a day to number its stops",
  "map.routeStops": "{n} stop here|{n} stops here",
  "map.routeOrderNote": "· plan order, not a walking route",
  "map.routeNoneHere": "nothing planned in this hall",
  "map.legPrev": "◂ {hall} · {n} stop|◂ {hall} · {n} stops",
  "map.legNext": "{hall} · {n} stop ▸|{hall} · {n} stops ▸",
  "map.legPrevAria": "Before this hall in the plan: hall {hall}, {n} stop — open it|Before this hall in the plan: hall {hall}, {n} stops — open it",
  "map.legNextAria": "After this hall in the plan: hall {hall}, {n} stop — open it|After this hall in the plan: hall {hall}, {n} stops — open it",
  "map.routeHintCampus": "pick a day to see its halls in order",
  "map.routeHalls": "{n} hall|{n} halls",
  "map.routeStopsAll": "{n} stop|{n} stops",
  "map.routeNoneAnywhere": "nothing planned that day",
  "map.chipPlannedAria": ", {n} stop planned|, {n} stops planned",
  "map.stopBadge": "Stop {n} of {total}",
  "map.stopAria": " — stop {n} of {total}",
  "map.outlines": "booth outlines",
  "map.officialHallPlan": "official hall plan",
  "map.checkedOn": "checked {date} · schematic, unofficial",
  /* Drawn on the hall's outline where it opens onto the concourse, or out
     of the grounds. A door into another hall is labelled with that hall
     instead (where.hall). */
  "map.door.boulevard": "Boulevard",
  "map.door.entrance-east": "Entrance East",
  /* The credit line stops short of claiming the doors: the official plan
     files blocks and stands, never a wall or a doorway, so every opening
     on the map is our own reading of where one is. */
  "map.doorsApprox": "hall doors ours, approximate",

  /* ---------- the campus overview ----------

     The row's first chip: one step back from a hall to the whole site.
     "Overview" rather than "Site" or "All halls" because the chips beside
     it are halls, and this is the view of them.

     map.place.* names a piece of ground between the halls, map.gate.* one
     of the four gates — both keyed by what data/hallplan/campus.json calls
     it. A gate name is set in a strip of margin or over a passage, and
     wraps to two lines to fit either, so it reads as "Entrance / North";
     keep them two words for that reason. */
  "map.overview": "Overview",
  "map.overviewAria": "Overview of the whole site",
  "map.campusAria": "Diagram of the gamescom halls, the Boulevard between them and the entrances",
  "map.campusCounts": "{n} halls · tap one to open it",
  "map.campusLayout": "campus layout",
  /* The halls on this diagram are fitted to their slots on Koelnmesse's
     own artwork rather than drawn to scale, so it is right about where a
     hall is and wrong about how big it is. Said out loud, next to the
     credit, because the map's other view is true metres — and after
     map.checkedOn, which already calls the drawing schematic. */
  "map.campusNotToScale": "not to scale",
  "map.place.boulevard": "Boulevard",
  "map.place.piazza": "Piazza",
  "map.place.confex": "Confex",
  "map.place.congress-north": "Congress North",
  "map.place.congress-east": "Congress East",
  "map.gate.entrance-north": "Entrance North",
  "map.gate.entrance-east": "Entrance East",
  "map.gate.entrance-south": "Entrance South",
  "map.gate.entrance-west": "Entrance West",

  /* ---------- the trade badge & the business halls ----------

     Off by default and gating what the guide *offers*, never what it
     resolves: a saved business booth still opens, still plans, still shows
     on the map. The copy has to keep saying that this is a display setting
     and not a claim about what anyone's ticket opens. */
  "toolbar.badge": "Badge",
  "toolbar.badgeAria": "Which badge you hold",
  "badge.consumer": "Consumer",
  "badge.consumerTitle": "Consumer ticket — the entertainment halls",
  "badge.trade": "Trade & media",
  "badge.tradeTitle": "Trade or media badge — adds the business halls, 2 to 4",
  "summary.tradePrefix": "Trade badge · {filters}",
  "summary.noneLower": "all categories, all halls",

  "trade.sectionTitle": "Trade exhibitors",
  /* Set as textContent, so a plain "&" — not the entity the markup carries. */
  "trade.sectionLede":
    "The business halls — publishing, dev services, platforms. Trade & media badge only",
  "trade.gateWhat":
    "Halls 2–4 are gamescom's <strong>business area</strong>: around 800 exhibitors doing the industry's trading — publishers taking pitches, outsourcing and localisation studios, engines and platforms, national pavilions and associations. It runs Wednesday to Friday and is closed at the weekend.",
  "trade.gateBadge":
    "A <strong>trade or media badge</strong> opens it. A consumer ticket does not, so it stays off by default — turn it on and these booths become saveable, plannable stops like any other, with their own list below and their own cards in the grid above.",
  "trade.enable": "I have a trade badge — show trade exhibitors",
  "trade.hide": "Hide trade exhibitors",
  "trade.turnOff": "Turn trade exhibitors off",
  "trade.showList": "Show the list →",
  "trade.toastOn":
    "Trade exhibitors on — business booths are in the grid, and in their own list below.",
  "trade.toastOff": "Trade exhibitors off — back to the consumer halls.",
  /* A link named a business booth, so the badge switch was thrown to answer
     it. Says what changed rather than asking, because the card is already on
     screen by the time this appears — and the Badge row switches it back. */
  "trade.toastLinked":
    "That's a business-hall booth, so trade exhibitors are on. The Badge row turns them back off.",
  "trade.catFilterAria": "Filter trade exhibitors by product group",
  "trade.loading": "Loading the business halls…",
  "trade.loadError":
    "Couldn't load the trade list ({error}). It needs one online load before it works offline.",
  "trade.dataPending":
    "Your list has booths the guide writes no card about. That data needs one online load before they can be planned — it is cached from then on.",
  "trade.listWhat":
    "The business area (halls 2–4), where the industry does its trading. A trade or media badge opens these halls; a consumer ticket does not, and they close after Friday.",
  "trade.listWalkUp":
    "Almost all of it is walk-up: a dozen or more companies share each national and regional pavilion, and the small stands in halls 2.1 and 2.2 are counters you can just talk to. Only about twenty booths — the big single-occupant compounds in Hall 4.2 — are closed rooms you need an appointment for. The “shared” count marks the collectives; the cards above say what a booth is actually for.",
  "trade.listPlannable": "Save a booth and it plans like any other stop.",
  "trade.listNoMatches": "Nothing here matches the current search, hall or category.",
  "trade.exhibitorCount": "{n} exhibitor|{n} exhibitors",
  "trade.shared": "shared · {n}",
  "trade.sharedTitle":
    "{n} exhibitors are listed at this booth — a collective, usually a national or regional pavilion",
  "trade.offers": "Offers",
  "trade.offerCount": "{n} thing|{n} things",
  "trade.accessLabel": "Access",
  /* The enum lives in the data as `access`; only the wording is here. */
  "trade.access.open.label": "Walk-up",
  "trade.access.open.note": "An open stand — staffed during business hours, no appointment needed.",
  "trade.access.appointment.label": "By appointment",
  "trade.access.appointment.note":
    "A closed meeting structure. Entry is by scheduled appointment only; there is nothing to see from the aisle.",
  "trade.access.mixed.label": "Walk-up + meetings",
  "trade.access.mixed.note":
    "An open counter with closed meeting rooms behind it — you can walk up to ask, but the rooms are booked in advance.",

  "hall.businessAria": "Hall {hall}, business area, trade & media only",
  "card.faceToTrade": "Show the business booth — hall {hall}, trade & media only",
  "card.faceToPublic": "Back to the public booth — hall {hall}",
  "plan.tradeBadge": "Trade badge",
  /* The business halls shut after Friday — the one fact a plan can get wrong
     in a way that costs a wasted walk across the grounds. */
  "plan.dayClosedSuffix": "{action} — the business area is closed on {day}",
  "plan.closedWarn":
    "Business area closed on {day} — this stop is behind a badge gate that day.",
  "plan.closedGroupWarn":
    "{n} stop is in the business area, which is closed on {day}.|{n} stops are in the business area, which is closed on {day}.",
  "ics.tradeExhibitor": "{name} — {where} (trade & media badge{shut})",
  "ics.businessClosed": "; business area CLOSED this day",

  "event.yourBadge": "Your badge",
  "event.badgeWhat":
    "Halls 2–4 are the <strong>business area</strong>: around 800 exhibitors doing the industry's trading, open Wednesday to Friday and closed at the weekend. A <strong>trade or media badge</strong> opens them; a consumer ticket does not.",
  "event.badgeOnNote":
    "Business booths are showing — in the exhibitor grid, in the hall filter, on the map, and as their own list on the exhibitor page.",
  "event.badgeOffNote":
    "The guide is showing the consumer halls only. This is a display setting; it changes nothing about what your ticket actually gets you.",

  /* ---------- map areas ----------

     Keyed by the area id from data/hallplan/index.json rather than
     translated in that file: it is regenerated by tools/fetch-hallplan.mjs
     and would lose hand edits on the next refresh. The generated English
     stays there as the fallback. */
  "map.area.entertainment.label": "Entertainment",
  "map.area.business.label": "Business",
  "map.area.business.access":
    "trade & media badge only. A consumer ticket does not open these halls, and they close after Friday.",
  "map.areaSuffix": "{label} area",
  "map.coveredNone": "none",
  "map.tradeVisitorsOnly": ", trade visitors only",
  "map.tradeOnlySuffix": ", trade & media only",
  "map.tradeOnlyLabel": "trade only",
  "map.showExhibitors": "I have a badge — show exhibitors",
  "map.showTrade": "show trade exhibitors",
  "map.gatedHint":
    "business area — most of these are in the guide with trade exhibitors on",
  "map.officialProfile": "official profile ↗",

  "footer.feedback":
    'Something wrong, missing or out of date? Send corrections to <a class="subtle-link" href="mailto:content@hallgui.de?subject=gamescom%20guide%20feedback">content@hallgui.de</a>.',

  /* ---------- accessibility ---------- */
  "a11y.newTab": ", opens in a new tab",
};
