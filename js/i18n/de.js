/* gamescom 2026 guide — German UI strings.

   Register: "du" throughout — gamescom's own German communication uses it,
   the audience is a gaming audience, and it is shorter, which the dense
   cards need.

   Deliberately untranslated: game and exhibitor names, platform names,
   "gamescom", "Opening Night Live", official area names, hall and booth
   numbers, and the scene vocabulary German gamers use in English anyway
   (Indie, Merch, Demo, Hands-on, Queue, Community, Lifestyle).

   Key parity with en.js — including plural forms and {placeholders} — is
   enforced by tools/check-i18n.mjs before every deploy. */

window.GC_STRINGS = window.GC_STRINGS || {};

window.GC_STRINGS.de = {
  /* ---------- document & navigation ---------- */
  "meta.description":
    "Inoffizieller Guide zur gamescom 2026 — Aussteller, Spiele, Hallen- und Standorte, Andrangprognosen und Besuchsplanung.",
  "nav.skip": "Zum Inhalt springen",
  "nav.sections": "Bereiche",
  "brand.kicker": "Inoffizieller Besucherguide",
  "header.offline": "Offline · gespeicherte Daten",
  "tab.exhibitors": "Aussteller",
  "tab.planner": "Besuchsplaner",
  "tab.event": "Event-Infos",
  "tab.updates": "Updates",

  /* ---------- toolbar & filters ---------- */
  "field.search": "Suche",
  "field.sort": "Sortieren",
  "search.placeholder": "Aussteller, Spiel oder Tag…",
  "sort.crowdDesc": "Andrang — vollste zuerst",
  "sort.crowdAsc": "Andrang — ruhigste zuerst",
  "sort.name": "Name A–Z",
  "sort.hall": "Hallennummer",
  "toolbar.filters": "Filter",
  "toolbar.category": "Kategorie",
  "toolbar.age": "Alter",
  "toolbar.onlyShow": "Nur zeigen",
  "toggle.playable": "Spielbare Demos",
  "toggle.confirmed": "Bestätigte Standorte",
  "toggle.saved": "Gespeichert",
  "toggle.savedOnly": "Nur gespeicherte",
  "toggle.hidePlayed": "Gespielte ausblenden",
  "filter.all": "Alle",
  "action.shareList": "Liste teilen",
  "action.clearSaved": "Gespeicherte löschen",
  "action.clearPlayed": "Gespielt-Marken löschen",
  "action.yourPlan": "Dein Plan →",
  "action.clearFilters": "Filter zurücksetzen",
  "action.exportIcs": "In Kalender exportieren (.ics)",
  "action.undo": "Rückgängig",
  "action.dismiss": "Schließen",

  "summary.none": "Alle Kategorien, alle Hallen",
  "summary.hideAdult": "ohne 18+",
  "summary.onlyAdult": "nur 18+",
  "summary.playableOnly": "nur spielbar",
  "summary.confirmedOnly": "nur bestätigt",
  "summary.savedOnly": "nur gespeicherte",
  "summary.playedHidden": "gespielte versteckt",

  "count.exhibitors": "{n} Aussteller|{n} Aussteller",
  "count.exhibitorsFiltered": "{n} / {total} Aussteller",
  "empty.noMatches": "Nichts gefunden — versuch es ohne Filter.",
  "empty.noSavedYet":
    "Noch nichts gespeichert — tipp auf + bei einem Stand oder einem Spiel im Lineup, um eine Liste zu starten.",

  /* ---------- vocabularies ---------- */
  "type.platform": "Plattformen",
  "type.publisher": "Publisher",
  "type.hardware": "Hardware",
  "type.indie": "Indie",
  "type.experience": "Erlebnisse & Aktionen",
  "type.media": "Medien & Community",
  "type.merch": "Merch & Lifestyle",
  "type.trade": "Trade & Business",

  "crowd.0": "Unbekannt",
  "crowd.1": "Ruhig",
  "crowd.2": "Wenig",
  "crowd.3": "Mittel",
  "crowd.4": "Voll",
  "crowd.5": "Extrem",

  "status.confirmed": "Bestätigt",
  "status.expected": "erwartet",
  "status.rumored": "Gerücht",
  "badge.playable": "spielbar",

  "age.filter.all": "Alle",
  "age.filter.hide": "Ohne 18+",
  "age.filter.only": "Nur 18+",
  "age.confirmedTitle": "18+ Bändchen erforderlich",
  "age.expectedTitle": "18+ erwartet — nicht bestätigt",
  "age.expectedBadge": "18+ erwartet",

  "hall.word": "Halle",
  "where.hall": "Halle {hall}",
  "where.hallBooth": "Halle {hall}, Stand {booth}",
  "where.hallDotBooth": "Halle {hall} · {booth}",
  "kind.booth": "Stand",
  "kind.game": "Spiel",
  "kind.trade": "Business",

  /* ---------- exhibitor cards ---------- */
  "plate.statusKicker": "Status",
  "plate.absent": "Nicht da",
  "plate.noBooth": "kein Stand",
  "plate.tba": "Offen",
  "plate.notAnnounced": "nicht angekündigt",
  "plate.boothTba": "Stand offen",
  "plate.unconfSuffix": " · unbestät.",
  "plate.confirmedTitle": "Offiziell bestätigter Standort",
  "plate.unconfirmedTitle": "Beste Schätzung — nicht offiziell bestätigt",

  "card.lineup": "Lineup",
  "card.titles": "{n} Titel|{n} Titel",
  "card.playableCount": "{n} spielbar",
  "card.showFewer": "− Weniger zeigen",
  "card.showMore": "+ {n} weitere",
  "card.queueIndex": "Queue-Index",
  "card.queueAria": "Queue-Index {n} von 5",
  "card.planLabel": "Plan",
  "card.officialPage": "Offizielle Ausstellerseite",
  "card.officialPageAria": " für {name}, öffnet in einem neuen Tab",

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

  /* ---------- full official directory ---------- */
  "directory.title": "Komplettes Verzeichnis",
  "directory.summaryLede": "Alle bei der gamescom registrierten Stände, nicht nur die kuratierten",
  "directory.booths": "{n} Stand|{n} Stände",
  "directory.boothsFiltered": "{n} / {total} Stände",
  "directory.loading": "Offizielle Liste wird geladen…",
  "directory.loadFailed": "konnte nicht geladen werden",
  "directory.error":
    "Verzeichnis konnte nicht geladen werden ({error}). Es muss einmal online geladen werden, bevor es offline funktioniert.",
  "directory.lede":
    "Die offizielle Rohliste mit Stand vom {date} — Stände mit Karte oben inklusive, hier unten aber ohne Lineups, Andrangprognosen und Merken.",
  "directory.tradeOnly":
    "{n} davon stehen nur im Business-Bereich (Hallen 1–4), den ein Privatbesucher-Ticket nicht öffnet.",
  "directory.noMatches": "Hier passt nichts zur aktuellen Suche oder Halle.",
  "directory.showMore": "{n} weitere zeigen",
  "directory.noBooth": "kein Stand angegeben",
  "directory.hostedAt": " bei {name}",
  "directory.entryAria": ", offizieller Verzeichniseintrag, öffnet in einem neuen Tab",
  "directory.businessArea": "Business-Bereich — nur Fach- und Medienbesucher",
  "directory.fallbackHint":
    "Keine Karte passt — aber ein Stand im Verzeichnis unten.|Keine Karte passt — aber {n} Stände im Verzeichnis unten.",

  /* ---------- planner ---------- */
  "planner.title": "Wann du was besuchst",
  "planner.lede":
    "Grobe Strategie nach erwartetem Andrang. Stark nachgefragte Stände (Queue-Index 4–5) bedeuten lange Wartezeiten — geh da gleich morgens hin oder nimm die Schlange in Kauf. Ruhige Stände sind gute Nachmittagsfüller.",
  "planner.fiveDays": "Die fünf Tage",
  "planner.yourPlan": "Dein Plan",
  "planner.queuePriority": "Queue-Priorität",
  "planner.queueSub":
    "Vollste Stände zuerst. Wenn dir einer davon wichtig ist, mach ihn zu deinem ersten Stopp des Tages.",
  "planner.wristband": "18+ Bändchen",
  "planner.wristbandSub":
    "Stände mit 18+ Demos kontrollieren den Ausweis und geben ein rotes Bändchen aus — hol es dir bei der Ankunft, nicht erst vorne in der Schlange.",
  "planner.crowdTips": "Allgemeine Andrang-Tipps",

  "plan.sub.day":
    "Gib jedem gemerkten Stand und Spiel einen Tag. Nicht zugeordnetes steht oben, bis du es einsortierst.",
  "plan.sub.hall":
    "Deine Stopps nach Halle gruppiert, in Hallennummer-Reihenfolge — arbeite die Liste ab, dann läufst du nicht kreuz und quer.",
  "plan.arrangeAria": "Deinen Plan anordnen",
  "plan.lensDay": "Nach Tag",
  "plan.lensHall": "Nach Halle",
  "plan.dayFilterAria": "Stopps eines einzelnen Tages zeigen",
  "plan.unassigned": "Ohne Tag",
  "plan.savedHere": "Hier gemerkt",
  "plan.absentStop": "Nicht da — kein Stand",
  "plan.offsite": "Außerhalb",
  "plan.hallTba": "Halle offen",
  "plan.boothTba": "Stand offen",
  "plan.queueWith": "Queue {n}/5 {label}",
  "plan.queueUnknown": "Queue unbekannt",
  "plan.assignAria": "{name} einem Tag zuordnen",
  "plan.assignToDay": "{day} zuordnen",
  "plan.removeFromDay": "Von {day} entfernen",
  "plan.dayTradeSuffix": "{action} (nur Fach- und Medienbesucher)",
  "plan.itemCount": "{n} Eintrag|{n} Einträge",
  "plan.placedSuffix": " · {n} zugeordnet",
  "plan.emptyNoSaved":
    "Noch nichts gemerkt — tipp auf + bei einem Stand oder Spiel im Aussteller-Tab.",
  "plan.emptyStale":
    "Nichts von deiner Liste ist noch im aktuellen Lineup — Aussteller kommen und gehen zwischen Daten-Updates.",

  /* ---------- planner, hall lens ---------- */
  "route.locationKicker": "Ort",
  "route.locationTba": "Ort offen",
  "route.locationTbaShort": "Ort offen",
  "route.stops": "{n} Stopp|{n} Stopps",
  "route.halls": "{n} Halle|{n} Hallen",
  "route.queueShort": "Q{n}",
  "route.allDays": "Alle Tage",
  "route.allDaysTitle": "Jeder Stopp auf deiner Liste",
  "route.onlyDay": "Nur Stopps für {day}",
  "route.onlyUnassigned": "Nur Stopps ohne Tag",
  "route.absentNote": "Auf deiner Liste, aber nicht auf dem Messegelände: {names}.",
  "route.emptyNoSaved":
    "Noch nichts gemerkt — tipp auf + bei einem Stand oder Spiel im Aussteller-Tab, dann reihen sich deine Stopps hier Halle für Halle auf.",
  "route.emptyAllPlayed": "Jeder Stopp hier ist gespielt — stark.",
  "route.emptyAllAssigned":
    "Jeder Stopp auf deiner Liste hat einen Tag — wechsle zu Nach Tag, um den Plan durchzugehen.",
  "route.emptyForDay":
    "Für {day} ist noch nichts geplant. Ordne Stopps in der Ansicht Nach Tag zu.",
  "route.emptyStale":
    "Keine aktuellen Stopps passen zu deiner Liste — die Ausstellerdaten haben sich vermutlich geändert.",

  /* ---------- queue priority ---------- */
  "priority.count": "{n} Stand mit hoher Queue|{n} Stände mit hoher Queue",
  "priority.countFiltered": "{n} / {total} Stände mit hoher Queue",
  "priority.playedSuffix": " · {n} gespielt",
  "priority.emptyAllPlayed": "Alles auf deiner Liste in der Hoch-Queue-Gruppe ist gespielt — stark.",
  "priority.emptyNoneHigh":
    "Nichts von deiner Liste ist in der Hoch-Queue-Gruppe — gute Nachricht, da kommst du wohl ohne lange Wartezeit rein.",
  "priority.emptyNoSaved":
    "Noch nichts gemerkt — tipp auf + bei einem Stand oder Spiel im Aussteller-Tab.",
  "wristband.wholeBooth": "Kompletter Stand ist altersbeschränkt",

  /* ---------- event info ---------- */
  "event.theShow": "Die Messe",
  "event.tickets": "Tickets",
  "event.ticketsFallback": "Tickets siehe gamescom.global.",
  "event.areas": "Hallen & Bereiche",
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
    "Dieser Guide wird bis zur Messe alle paar Tage aktualisiert, sobald Aussteller Lineups und Standorte bekanntgeben. Was sich in welcher Revision geändert hat:",
  "updates.rev": "Rev. {n}",
  "updates.englishOnly": "Die Änderungsliste unten erscheint auf Englisch.",

  /* ---------- countdown & freshness ---------- */
  "countdown.days": "T−{n} Tag|T−{n} Tage",
  "countdown.live": "● Läuft gerade",
  "countdown.over": "Bis nächstes Jahr",
  "meta.freshness": "Daten aktualisiert {date} · Rev. {rev}.",

  /* ---------- sharing ---------- */
  "share.overline": "Dein Plan",
  "share.title": "Gemerkte Liste teilen",
  "share.closeAria": "Teilen-Dialog schließen",
  "share.withLegend": "Teilen mit",
  "share.modeFriend": "Jemand anderem",
  "share.modeDevice": "Einem anderen meiner Geräte",
  "share.includeLegend": "Was mitkommt",
  "share.partSaved": "Gemerkte Liste",
  "share.partDays": "Tagesplan",
  "share.partPlayed": "Gespielt-Marken",
  "share.linkLabel": "Link zum Teilen",
  "share.copyAction": "Link kopieren",
  "share.nativeAction": "Teilen…",
  "share.nativeTitle": "gamescom 2026 gemerkte Liste",
  "share.qrHint": "Scannen, um diese Liste auf einem anderen Gerät zu öffnen.",
  "share.qrAlt": "QR-Code",
  "share.qrTooLong": "Diese Liste ist zu lang für einen QR-Code — schick stattdessen den Link.",
  "share.qrFailed": "Der QR-Code konnte nicht geladen werden — schick stattdessen den Link.",
  "share.copied": "Link kopiert.",
  "share.copyManually": "Zum Kopieren ⌘C / Strg+C drücken.",
  "share.failed": "Teilen fehlgeschlagen — kopier stattdessen den Link.",

  "share.items": "{n} gemerkten Eintrag|{n} gemerkte Einträge",
  "share.readyWithStale": "{items} bereit zum Teilen.",
  "share.staleOlder":
    " {n} älterer Eintrag ist nicht mehr im Guide.| {n} ältere Einträge sind nicht mehr im Guide.",
  "share.stale": " {n} davon ist nicht mehr im Guide.| {n} davon sind nicht mehr im Guide.",
  "share.carried.days": "einen Tagesplan",
  "share.carried.played": "Gespielt-Marken",
  "share.carried.join": " und ",
  "share.carried.note": " Enthält außerdem {what}.",
  "share.outOfDate": "Diese geteilte Liste ist veraltet — es bleibt nichts zum Hinzufügen.",
  "share.loadedMoved": "{items} übernommen, die du mitgebracht hast.",
  "share.loadedShared": "{items} aus einem geteilten Link geladen.",
  "share.newToYou": " — {n} neu für dich",
  "share.replaceCost":
    " Beim Ersetzen fällt {n} Eintrag weg, den nur du hier hast.| Beim Ersetzen fallen {n} Einträge weg, die nur du hier hast.",
  "share.movedPlan": "Dein mitgebrachter Plan hat {items}{news}.",
  "share.replaceAction": "Meine Liste ersetzen",
  "share.replaced": "Deine Liste entspricht jetzt dem mitgebrachten Plan.",
  "share.alreadyHave": "Du hast schon alles aus diesem geteilten Link.",
  "share.linkHas": "Ein geteilter Link hat {items} — {n} neu für dich.",
  "share.addAction": "Zu meiner Liste hinzufügen",
  "share.added": "{items} aus dem geteilten Link hinzugefügt.",
  "toast.moveUndone": "Übernahme rückgängig gemacht.",
  "toast.importUndone": "Import der geteilten Liste rückgängig gemacht.",
  "moved.withList": "Der Guide ist auf gamescom.guide umgezogen. Deine Liste kommt mit.",
  "moved.plain": "Der Guide ist auf gamescom.guide umgezogen.",
  "moved.open": "Öffnen",

  /* ---------- sources & attribution ---------- */
  "sources.overline": "Woher das kommt",
  "sources.title": "Quellen",
  "sources.closeAria": "Quellen schließen",
  "sources.thisGuide": "diesem Guide",
  "sources.aria": "Quellen für {name} — {n} Link|Quellen für {name} — {n} Links",
  "sources.note.event":
    "Daten, Zeiten, Tickets und Hallenbereiche auf dieser Seite stammen aus {n} Quelle.|Daten, Zeiten, Tickets und Hallenbereiche auf dieser Seite stammen aus {n} Quellen.",
  "sources.note.card":
    "Standort, Lineup und Andrangprognose auf dieser Karte stammen aus {n} Quelle.|Standort, Lineup und Andrangprognose auf dieser Karte stammen aus {n} Quellen.",
  "sources.lastChecked": " Zuletzt geprüft {date}.",
  "sources.caveat":
    "Das hier ist ein inoffizieller Guide, und Standnummern und Lineups ändern sich bis zur Türöffnung. Wenn ein Detail über deinen Tag entscheidet, prüf es an der Quelle.",

  /* ---------- calendar export ---------- */
  "ics.summary": "gamescom — Plan für {day} ({n} Stopp)|gamescom — Plan für {day} ({n} Stopps)",
  "ics.exhibitor": "{name} — {where} (Queue {queue})",
  "ics.hallBooth": "Halle {hall}, Stand {booth}",
  "ics.queueUnknown": "unbekannt",
  "ics.gameAt": "{name} — bei {booths}",
  "ics.gameNoBooth": "{name} — kein Stand angegeben",

  /* ---------- confirmations & boot ---------- */
  "confirm.clearSaved":
    "{n} gemerkten Eintrag und seine Tagzuordnung wirklich löschen? Das lässt sich nicht rückgängig machen.|Alle {n} gemerkten Einträge und ihre Tagzuordnungen wirklich löschen? Das lässt sich nicht rückgängig machen.",
  "confirm.clearPlayed":
    "{n} Gespielt-Marke wirklich löschen? Das lässt sich nicht rückgängig machen.|Alle {n} Gespielt-Marken wirklich löschen? Das lässt sich nicht rückgängig machen.",
  "boot.loadFailed":
    "Daten konnten nicht geladen werden ({error}). Falls du die Datei direkt geöffnet hast, liefere sie stattdessen aus:",

  /* ---------- footer ---------- */
  "footer.unofficial": "Inoffizieller Fan-Guide.",
  "footer.notAffiliated":
    "Nicht verbunden mit der gamescom, der Koelnmesse oder dem game (Verband der deutschen Games-Branche).",
  "footer.storage":
    "Deine gemerkte Liste bleibt in diesem Browser — kein Konto, kein Server; nichts verlässt das Gerät, außer du teilst selbst einen Link.",
  "footer.createdBy":
    'Erstellt von <a class="subtle-link" href="https://inventivetalent.org">inventivetalent</a> mit Claude Code. <a class="subtle-link" href="https://github.com/InventivetalentDev/gc2026-guide">Open Source</a>.',
  /* The legal pages stay English, but the links wear the German names —
     "Impressum" is the word people look for, and § 5 DDG is about it
     being easy to find. */
  "footer.imprint": "Impressum",
  "footer.privacy": "Datenschutz",
  "footer.statusKey": "Spiel-Statuslegende",
  "legend.confirmed":
    '<span class="dot" data-status="confirmed"></span> <b>Bestätigt</b> — offiziell für die gamescom angekündigt',
  "legend.expected":
    '<span class="dot" data-status="expected"></span> <b>Erwartet</b> — stark naheliegend, nicht angekündigt',
  "legend.rumored":
    '<span class="dot" data-status="rumored"></span> <b>Gerücht</b> — unsere Vermutung, unbestätigt',
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
    "Hallenpläne der gamescom 2026 bis auf Standebene, mit deinen gemerkten Ständen markiert. Funktioniert offline.",
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
  "map.queueForecast": "Andrangprognose Q{n} {label}",
  "map.gamesCount": "{n} Spiel|{n} Spiele",
  "map.plusMore": ", +{n} weitere",
  "map.alsoHere": "ebenfalls hier",
  "map.notCovered": "nicht im Guide erfasst",
  "map.noExhibitor": "kein Aussteller für diesen Stand gemeldet",
  "map.saveBooth": "+ Stand merken",
  "map.unsaveBooth": "− Nicht mehr merken",
  "map.counts": "{n} Stände · {covered} im Guide",
  "map.countsSaved": " · {n} gemerkt",
  "map.chipSavedAria": ", {n} gemerkt",
  "map.outlines": "Standumrisse",
  "map.officialHallPlan": "offizieller Hallenplan",
  "map.checkedOn": "geprüft {date} · schematisch, inoffiziell",

  /* ---------- the trade badge & the business halls ----------

     "Fachbesucher" is the word the German trade press and gamescom itself
     use for a trade visitor, so the badge chips and the gate copy use it
     rather than a translation of "trade". */
  "toolbar.badge": "Badge",
  "toolbar.badgeAria": "Welches Badge du hast",
  "badge.consumer": "Privatbesucher",
  "badge.consumerTitle": "Privatbesucher-Ticket — die Entertainment-Hallen",
  "badge.trade": "Fach- & Medienbesucher",
  "badge.tradeTitle": "Fach- oder Medienbesucher-Badge — bringt die Business-Hallen 2 bis 4 dazu",
  "summary.tradePrefix": "Fachbesucher-Badge · {filters}",
  "summary.noneLower": "alle Kategorien, alle Hallen",

  "trade.sectionTitle": "Business-Aussteller",
  "trade.sectionLede":
    "Die Business-Hallen — Publishing, Entwicklungsdienstleistungen, Plattformen. Nur mit Fach- oder Medienbesucher-Badge",
  "trade.gateWhat":
    "Die Hallen 2–4 sind der <strong>Business-Bereich</strong> der gamescom: rund 800 Aussteller, die das Geschäft der Branche machen — Publisher, die sich Pitches anhören, Outsourcing- und Lokalisierungsstudios, Engines und Plattformen, Länderpavillons und Verbände. Er läuft Mittwoch bis Freitag und ist am Wochenende geschlossen.",
  "trade.gateBadge":
    "Ein <strong>Fach- oder Medienbesucher-Badge</strong> öffnet ihn. Ein Privatbesucher-Ticket nicht, deshalb ist er standardmäßig aus — schalte ihn ein und diese Stände werden merkbare, planbare Stopps wie alle anderen, mit eigener Liste unten und eigenen Karten im Raster oben.",
  "trade.enable": "Ich habe ein Fachbesucher-Badge — Business-Aussteller zeigen",
  "trade.hide": "Business-Aussteller ausblenden",
  "trade.turnOff": "Business-Aussteller ausschalten",
  "trade.showList": "Zur Liste →",
  "trade.toastOn":
    "Business-Aussteller an — die Stände stehen im Raster und in ihrer eigenen Liste darunter.",
  "trade.toastOff": "Business-Aussteller aus — zurück zu den Publikumshallen.",
  "trade.catFilterAria": "Business-Aussteller nach Produktgruppe filtern",
  "trade.loading": "Business-Hallen werden geladen…",
  "trade.loadError":
    "Die Business-Liste konnte nicht geladen werden ({error}). Sie muss einmal online geladen werden, bevor sie offline funktioniert.",
  "trade.dataPending":
    "Auf deiner Liste stehen Stände aus den Business-Hallen. Diese Daten müssen einmal online geladen werden, bevor sie planbar sind — danach sind sie zwischengespeichert.",
  "trade.listWhat":
    "Der Business-Bereich (Hallen 2–4), wo die Branche ihre Geschäfte macht. Ein Fach- oder Medienbesucher-Badge öffnet diese Hallen; ein Privatbesucher-Ticket nicht, und nach Freitag sind sie zu.",
  "trade.listWalkUp":
    "Fast alles davon ist ohne Termin zugänglich: An jedem Länder- und Regionalpavillon teilen sich ein Dutzend oder mehr Firmen den Stand, und die kleinen Stände in den Hallen 2.1 und 2.2 sind Theken, an denen du einfach ansprechen kannst. Nur etwa zwanzig Stände — die großen Einzelbauten in Halle 4.2 — sind geschlossene Räume, für die du einen Termin brauchst. Die Angabe „geteilt“ markiert die Gemeinschaftsstände; was ein Stand tatsächlich anbietet, steht auf den Karten oben.",
  "trade.listPlannable": "Merk dir einen Stand und er lässt sich planen wie jeder andere Stopp.",
  "trade.listNoMatches": "Hier passt nichts zur aktuellen Suche, Halle oder Kategorie.",
  "trade.exhibitorCount": "{n} Aussteller|{n} Aussteller",
  "trade.offers": "Angebot",
  "trade.offerCount": "{n} Punkt|{n} Punkte",
  "trade.accessLabel": "Zugang",
  "trade.access.open.label": "Ohne Termin",
  "trade.access.open.note":
    "Ein offener Stand — während der Geschäftszeiten besetzt, kein Termin nötig.",
  "trade.access.appointment.label": "Nur mit Termin",
  "trade.access.appointment.note":
    "Ein geschlossener Besprechungsbau. Der Zutritt erfolgt nur mit vereinbartem Termin; vom Gang aus gibt es nichts zu sehen.",
  "trade.access.mixed.label": "Ohne Termin + Meetings",
  "trade.access.mixed.note":
    "Eine offene Theke mit geschlossenen Besprechungsräumen dahinter — du kannst hingehen und fragen, die Räume sind aber vorab gebucht.",

  "hall.businessAria": "Halle {hall}, Business-Bereich, nur Fach- und Medienbesucher",
  "card.faceToTrade": "Business-Stand zeigen — Halle {hall}, nur Fach- und Medienbesucher",
  "card.faceToPublic": "Zurück zum Publikumsstand — Halle {hall}",
  "plan.tradeBadge": "Fachbesucher-Badge",
  "plan.dayClosedSuffix": "{action} — der Business-Bereich ist am {day} geschlossen",
  "plan.closedWarn":
    "Business-Bereich am {day} geschlossen — dieser Stopp liegt an dem Tag hinter einer Badge-Schranke.",
  "plan.closedGroupWarn":
    "{n} Stopp liegt im Business-Bereich, der am {day} geschlossen ist.|{n} Stopps liegen im Business-Bereich, der am {day} geschlossen ist.",
  "ics.tradeExhibitor": "{name} — {where} (Fach- und Medienbesucher-Badge{shut})",
  "ics.businessClosed": "; Business-Bereich an diesem Tag GESCHLOSSEN",

  "event.yourBadge": "Dein Badge",
  "event.badgeWhat":
    "Die Hallen 2–4 sind der <strong>Business-Bereich</strong>: rund 800 Aussteller, die das Geschäft der Branche machen, geöffnet Mittwoch bis Freitag und am Wochenende geschlossen. Ein <strong>Fach- oder Medienbesucher-Badge</strong> öffnet sie; ein Privatbesucher-Ticket nicht.",
  "event.badgeOnNote":
    "Business-Stände werden angezeigt — im Ausstellerraster, im Hallenfilter, auf der Karte und als eigene Liste auf der Ausstellerseite.",
  "event.badgeOffNote":
    "Der Guide zeigt nur die Publikumshallen. Das ist eine Anzeigeeinstellung; sie ändert nichts daran, was dein Ticket tatsächlich öffnet.",

  /* ---------- map areas ---------- */
  "map.area.entertainment.label": "Entertainment",
  "map.area.business.label": "Business",
  "map.area.business.access":
    "nur mit Fach- oder Medienbesucher-Badge. Ein Privatbesucher-Ticket öffnet diese Hallen nicht, und nach Freitag sind sie zu.",
  "map.areaSuffix": "{label}-Bereich",
  "map.coveredNone": "keiner",
  "map.tradeVisitorsOnly": ", nur Fachbesucher",
  "map.tradeOnlySuffix": ", nur Fach- und Medienbesucher",
  "map.showExhibitors": "Ich habe ein Badge — Aussteller zeigen",
  "map.hideExhibitors": "Aussteller ausblenden",
  "map.showTrade": "Business-Aussteller zeigen",
  "map.gatedHint":
    "Business-Bereich — die meisten davon stehen im Guide, wenn Business-Aussteller an sind",
  "map.officialProfile": "offizielles Profil ↗",

  "footer.feedback":
    'Etwas falsch, fehlend oder veraltet? Schick Korrekturen an <a class="subtle-link" href="mailto:content@gamescom.guide?subject=gamescom%20guide%20feedback">content@gamescom.guide</a>.',

  /* ---------- accessibility ---------- */
  "a11y.newTab": ", öffnet in einem neuen Tab",
};
