/* gamescom 2026 guide — German UI strings.

   Register: "du" throughout — gamescom's own German communication uses it,
   the audience is a gaming audience, and it is shorter, which the dense
   cards need.

   Deliberately untranslated: game and exhibitor names, platform names,
   "gamescom", "Opening Night Live", official area names, hall and booth
   numbers, and the scene vocabulary German gamers use in English anyway
   (Indie, Merch, Demo, Hands-on, Community, Lifestyle).

   Key parity with en.js — including plural forms and {placeholders} — is
   enforced by tools/check-i18n.mjs before every deploy. */

window.GC_STRINGS = window.GC_STRINGS || {};

window.GC_STRINGS.de = {
  /* ---------- document & navigation ---------- */
  "doc.title": "gamescom 2026 Guide — Aussteller, Spiele & Hallenplan",
  "meta.description":
    "Inoffizieller Guide zur gamescom 2026 — Aussteller, Spiele, Hallen- und Standnummern, erwarteter Andrang und Besuchsplanung.",
  "nav.skip": "Zum Inhalt springen",
  "nav.sections": "Bereiche",
  "brand.kicker": "Inoffizieller gamescom-Guide",
  "header.eventFallback": "Koelnmesse, Köln · 26.–30. Aug. 2026",
  "header.offline": "Offline · gespeicherte Daten",
  "power.title": "Energiesparmodus",
  "power.lede":
    "Stoppt die Live-Abfragen der Wartezeiten und die Hintergrundarbeit des Hallenplans. Alles bereits Gespeicherte funktioniert weiterhin.",
  "power.enable": "Energiesparmodus einschalten",
  "power.disable": "Ausschalten",
  "power.on": "Energiesparmodus an · Live-Wartezeiten pausiert",
  "power.refresh": "Jetzt aktualisieren",
  "power.refreshAria": "Live-Wartezeiten einmal abrufen",
  "power.refreshSuccess": "Live-Wartezeiten aktualisiert.",
  "power.refreshFailed": "Live-Wartezeiten konnten nicht aktualisiert werden.",
  "power.paused": "pausiert",
  "tab.exhibitors": "Aussteller",
  "tab.planner": "Besuchsplaner",
  "tab.event": "Event-Infos",
  "tab.updates": "Updates",
  "tab.today": "Heute",
  "tab.queues": "Wartezeiten",

  /* ---------- toolbar & filters ---------- */
  "field.search": "Suche",
  "field.sort": "Sortieren",
  "search.placeholder": "Aussteller, Spiel oder Stichwort…",
  "sort.crowdDesc": "Andrang — vollste Stände zuerst",
  "sort.crowdAsc": "Andrang — ruhigste Stände zuerst",
  "sort.name": "Name A–Z",
  "sort.hall": "Hallennummer",
  "toolbar.filters": "Filter",
  "toolbar.category": "Kategorie",
  "toolbar.age": "Alter",
  "toolbar.onlyShow": "Nur zeigen",
  "toggle.playable": "Spielbare Demos",
  "toggle.confirmed": "Bestätigte Standorte",
  "toggle.saved": "Gemerkt",
  "toggle.savedOnly": "Nur gemerkte",
  "toggle.hidePlayed": "Gespielte ausblenden",
  "filter.all": "Alle",
  "action.shareList": "Liste teilen",
  "action.clearSaved": "Merkliste leeren",
  "action.clearPlayed": "„Gespielt“-Markierungen löschen",
  "action.yourPlan": "Dein Plan →",
  "action.clearFilters": "Filter zurücksetzen",
  "action.exportIcs": "In Kalender exportieren (.ics)",
  "action.resetOrder": "Reihenfolge zurücksetzen",
  "action.undo": "Rückgängig",
  "action.dismiss": "Schließen",

  "summary.none": "Alle Kategorien, alle Hallen",
  "summary.hideAdult": "ohne 18+",
  "summary.onlyAdult": "nur 18+",
  "summary.playableOnly": "nur spielbar",
  "summary.confirmedOnly": "nur bestätigt",
  "summary.savedOnly": "nur gemerkte",
  "summary.playedHidden": "gespielte ausgeblendet",

  "count.exhibitors": "{n} Aussteller|{n} Aussteller",
  "count.exhibitorsFiltered": "{n} / {total} Aussteller",
  "empty.noMatches": "Nichts gefunden — versuch es ohne Filter.",
  "empty.noSavedYet":
    "Noch nichts gemerkt — tippe bei einem Stand oder Spiel auf +, um eine Liste zu starten.",

  /* ---------- vocabularies ---------- */
  "type.platform": "Plattformen",
  "type.publisher": "Publisher",
  "type.hardware": "Hardware",
  "type.indie": "Indie",
  "type.experience": "Erlebnisse & Aktionen",
  "type.media": "Medien & Community",
  "type.merch": "Merch & Lifestyle",
  "type.trade": "Business",

  "crowd.0": "Unbekannt",
  "crowd.1": "Ruhig",
  "crowd.2": "Wenig los",
  "crowd.3": "Mittel",
  "crowd.4": "Voll",
  "crowd.5": "Extrem",

  "status.confirmed": "Bestätigt",
  "status.expected": "erwartet",
  "status.rumored": "Vermutet",
  "badge.playable": "spielbar",

  "age.filter.all": "Alle",
  "age.filter.hide": "Ohne 18+",
  "age.filter.only": "Nur 18+",
  "age.confirmedTitle": "Bändchen ab 18 nötig",
  "age.expectedTitle": "18+ erwartet — nicht bestätigt",
  "age.expectedBadge": "18+ erwartet",

  "hall.word": "Halle",
  "where.hall": "Halle {hall}",
  "where.halls": "Hallen {hall}",
  "where.hallBooth": "Halle {hall}, Stand {booth}",
  "where.hallDotBooth": "Halle {hall} · {booth}",
  "kind.booth": "Stand",
  "kind.game": "Spiel",
  "kind.trade": "Business",

  /* ---------- exhibitor cards ---------- */
  "plate.statusKicker": "Status",
  "plate.absent": "Nicht da",
  "plate.noBooth": "kein Stand",
  "plate.tba": "Noch offen",
  "plate.notAnnounced": "nicht angekündigt",
  "plate.boothTba": "Stand noch offen",
  "plate.unconfSuffix": " · unbestätigt",
  "plate.confirmedTitle": "Offiziell bestätigter Standort",
  "plate.unconfirmedTitle": "Vermuteter Standort — nicht offiziell bestätigt",

  "card.lineup": "Spiele",
  "card.titles": "{n} Titel|{n} Titel",
  "card.playableCount": "{n} spielbar",
  "card.showFewer": "− Weniger zeigen",
  "card.showMore": "+ {n} weitere",
  "card.queueIndex": "Erwarteter Andrang",
  "card.queueAria": "Erwarteter Andrang: {n} von 5",
  "card.planLabel": "Plan",
  "card.officialPage": "Offizielle Ausstellerseite",
  "card.officialPageAria": " für {name}, öffnet in einem neuen Tab",

  /* ---------- live queue reports ---------- */
  "queue.nameGame": "{game} bei {exhibitor}",
  "queue.live.flow": "Live: ~{n} Min.",
  "queue.live.done": "~{n} Min. für gerade Eingelassene",
  "queue.live.sofar": "Bisher {n}+ Min.",
  "queue.live.doneCapped": "{n} Std.+ für gerade Eingelassene",
  "queue.live.closed": "Warteschlange geschlossen",
  "queue.liveUnavailable": "Live-Wartezeit nicht verfügbar",
  "queue.reports": "{n} Meldung|{n} Meldungen",
  "queue.ageNow": "gerade eben",
  "queue.ageMinutes": "vor 1 Min.|vor {n} Min.",
  "queue.elapsed": "Wartezeit · {n} Min.",
  "queue.atExhibitor": "bei {exhibitor}",
  "queue.mechanics.single": "geht einzeln weiter",
  "queue.mechanics.pairs": "geht paarweise weiter",
  "queue.mechanics.group": "geht in Gruppen weiter",
  "queue.mechanics.wave": "geht in Wellen weiter",
  "queue.mechanics.groupBatch": "Gruppen mit etwa {n} Personen",
  "queue.mechanics.waveBatch": "Wellen mit etwa {n} Personen",
  "queue.action.join": "Ich stehe hier an",
  "queue.action.joinAria": "Wartemeldung für {queue} starten",
  "queue.action.update": "Warte noch",
  "queue.action.updateAria": "Melden, dass du noch auf {queue} wartest",
  "queue.action.entered": "Bin drin!",
  "queue.action.enteredAria": "Melden, dass du bei {queue} hineingekommen bist",
  "queue.action.left": "Bin gegangen",
  "queue.action.leftAria": "Melden, dass du die Warteschlange für {queue} verlassen hast",
  "queue.action.closed": "Schlange geschlossen",
  "queue.action.closedAria": "Melden, dass die Warteschlange für {queue} geschlossen ist",
  "queue.dialogOverline": "Live-Wartezeit",
  "queue.dialogTitle": "Wartemeldung",
  "queue.closeAria": "Wartemeldung schließen",
  "queue.done": "Fertig",
  "queue.switchQuestion": "Du stehst schon in einer Schlange",
  "queue.switchHeld": "{queue} — seit {n} Min. Du kannst immer nur eine Schlange gleichzeitig verfolgen.",
  "queue.switchConfirm": "Verlassen und hier anstellen",
  "queue.switchCancel": "Dort weiter warten",
  "queue.claimQuestion": "Wie lange wartest du schon?",
  "queue.claimAria": "Bisherige Zeit in dieser Warteschlange",
  "queue.claim.0": "Gerade angestellt",
  "queue.claim.10": "Warte ~10",
  "queue.claim.20": "~20",
  "queue.claim.30": "~30",
  "queue.claim.45": "~45",
  "queue.claim.60": "~1 Std.",
  "queue.claim.90": "~1½ Std.",
  "queue.claim.120": "2 Std.+",
  "queue.aheadQuestion": "Wie viele Personen sind ungefähr vor dir?",
  "queue.aheadAria": "Personen vor dir in dieser Warteschlange",
  "queue.ahead.value": "~{n}",
  "queue.ahead.200": "200+",
  "queue.aheadSkip": "Weiß nicht / überspringen",
  "queue.details": "Details zur Warteschlange",
  "queue.detailsHelp": "Optional: Ergänze, wie sich die Schlange bewegt, wenn du es erkennen kannst, und tippe dann auf „Fertig“.",
  "queue.typeAria": "Wie sich diese Warteschlange bewegt",
  "queue.type.single": "Einzeln",
  "queue.type.pairs": "Paare",
  "queue.type.group": "Gruppen",
  "queue.type.wave": "Wellen",
  "queue.batchQuestion": "Wie viele kommen ungefähr auf einmal weiter?",
  "queue.batchAria": "Ungefähre Gruppen- oder Wellengröße",
  "queue.detailsSaved": "Details gespeichert. Danke.",
  "queue.sending": "Wird gesendet…",
  "queue.joinedSuccess": "Timer gestartet. Anzahl und Details darunter sind optional.",
  "queue.updatedSuccess": "Wartemeldung gesendet. Danke.",
  "queue.enteredSuccess": "Wartezeit abgeschlossen — danke für deine Meldung.",
  "queue.leftSuccess": "Wartesitzung beendet.",
  "queue.closedSuccess": "Geschlossene Warteschlange gemeldet. Danke.",
  "queue.enteredDeferred":
    "Du bist als eingelassen markiert. Die gemessene Wartezeit wird gesendet, sobald die Verbindung zurück ist.",
  "queue.pendingCompletion": "Abgeschlossene Wartezeit wartet auf Synchronisierung",
  "queue.reportLink": "Wartezeit melden →",
  "queue.reportLinkActive": "Du stehst hier in 1 Schlange →|Du stehst hier in {n} Schlangen →",
  "queue.reportLinkAria": "Wartezeit bei {exhibitor} melden",
  "queue.noReports": "Noch keine Meldungen",
  "queues.title": "Live-Wartezeiten",
  "queues.lede":
    "Melde die Schlange, in der du stehst, und sieh, was alle anderen melden. Dafür braucht es kein Konto — Meldungen tragen nur eine zufällige ID für dieses Gerät.",
  "queues.mine": "Schlangen, in denen du stehst",
  "queues.mineSub":
    "Deine Zeit läuft auf diesem Gerät. Sag Bescheid, wenn du drin bist, und aus der Wartezeit wird eine Messung, die alle sehen.",
  "queues.report": "Wartezeit melden",
  "queues.searchLabel": "Schlange finden",
  "queues.searchPlaceholder": "Spiel oder Stand…",
  "queues.scopedTo": "Schlangen bei {exhibitor}",
  "queues.showAll": "Alle Schlangen durchsuchen",
  "queues.countMatches": "{n} Schlange|{n} Schlangen",
  "queues.countSaved": "{n} Schlange aus deiner Merkliste|{n} Schlangen aus deiner Merkliste",
  "queues.emptyDefault":
    "Suche das Spiel, für das du anstehst. Gemerkte Stände aus dem Aussteller-Tab erscheinen hier zuerst.",
  "queues.emptySearch": "Nichts passt zu „{query}“.",
  "queues.emptyScoped": "An diesem Stand passt nichts zu „{query}“. Durchsuche alle Schlangen, um weiter zu suchen.",
  "queues.previewWhen": "Die Live-Wartezeiten starten am {day}, {date} — dem ersten Messetag.",
  "queues.previewOver": "Die gamescom 2026 ist vorbei, und mit ihr die Live-Wartezeiten.",
  "queues.previewHow":
    "Während der Messe kann hier jede wartende Person eine Zeit starten und ungefähr angeben, wie viele Leute vorne stehen. Aus diesen Meldungen entsteht die Wartezeit, die auf den Standkarten und in deinem Plan steht.",
  "queues.previewCost":
    "Melden ist freiwillig und braucht kein Konto. Der Rest des Guides funktioniert genauso, ob du es nutzt oder nicht.",
  "queues.noticeClosed": "Die Messe ist gerade geschlossen, Meldungen pausieren. Live-Zahlen gibt es wieder zur Öffnung.",
  "queues.noticeOffline": "Keine Verbindung — keine Live-Zahlen. Eine Wartezeit, die du jetzt beendest, wird gespeichert und später gesendet.",
  "queue.leftOffline":
    "Wartesitzung auf diesem Gerät beendet. Ohne Verbindung wurde der Ausgang nicht gesendet.",
  "queue.offlineNotSent": "Keine Verbindung — diese Meldung wurde nicht gesendet.",
  "queue.error": "Wartemeldung konnte nicht gesendet werden: {error}",
  "queue.errorUnknown": "unbekannter Fehler",
  "queue.errorRate": "Das war zu schnell. Warte einen Moment bis zur nächsten Meldung.",
  "queue.errorTooSoon": "Bitte warte, bevor du eine weitere Meldung sendest.",
  "queue.errorMetaReported": "Details von diesem Gerät wurden heute bereits erfasst.",
  "queue.errorExpired": "Dieser Wartetimer ist abgelaufen. Starte einen neuen, falls du noch wartest.",
  "queue.errorCompletionExpired": "Diese abgeschlossene Wartezeit konnte nicht synchronisiert werden und wurde entfernt.",
  "queue.errorPaused": "Wartemeldungen sind vorübergehend pausiert.",
  "queue.errorHours": "Außerhalb der Messezeiten sind Wartemeldungen geschlossen.",
  "queue.errorDenied": "Wartemeldungen von diesem Gerät sind deaktiviert.",
  "queue.errorUnavailable": "Für diese Warteschlange sind keine Meldungen mehr möglich.",
  "queue.errorCompletionPending": "Die vorherige abgeschlossene Wartezeit wartet noch auf Synchronisierung.",
  "queue.promptTitle": "Noch in der Schlange?",
  "queue.prompt": "Wartest du noch auf {queue}? {n} Min.",

  "mark.save": "Merken",
  "mark.saved": "Gemerkt",
  "mark.played": "Gespielt",
  "mark.aria.booth.save": "Stand von {name} auf deine Liste setzen",
  "mark.aria.booth.unsave": "Stand von {name} von deiner Liste entfernen",
  "mark.aria.booth.play": "Stand von {name} als gespielt markieren",
  "mark.aria.booth.unplay": "Stand von {name} als nicht gespielt markieren",
  "mark.aria.game.save": "{name} auf deine Liste setzen",
  "mark.aria.game.unsave": "{name} von deiner Liste entfernen",
  "mark.aria.game.play": "{name} als gespielt markieren",
  "mark.aria.game.unplay": "{name} als nicht gespielt markieren",

  /* ---------- the map, linked from every hall number ---------- */
  "map.cue": "Karte →",
  "map.openTitle": "Auf dem Hallenplan öffnen",
  "map.openTitleWith": "{what} — auf dem Hallenplan öffnen",
  "map.openAria": "{where} — auf dem Hallenplan öffnen",
  "map.openAreaAria": "{halls} — {where} auf dem Hallenplan öffnen",

  /* ---------- full official directory ---------- */
  "directory.title": "Komplettes Verzeichnis",
  "directory.summaryLede": "Alle bei der gamescom registrierten Stände, nicht nur die ausgewählten",
  "directory.booths": "{n} Stand|{n} Stände",
  "directory.boothsFiltered": "{n} / {total} Stände",
  "directory.loading": "Offizielle Liste wird geladen…",
  "directory.loadFailed": "konnte nicht geladen werden",
  "directory.error":
    "Verzeichnis konnte nicht geladen werden ({error}). Es muss einmal online geladen werden, bevor es offline funktioniert.",
  "directory.lede":
    "Die vollständige offizielle Liste vom {date}. Sie enthält auch die oben vorgestellten Stände; hier unten gibt es aber keine Spielelisten, Angaben zum Andrang oder Merkfunktion.",
  "directory.tradeOnly":
    "{n} davon steht nur im Business-Bereich (Hallen 2–4). Ein Privatbesucher-Ticket gilt dort nicht.|{n} davon stehen nur im Business-Bereich (Hallen 2–4). Ein Privatbesucher-Ticket gilt dort nicht.",
  "directory.noMatches": "Hier passt nichts zur aktuellen Suche oder Halle.",
  "directory.showMore": "{n} weitere zeigen",
  "directory.noBooth": "kein Stand angegeben",
  "directory.hostedAt": " bei {name}",
  "directory.entryAria": ", offizieller Verzeichniseintrag, öffnet in einem neuen Tab",
  "directory.businessArea": "Business-Bereich — nur für Fach- und Medienbesucher",
  "directory.fallbackHint":
    "Oben gibt es keinen Treffer — aber einen Stand im Verzeichnis unten.|Oben gibt es keinen Treffer — aber {n} Stände im Verzeichnis unten.",

  "preview.tag": "Vorschau",
  "preview.when": "Der Guide läuft, als wäre es {day}, {date}, {time} in Köln",
  "preview.exit": "zurück zum echten Datum",

  /* ---------- Today ----------
     Der Messetag-Modus: die Laufroute auf den heutigen Tag begrenzt, Gespieltes
     eingeklappt. Nur an den fünf Messetagen sichtbar. */
  "today.spanHm": "{h} Std. {m} Min.",
  "today.spanH": "{h} Std.",
  "today.spanM": "{m} Min.",
  "today.beforeOpen": "Einlass um {at} · noch {span}",
  "today.openNow": "Jetzt geöffnet · schließt {at} · noch {span}",
  "today.closedNext": "Heute geschlossen · {day} ab {at}",
  "today.closedLast": "Das war die gamescom 2026 — bis nächstes Jahr.",
  "today.left": "Noch {n} Station heute|Noch {n} Stationen heute",
  "today.leftNone": "Heute nichts mehr offen",
  "today.doneSuffix": " · {n} erledigt",
  "today.meterAria": "{done} von {total} heutigen Stationen erledigt",
  "today.firstLabel": "Zuerst hierhin",
  "today.joinBy": "Spätestens um {at} anstellen",
  "today.tooLate": "Zu spät zum Anstellen",
  "today.fitCount":
    "{n} von {total} ist vor Schließung noch zu schaffen, nur mit Wartezeit gerechnet|{n} von {total} sind vor Schließung noch zu schaffen, nur mit Wartezeit gerechnet",
  "today.fitUnmeasured": " · {n} ohne gemessene Wartezeit",
  "today.doneFold": "Erledigt · {n}",
  "today.allDone": "Alles, was du für {day} geplant hast, ist erledigt — stark.",
  "today.nothingToday": "Für {day} ist noch nichts geplant.",
  "today.emptyNoSaved":
    "Noch nichts gespeichert — tippe + bei einem Stand oder Spiel im Tab Aussteller und gib ihm dann einen Tag.",
  "today.unplaced":
    "{n} gespeicherter Eintrag hat noch keinen Tag und taucht hier deshalb nicht auf.|{n} gespeicherte Einträge haben noch keinen Tag und tauchen hier deshalb nicht auf.",
  "today.openPlan": "Zu deinem Plan →",

  /* ---------- planner ---------- */
  "planner.title": "Wann du was besuchst",
  "planner.lede":
    "Grobe Strategie nach erwartetem Andrang. Bei stark gefragten Ständen (Stufe 4–5) musst du lange warten — geh gleich morgens hin oder nimm die Schlange in Kauf. Ruhigere Stände passen gut in den Nachmittag.",
  "planner.fiveDays": "Die fünf Tage",
  "planner.yourPlan": "Dein Plan",
  "planner.queuePriority": "Stände mit hohem Andrang",
  "planner.queueSub":
    "Stände mit dem höchsten Andrang zuerst. Wenn dir einer davon wichtig ist, mach ihn zum ersten Stopp des Tages.",
  "planner.wristband": "Bändchen ab 18",
  "planner.wristbandSub":
    "Bei Ständen mit Demos ab 18 wird dein Ausweis kontrolliert und du bekommst ein rotes Bändchen — hol es dir gleich bei der Ankunft, nicht erst vorne in der Schlange.",
  "planner.crowdTips": "Allgemeine Andrang-Tipps",
  "planner.jumpAria": "Zu einem Abschnitt des Planers springen",
  "planner.dayPlanned": "{n} Stopp in deinem Plan|{n} Stopps in deinem Plan",
  "planner.dayPlannedAria": "Stopps für {day} in deinem Plan anzeigen",

  "plan.sub.day":
    "Gib jedem gemerkten Stand und Spiel einen Tag und bring den Tag dann in die Reihenfolge, in der du ihn abläufst — die Pfeile schieben einen Stopp nach oben oder unten. Nicht zugeordnetes steht oben, bis du es einsortierst.",
  "plan.sub.hall":
    "Deine Stopps sind nach Hallen gruppiert und nach Hallennummer sortiert — arbeite die Liste ab, dann läufst du nicht kreuz und quer. Die Pfeile legen die Reihenfolge innerhalb einer Halle fest, und genau so nummeriert die Karte ihre Punkte.",
  "plan.arrangeAria": "Deinen Plan anordnen",
  "plan.lensDay": "Nach Tag",
  "plan.lensHall": "Nach Halle",
  "plan.dayFilterAria": "Stopps eines einzelnen Tages zeigen",
  "plan.unassigned": "Ohne Tag",
  "plan.dayMapAria": "{day} auf dem Hallenplan zeigen",
  "plan.savedHere": "Hier gemerkt",
  "plan.absentStop": "Nicht da — kein Stand",
  "plan.offsite": "Außerhalb des Messegeländes",
  "plan.hallTba": "Halle noch offen",
  "plan.boothTba": "Stand noch offen",
  "plan.queueWith": "Andrang {n}/5 {label}",
  "plan.queueUnknown": "Andrang unbekannt",
  "plan.moveAria": "{name} im Plan verschieben — {n} von {total}",
  "plan.move.up": "{name} nach oben schieben",
  "plan.move.down": "{name} nach unten schieben",
  "plan.resetOrderTitle": "Den Plan wieder nach Andrang sortieren, stärkster zuerst",
  "plan.assignAria": "{name} einem Tag zuordnen",
  "plan.assignToDay": "{day} zuordnen",
  "plan.removeFromDay": "Von {day} entfernen",
  "plan.dayTradeSuffix": "{action} (nur Fach- und Medienbesucher)",
  "plan.itemCount": "{n} Eintrag|{n} Einträge",
  "plan.placedSuffix": " · {n} zugeordnet",
  "plan.emptyNoSaved":
    "Noch nichts gemerkt — tippe bei einem Stand oder Spiel im Aussteller-Tab auf +.",
  "plan.browseCta": "Zu den Ausstellern →",
  "plan.emptyStale":
    "Kein Eintrag aus deiner Liste steht noch in den aktuellen Daten — Aussteller können sich zwischen den Updates ändern.",

  /* ---------- planner, hall lens ---------- */
  "route.locationKicker": "Ort",
  "route.locationTba": "Ort noch offen",
  "route.locationTbaShort": "Ort noch offen",
  "route.stops": "{n} Stopp|{n} Stopps",
  "route.halls": "{n} Halle|{n} Hallen",
  "route.queueShort": "Q{n}",
  "route.stepsNear": "Nächste Halle gleich nebenan",
  "route.stepsAcross": "Quer über das Gelände",
  "route.stepsFar": "Am anderen Ende des Geländes",
  "route.allDays": "Alle Tage",
  "route.allDaysTitle": "Jeder Stopp auf deiner Liste",
  "route.onlyDay": "Nur Stopps für {day}",
  "route.onlyUnassigned": "Nur Stopps ohne Tag",
  "route.absentNote": "Auf deiner Liste, aber nicht auf dem Messegelände: {names}.",
  "route.emptyNoSaved":
    "Noch nichts gemerkt — tippe bei einem Stand oder Spiel im Aussteller-Tab auf +. Dann werden deine Stopps hier nach Hallen sortiert.",
  "route.emptyAllPlayed": "Du hast alle Stopps hier als gespielt markiert — stark.",
  "route.emptyAllAssigned":
    "Jeder Stopp auf deiner Liste hat einen Tag — wechsle zur Ansicht „Nach Tag“, um den Plan durchzugehen.",
  "route.emptyForDay":
    "Für {day} ist noch nichts geplant. Ordne Stopps in der Ansicht „Nach Tag“ zu.",
  "route.emptyStale":
    "Keine aktuellen Stopps passen zu deiner Liste — die Ausstellerdaten haben sich vermutlich geändert.",

  /* ---------- queue priority ---------- */
  "priority.count": "{n} Stand mit hohem Andrang|{n} Stände mit hohem Andrang",
  "priority.countFiltered": "{n} / {total} Stände mit hohem Andrang",
  "priority.playedSuffix": " · {n} gespielt",
  "priority.emptyAllPlayed": "Du hast alle Stände mit hohem Andrang auf deiner Liste als gespielt markiert — stark.",
  "priority.emptyNoneHigh":
    "Auf deiner Liste steht kein Stand mit hohem Andrang — gute Nachricht: Wahrscheinlich kommst du überall ohne lange Wartezeit dran.",
  "priority.emptyNoSaved":
    "Noch nichts gemerkt — tippe bei einem Stand oder Spiel im Aussteller-Tab auf +.",
  "wristband.wholeBooth": "Der gesamte Stand ist ab 18",

  /* ---------- event info ---------- */
  "event.theShow": "Die Messe",
  "event.tickets": "Tickets",
  "event.ticketsFallback": "Tickets siehe gamescom.global.",
  "event.areas": "Hallen & Bereiche",
  "event.areasMapAria": "Das gesamte Gelände auf dem Hallenplan öffnen",
  "event.entrances": "Eingänge",
  "event.entrancesTradeLabel": "Mit Business-Ticket.",
  "event.officialLinks": "Offizielle Links",
  "event.compiledNote":
    "Zusammengestellt aus veröffentlichten Quellen, nicht von der gamescom selbst.",
  "links.officialSite": "Offizielle Seite",
  "links.exhibitorDirectory": "Ausstellerverzeichnis",
  "links.officialList": "Offizielle Liste",
  "links.hallPlan": "Hallenplan",
  "links.officialMap": "Offizielle Karte",

  /* ---------- updates ---------- */
  "updates.title": "Daten-Updates",
  "updates.lede":
    "Dieser Guide wird bis zur Messe alle paar Tage aktualisiert, sobald Aussteller ihre Spiele und Standorte bekannt geben. Was sich in welcher Revision geändert hat:",
  "updates.rev": "Rev. {n}",
  "updates.englishOnly": "Die Änderungsliste unten erscheint auf Englisch.",
  "updates.filterLabel": "Zeigen",
  "updates.kind.feature": "Funktion",
  /* "Behoben", not "Fehlerbehebung": the tag is set inline at the head of every
     bullet, and the long compound took a third of the line on a phone. */
  "updates.kind.fix": "Behoben",
  "updates.kind.content": "Messe-Infos",
  "updates.noneOfKind": "Zu dieser Art sind noch keine Änderungen verzeichnet.",
  "updates.refExhibitor": "Karte von {exhibitor} öffnen",
  "updates.refGame": "{exhibitor} öffnen, zeigt {game}",

  /* ---------- countdown & freshness ---------- */
  "countdown.days": "T−{n} Tag|T−{n} Tage",
  "countdown.live": "● Läuft gerade",
  "countdown.over": "Bis nächstes Jahr",
  "meta.freshness": "Daten aktualisiert am {date} · Rev. {rev}.",

  /* ---------- sharing ---------- */
  "share.overline": "Dein Plan",
  "share.title": "Merkliste teilen",
  "share.closeAria": "Teilen-Dialog schließen",
  "share.withLegend": "Teilen mit",
  "share.modeFriend": "Jemand anderem",
  "share.modeDevice": "Einem anderen meiner Geräte",
  "share.includeLegend": "Was mitkommt",
  "share.partSaved": "Merkliste",
  "share.partDays": "Tagesplan",
  "share.partPlayed": "„Gespielt“-Markierungen",
  "share.linkLabel": "Link zum Teilen",
  "share.copyAction": "Link kopieren",
  "share.nativeAction": "Teilen…",
  "share.nativeTitle": "gamescom 2026 – Merkliste",
  "share.qrHint": "Scannen, um diese Liste auf einem anderen Gerät zu öffnen.",
  "share.qrAlt": "QR-Code",
  "share.qrTooLong": "Diese Liste ist zu lang für einen QR-Code — schick stattdessen den Link.",
  "share.qrFailed": "Der QR-Code konnte nicht geladen werden — schick stattdessen den Link.",
  "share.copied": "Link kopiert.",
  "share.copyManually": "Zum Kopieren ⌘C / Strg+C drücken.",
  "share.failed": "Teilen fehlgeschlagen — kopier stattdessen den Link.",

  /* Den Guide selbst teilen, nicht die Merkliste. */
  "shareSite.action": "Teilen",
  "shareSite.actionAria": "Diesen Guide teilen",
  "shareSite.overline": "Weitersagen",
  "shareSite.title": "Guide teilen",
  "shareSite.closeAria": "Teilen-Dialog schließen",
  "shareSite.lede": "Kostenlos, inoffiziell und einmal geöffnet auch offline nutzbar — lohnt sich für alle, die zur Messe gehen.",
  "shareSite.qrHint": "Halt den Code vor die Kamera, dann öffnet sich der Guide auf dem anderen Handy.",
  "shareSite.linkLabel": "Link",
  "shareSite.nativeTitle": "gamescom 2026 – Besucherguide",

  /* Einen einzelnen Stand teilen — die dritte Zeile in der Ecke einer Karte. */
  "shareBooth.action": "Teilen",
  "shareBooth.aria": "Stand von {name} teilen",
  "shareBooth.overline": "Hierhin schicken",
  "shareBooth.title": "Diesen Stand teilen",
  "shareBooth.closeAria": "Teilen-Dialog schließen",
  "shareBooth.qrHint": "Oder halt den Code vor die Kamera, dann öffnet sich dieser Stand auf dem anderen Handy.",
  "shareBooth.nativeTitle": "{name} auf der gamescom 2026",

  "share.items": "{n} Eintrag|{n} Einträge",
  "share.readyWithStale": "Du kannst {items} teilen.",
  "share.staleOlder":
    " {n} älterer Eintrag ist nicht mehr im Guide.| {n} ältere Einträge sind nicht mehr im Guide.",
  "share.stale": " {n} davon ist nicht mehr im Guide.| {n} davon sind nicht mehr im Guide.",
  "share.carried.days": "einen Tagesplan",
  "share.carried.played": "„Gespielt“-Markierungen",
  "share.carried.join": " und ",
  "share.carried.note": " Enthält außerdem {what}.",
  "share.outOfDate": "Diese geteilte Liste ist veraltet — es bleibt nichts zum Hinzufügen.",
  "share.loadedMoved": "Du hast {items} übernommen.",
  "share.loadedShared": "Du hast {items} aus einem geteilten Link geladen.",
  "share.newToYou": " — {n} neu für dich",
  "share.replaceCost":
    " Beim Ersetzen fällt {n} Eintrag weg, den nur du hier hast.| Beim Ersetzen fallen {n} Einträge weg, die nur du hier hast.",
  "share.movedPlan": "Der übertragene Plan enthält {items}{news}.",
  "share.replaceAction": "Meine Liste ersetzen",
  "share.replaced": "Deine Liste entspricht jetzt dem übertragenen Plan.",
  "share.alreadyHave": "Du hast schon alles aus diesem geteilten Link.",
  "share.linkHas": "Ein geteilter Link enthält {items} — {n} neu für dich.",
  "share.addAction": "Zu meiner Liste hinzufügen",
  "share.added": "Du hast {items} aus dem geteilten Link hinzugefügt.",
  "toast.orderReset": "Plan wieder in Andrang-Reihenfolge.",
  "toast.moveUndone": "Übernahme rückgängig gemacht.",
  "toast.importUndone": "Hinzufügen aus dem geteilten Link rückgängig gemacht.",
  "moved.withList": "Der Guide ist auf hallgui.de umgezogen. Deine Liste kommt mit.",
  "moved.plain": "Der Guide ist auf hallgui.de umgezogen.",
  "moved.open": "Öffnen",

  /* ---------- sources & attribution ---------- */
  "sources.overline": "Woher die Infos kommen",
  "sources.title": "Quellen",
  "sources.closeAria": "Quellen schließen",
  "sources.thisGuide": "diesen Guide",
  "sources.aria": "Quellen für {name} — {n} Link|Quellen für {name} — {n} Links",
  "sources.note.event":
    "Termine, Öffnungszeiten, Tickets und Hallenbereiche auf dieser Seite stammen aus {n} Quelle.|Termine, Öffnungszeiten, Tickets und Hallenbereiche auf dieser Seite stammen aus {n} Quellen.",
  "sources.note.card":
    "Standort, Spiele und erwarteter Andrang in diesem Eintrag stammen aus {n} Quelle.|Standort, Spiele und erwarteter Andrang in diesem Eintrag stammen aus {n} Quellen.",
  "sources.lastUpdated": " Zuletzt aktualisiert am {date}.",
  "sources.lastChecked": " Quellen zuletzt geprüft am {date}.",
  "sources.caveat":
    "Das hier ist ein inoffizieller Guide. Standnummern und Spieleangebote können sich bis zur Messe ändern. Wenn ein Detail für deinen Tag wichtig ist, prüf es an der Quelle.",

  /* ---------- calendar export ---------- */
  "ics.filename": "gamescom-2026-plan.ics",
  "ics.locationFallback": "Koelnmesse, Köln",
  "ics.summary": "gamescom — Plan für {day} ({n} Stopp)|gamescom — Plan für {day} ({n} Stopps)",
  "ics.exhibitor": "{name} — {where} (Andrang {queue})",
  "ics.hallBooth": "Halle {hall}, Stand {booth}",
  "ics.queueUnknown": "unbekannt",
  "ics.gameAt": "{name} — bei {booths}",
  "ics.gameNoBooth": "{name} — kein Stand angegeben",

  /* ---------- confirmations & boot ---------- */
  "confirm.clearSaved":
    "{n} gemerkten Eintrag, seine Tagesplanung und seinen Platz im Plan wirklich löschen? Das lässt sich nicht rückgängig machen.|Alle {n} gemerkten Einträge, ihre Tagesplanung und die Reihenfolge, in die du sie gebracht hast, wirklich löschen? Das lässt sich nicht rückgängig machen.",
  "confirm.clearPlayed":
    "{n} „Gespielt“-Markierung wirklich löschen? Das lässt sich nicht rückgängig machen.|Alle {n} „Gespielt“-Markierungen wirklich löschen? Das lässt sich nicht rückgängig machen.",
  "boot.loadFailed":
    "Daten konnten nicht geladen werden ({error}). Falls du die Datei direkt geöffnet hast, öffne sie stattdessen über einen Webserver:",

  /* ---------- footer ---------- */
  "footer.unofficial": "Inoffizieller Fan-Guide.",
  "footer.notAffiliated":
    "Dieser Guide steht nicht in Verbindung mit der gamescom, der Koelnmesse oder game – Verband der deutschen Games-Branche.",
  "footer.storage":
    "Deine Merkliste bleibt in diesem Browser. Wartemeldungen sind freiwillig; nur die Fakten zur Schlange und eine zufällige Geräte-ID werden an den Live-Dienst gesendet.",
  "footer.createdBy":
    'Erstellt von <a class="subtle-link" href="https://inventivetalent.org">inventivetalent</a> mit Claude Code. <a class="subtle-link" href="https://github.com/InventivetalentDev/gc2026-guide">Open Source</a>.',
  /* The legal pages stay English, but the links wear the German names —
     "Impressum" is the word people look for, and § 5 DDG is about it
     being easy to find. */
  "footer.imprint": "Impressum",
  "footer.privacy": "Datenschutz",
  "footer.statusKey": "Legende zum Spielstatus",
  "legend.confirmed":
    '<span class="dot" data-status="confirmed"></span> <b>Bestätigt</b> — offiziell für die gamescom angekündigt',
  "legend.expected":
    '<span class="dot" data-status="expected"></span> <b>Erwartet</b> — wahrscheinlich, aber nicht angekündigt',
  "legend.rumored":
    '<span class="dot" data-status="rumored"></span> <b>Vermutet</b> — unsere Einschätzung, unbestätigt',
  "legend.age":
    '<span class="badge badge-age" data-age-status="confirmed">18+</span> — Demo ist altersbeschränkt, Ausweis und rotes Bändchen nötig',

  /* ---------- install & offline (js/pwa.js) ---------- */
  "pwa.install": "App installieren",
  "pwa.addToHome": "Zum Home-Bildschirm",
  "pwa.iosHint": "In Safari auf Teilen tippen, dann „Zum Home-Bildschirm“.",
  "pwa.installed": "Installiert. Der Guide funktioniert jetzt offline.",
  "pwa.updateReady": "Eine neuere Version des Guides ist bereit.",
  "pwa.reload": "Neu laden",

  /* ---------- hall map page (map.html, js/map.js) ---------- */
  "map.metaDescription":
    "Hallenpläne der gamescom 2026 mit einzelnen Ständen und deinen gemerkten Ständen. Funktioniert offline.",
  "map.docTitle": "Hallenplan · gamescom 2026 Guide",
  "map.title": "Hallenplan",
  "map.offline": "Offline",
  "map.backAria": "Zurück zum Guide",
  "map.hallsAria": "Hallen",
  "map.loading": "Halle wird geladen …",
  "map.loadFailed": "Hallenplan konnte nicht geladen werden — {error}",
  "map.closeSheetAria": "Standdetails schließen",
  "map.openInGuide": "im Guide öffnen →",
  "map.planAria": "Schematischer Plan von Halle {hall}",
  "map.stand": "Stand",
  "map.standNr": "Stand {nr}",
  "map.standAria": "{name} — Stand {nr}",
  "map.sheetLoc": "Halle {hall} · Stand {nr}",
  "map.sheetAlso": " · auch {list}",
  "map.unconfBadge": "Standort unbestätigt",
  "map.queueForecast": "Erwarteter Andrang: Q{n} · {label}",
  "map.gamesCount": "{n} Spiel|{n} Spiele",
  "map.plusMore": ", +{n} weitere",
  "map.alsoHere": "ebenfalls hier",
  "map.notCovered": "nicht im Guide erfasst",
  "map.noExhibitor": "kein Aussteller für diesen Stand gemeldet",
  "map.saveBooth": "+ Stand merken",
  "map.unsaveBooth": "− Nicht mehr merken",
  "map.plannedFor": "geplant · {days}",
  "map.zoomIn": "Hineinzoomen",
  "map.zoomOut": "Herauszoomen",
  "map.zoomFit": "Ganze Halle zeigen",
  "map.rotate": "Halle im Uhrzeigersinn drehen",
  "map.counts": "{n} Stände · {covered} im Guide",
  "map.countsSaved": " · {n} gemerkt",
  "map.countsPlanned": " · {n} geplant",
  "map.chipSavedAria": ", {n} gemerkt",
  "map.heat": "Warteschlangen",
  "map.heatAria": "Live-Wartezeiten auf dem Hallenplan anzeigen",
  "map.heatOffAria": "Live-Wartezeiten ausblenden",
  "map.routeAria": "Stopps eines Tages zeigen",
  "map.routeKicker": "Plan",
  "map.routeDayOn": "Stopps für {day} zeigen",
  "map.routeDayOff": "Stopps für {day} ausblenden",
  "map.routeUnplacedOn": "Stopps ohne Tag zeigen",
  "map.routeUnplacedOff": "Stopps ohne Tag ausblenden",
  "map.routeHint": "Tag wählen, um die Stopps zu nummerieren",
  "map.routeStops": "{n} Stopp hier|{n} Stopps hier",
  "map.routeOrderNote": "· Planreihenfolge, kein Laufweg",
  "map.routeNoneHere": "in dieser Halle nichts geplant",
  "map.legPrev": "◂ {hall} · {n} Stopp|◂ {hall} · {n} Stopps",
  "map.legNext": "{hall} · {n} Stopp ▸|{hall} · {n} Stopps ▸",
  "map.legPrevAria": "Im Plan vor dieser Halle: Halle {hall}, {n} Stopp — öffnen|Im Plan vor dieser Halle: Halle {hall}, {n} Stopps — öffnen",
  "map.legNextAria": "Im Plan nach dieser Halle: Halle {hall}, {n} Stopp — öffnen|Im Plan nach dieser Halle: Halle {hall}, {n} Stopps — öffnen",
  "map.routeHintCampus": "Tag wählen, um die Hallen der Reihe nach zu sehen",
  "map.routeHalls": "{n} Halle|{n} Hallen",
  "map.routeStopsAll": "{n} Stopp|{n} Stopps",
  "map.routeNoneAnywhere": "an diesem Tag nichts geplant",
  "map.chipPlannedAria": ", {n} Stopp geplant|, {n} Stopps geplant",
  "map.stopBadge": "Stopp {n} von {total}",
  "map.stopAria": " — Stopp {n} von {total}",
  "map.outlines": "Standflächen",
  "map.officialHallPlan": "offizieller Hallenplan",
  "map.checkedOn": "geprüft am {date} · schematisch, inoffiziell",
  /* Der Boulevard heißt auf dem offiziellen Plan auch auf Deutsch so. */
  "map.door.boulevard": "Boulevard",
  "map.door.entrance-east": "Eingang Ost",
  "map.doorsApprox": "Hallentüren von uns, ungefähr",

  /* ---------- die Geländeübersicht ----------

     "Übersicht" ist der Chip ganz links: ein Schritt zurück von einer
     Halle auf das ganze Gelände. Die Namen der vier Eingänge brechen bei
     Bedarf auf zwei Zeilen um — deshalb bleiben sie zweiteilig ("Eingang
     / Nord"). Piazza und Confex heißen auf dem offiziellen Plan auch auf
     Deutsch so. */
  "map.overview": "Übersicht",
  "map.overviewAria": "Übersicht über das gesamte Gelände",
  "map.campusAria": "Schema der gamescom-Hallen, des Boulevards dazwischen und der Eingänge",
  "map.campusCounts": "{n} Hallen · zum Öffnen antippen",
  "map.campusLayout": "Geländeplan",
  "map.campusNotToScale": "nicht maßstabsgetreu",
  "map.place.boulevard": "Boulevard",
  "map.place.piazza": "Piazza",
  "map.place.confex": "Confex",
  "map.place.congress-north": "Congress Nord",
  "map.place.congress-east": "Congress Ost",
  "map.gate.entrance-north": "Eingang Nord",
  "map.gate.entrance-east": "Eingang Ost",
  "map.gate.entrance-south": "Eingang Süd",
  "map.gate.entrance-west": "Eingang West",

  /* ---------- business access & the business halls ----------

     "Fachbesucher" is the word the German trade press and gamescom itself
     use for a trade visitor. gamescom calls the matching admission product a
     Business Ticket, so the UI uses Ticket rather than the English "badge". */
  "toolbar.badge": "Ticket",
  "toolbar.badgeAria": "Welches Ticket du hast",
  "badge.consumer": "Privatbesucher",
  "badge.consumerTitle": "Privatbesucher-Ticket — die Entertainment-Hallen",
  "badge.trade": "Business",
  "badge.tradeTitle": "Business-Ticket — zeigt zusätzlich die Business-Hallen 2 bis 4",
  "summary.tradePrefix": "Business-Hallen · {filters}",
  "summary.noneLower": "alle Kategorien, alle Hallen",

  "trade.sectionTitle": "Business-Aussteller",
  "trade.sectionLede":
    "Die Business-Hallen: Publisher, Dienstleister für Spieleentwickler und Plattformen. Nur für Fach- und Medienbesucher.",
  "trade.gateWhat":
    "Die Hallen 2–4 sind der <strong>Business-Bereich</strong> der gamescom. Dort treffen sich rund 800 Aussteller: Publisher, Dienstleister für Entwicklung und Übersetzung, Anbieter von Engines und Plattformen, Länderstände und Verbände. Der Bereich ist von Mittwoch bis Freitag geöffnet und am Wochenende geschlossen.",
  "trade.gateBadge":
    "Mit einem <strong>Business-Ticket</strong> hast du Zutritt; mit einem Privatbesucher-Ticket nicht. Deshalb blendet der Guide diesen Bereich zunächst aus. Wenn du die Business-Aussteller einblendest, kannst du die Stände wie alle anderen merken und einplanen. Du findest sie in der Liste unten und in der Übersicht oben.",
  "trade.enable": "Ich habe ein Business-Ticket — Business-Aussteller zeigen",
  "trade.hide": "Business-Aussteller ausblenden",
  "trade.turnOff": "Business-Aussteller ausschalten",
  "trade.showList": "Zur Liste →",
  "trade.toastOn":
    "Business-Aussteller an — die Stände stehen in der Übersicht und in ihrer eigenen Liste darunter.",
  "trade.toastOff": "Business-Aussteller aus — zurück zu den Entertainment-Hallen.",
  "trade.toastLinked":
    "Das ist ein Stand in den Business-Hallen, deshalb sind die Business-Aussteller jetzt an. Über die Ausweis-Zeile schaltest du sie wieder aus.",
  "trade.catFilterAria": "Business-Aussteller nach Produktgruppe filtern",
  "trade.loading": "Business-Hallen werden geladen…",
  "trade.loadError":
    "Die Business-Liste konnte nicht geladen werden ({error}). Sie muss einmal online geladen werden, bevor sie offline funktioniert.",
  "trade.dataPending":
    "Deine Liste enthält Stände aus den Business-Hallen. Lade die Daten einmal online, bevor du sie einplanst. Danach sind sie auch offline verfügbar.",
  "trade.listWhat":
    "Im Business-Bereich (Hallen 2–4) trifft sich die Spielebranche. Mit einem Business-Ticket hast du Zutritt; mit einem Privatbesucher-Ticket nicht. Nach Freitag sind die Hallen geschlossen.",
  "trade.listWalkUp":
    "Fast alle Stände sind ohne Termin zugänglich: An den Länder- und Regionalständen teilen sich oft ein Dutzend oder mehr Firmen die Fläche. Bei den kleinen Theken in den Hallen 2.1 und 2.2 kannst du einfach vorbeischauen. Nur etwa zwanzig große Einzelstände in Halle 4.2 sind geschlossen und brauchen einen Termin. Die Angabe „geteilt“ markiert Gemeinschaftsstände; in den Einträgen oben steht, was sie anbieten.",
  "trade.listPlannable": "Gemerkte Stände kannst du wie jeden anderen Stopp einplanen.",
  "trade.listNoMatches": "Hier passt nichts zur aktuellen Suche, Halle oder Kategorie.",
  "trade.exhibitorCount": "{n} Aussteller|{n} Aussteller",
  "trade.shared": "geteilt · {n}",
  "trade.sharedTitle":
    "An diesem Stand sind {n} Aussteller eingetragen — meist ist das ein Länder- oder Regionalstand",
  "trade.offers": "Bietet",
  "trade.offerCount": "{n} Angebot|{n} Angebote",
  "trade.accessLabel": "Zugang",
  "trade.access.open.label": "Ohne Termin",
  "trade.access.open.note":
    "Ein offener Stand — während der Öffnungszeiten besetzt, kein Termin nötig.",
  "trade.access.appointment.label": "Nur mit Termin",
  "trade.access.appointment.note":
    "Ein geschlossener Stand mit Besprechungsräumen. Du kommst nur mit einem vereinbarten Termin hinein; vom Gang aus gibt es nichts zu sehen.",
  "trade.access.mixed.label": "Spontan + mit Termin",
  "trade.access.mixed.note":
    "Eine offene Theke mit geschlossenen Besprechungsräumen dahinter — du kannst einfach zur Theke gehen; für die Räume brauchst du einen Termin.",

  "hall.businessAria": "Halle {hall}, Business-Bereich, nur Fach- und Medienbesucher",
  "card.faceToTrade": "Business-Stand zeigen — Halle {hall}, nur Fach- und Medienbesucher",
  "card.faceToPublic": "Zurück zum Publikumsstand — Halle {hall}",
  "plan.tradeBadge": "Business-Ticket",
  "plan.dayClosedSuffix": "{action} — der Business-Bereich ist am {day} geschlossen",
  "plan.closedWarn":
    "Der Business-Bereich ist am {day} geschlossen — dieser Stopp ist dann nicht zugänglich.",
  "plan.closedGroupWarn":
    "{n} Stopp liegt im Business-Bereich, der am {day} geschlossen ist.|{n} Stopps liegen im Business-Bereich, der am {day} geschlossen ist.",
  "ics.tradeExhibitor": "{name} — {where} (Business-Ticket{shut})",
  "ics.businessClosed": "; Business-Bereich an diesem Tag GESCHLOSSEN",

  "event.yourBadge": "Dein Ticket",
  "event.badgeWhat":
    "Die Hallen 2–4 sind der <strong>Business-Bereich</strong>: rund 800 Aussteller aus der Spielebranche, geöffnet von Mittwoch bis Freitag und am Wochenende geschlossen. Mit einem <strong>Business-Ticket</strong> hast du Zutritt; mit einem Privatbesucher-Ticket nicht.",
  "event.badgeOnNote":
    "Business-Stände werden angezeigt — in der Ausstellerübersicht, im Hallenfilter, auf der Karte und als eigene Liste auf der Ausstellerseite.",
  "event.badgeOffNote":
    "Der Guide zeigt nur die Entertainment-Hallen. Diese Einstellung ändert nur die Anzeige, nicht den Zutritt mit deinem Ticket.",

  /* ---------- map areas ---------- */
  "map.area.entertainment.label": "Entertainment",
  "map.area.business.label": "Business",
  "map.area.business.access":
    "nur mit Business-Ticket. Ein Privatbesucher-Ticket gilt in diesen Hallen nicht. Nach Freitag sind sie geschlossen.",
  "map.areaSuffix": "{label}-Bereich",
  "map.coveredNone": "keiner",
  "map.tradeVisitorsOnly": ", nur Fach- und Medienbesucher",
  "map.tradeOnlySuffix": ", nur Fach- und Medienbesucher",
  "map.tradeOnlyLabel": "nur Fach- und Medienbesucher",
  "map.showExhibitors": "Ich habe ein Business-Ticket — Aussteller zeigen",
  "map.showTrade": "Business-Aussteller zeigen",
  "map.gatedHint":
    "Business-Bereich — die meisten Aussteller erscheinen im Guide, wenn du Business-Aussteller einblendest",
  "map.officialProfile": "offizielles Profil ↗",

  "footer.feedback":
    'Etwas falsch, fehlend oder veraltet? Schick Korrekturen an <a class="subtle-link" href="mailto:content@hallgui.de?subject=gamescom%20guide%20feedback">content@hallgui.de</a>.',

  /* ---------- accessibility ---------- */
  "a11y.newTab": ", öffnet in einem neuen Tab",
};
