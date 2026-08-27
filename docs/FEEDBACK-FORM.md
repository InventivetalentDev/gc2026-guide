# Visitor feedback form

The guide asks one question at the end of the show: was this worth doing, and
should it come back for 2027. This file holds the questions, the German wording
beside the English, and how the app reaches whatever form you build from them.

## Why the form is hosted elsewhere

The obvious answer — collect feedback through `/api/`, the same Worker the queue
reports go to — is the wrong one, for a reason worth writing down so nobody
re-proposes it next August.

That API's D1 database is deleted after the show. `docs/DEPLOYING.md` ("After
the show") removes the bindings and drops both databases once the last deferred
queue outcome has landed, because the privacy promise is deletion, and the
Worker then answers 410 to everything. Feedback arrives on exactly the other
schedule: a little on the last day, most of it in the week after, some of it
whenever someone finds the link. A feedback table living in `gc2026-queues`
would be torn down in the middle of its own collection window.

The rest follows from that. Free text is also the one thing the guide has never
stored — the 24-hour sweep, the anonymous hourly aggregates and the privacy page
are all written around facts about queues, not sentences about the guide — and
keeping paragraphs of visitor prose would mean a different retention promise, a
moderation surface and a rewrite of both languages of `privacy.html`. For five
questions asked once, a hosted form is the proportionate answer.

So: the form is hosted, and the app carries the link. Nothing is sent anywhere
until a visitor taps it.

## Why Tally, and not Google Forms

The guide already refuses Google twice over — no Analytics, and the fonts are
served from this domain precisely so that reading the guide does not hand every
visitor's IP to Google (see `README.md` under Design, and the "What this site
does not do" list in `privacy.html`). Ending the show by sending everyone who
liked it to a Google form would undo that on the last page they see.

[Tally](https://tally.so) is the default here instead: a Belgian company, form
data on EU servers, and every question below expressible as written — it has a
linear-scale block with labelled anchors, and checkboxes that enforce a maximum
number of choices, which is the one thing Google Forms needs a validation rule
for. Tally BV is a processor, so it wants the usual: a DPA, and its name in the
privacy page. Both are done — `privacy.html` names it in English and German.

If you want the stronger version of this, [CryptPad
Forms](https://cryptpad.org/apps/form/) is end-to-end encrypted: the host cannot
read the answers at all, which is a claim no processor agreement can match, and
it shortens the privacy section rather than lengthening it. It costs two things,
both small but real — there is no scale question type, so Q1 becomes a five-way
choice, and no maximum-choices setting, so Q3's cap is an instruction rather than
a rule — plus a heavier page load for whoever is answering. **Build it under a
free registered account if you go this way:** a CryptPad document that lives in
no drive is destroyed after 90 days of inactivity, which is a bad thing to
discover about a form you left collecting answers.

## Wiring the link into the app

`data/event.json` carries a `feedback` block:

```json
"feedback": {
  "url": "",
  "urlDe": "",
  "from": "2026-08-29"
}
```

| Field | |
|---|---|
| `url` | The form. **An empty string turns every feedback surface off** — the card, the footer link, the lot. That is the shipped state, so nothing points at a form that does not exist yet. |
| `urlDe` | Optional. A separate German form; falls back to `url` when absent, which is right if you build one bilingual form. |
| `from` | ISO date, in Cologne's timezone. The prompt card stays hidden before it. Absent means "as soon as the URL is set". There is no end date: after the show is when the answers come in. |

It is data, not code. Paste the URL, push, and it is live on the next data
fetch — the guide serves `data/` network-first, so an installed PWA picks it up
without a deploy of anything.

Two surfaces come with it:

- **A dismissible card** at the top of every tab, from `from` onwards. Two
  buttons: the form, and "Not now", which is remembered under
  `gc2026.feedback.v1` and never asks again on that device. Opening the form
  counts as answering, for the same reason.
- **A footer link**, always there once the URL is set, with no memory. That is
  the one someone comes back to a week later.

Corrections keep their own line in the footer and their own mail address —
"hall 9.1 is wrong" wants a reply and a data push, not a survey row.

### Tagging where a response came from

Type `/hidden` in the Tally editor to add a **hidden field** — call it `source`
— and it is filled from a query parameter on the link. Paste
`https://tally.so/r/XXXXXX?source=app` into `data/event.json` as `url`, and post
`?source=reddit` on Reddit. Responses then arrive knowing which door they came
through, and "the card works, the Reddit post doesn't" becomes a fact rather
than a guess.

That is the whole of the tracking, and it is worth being clear about what it is
not: the value is a constant you wrote into a link, identical for every visitor.
No script runs, nothing about the device travels with it, and the guide never
learns that anyone opened the form.

## The questions

Five, in the order below, plus two additions marked as such. About ninety
seconds on a phone. Every question is optional except the first two: a form
that refuses to submit is a form abandoned in a hall with two bars of signal.

The German is the wording to paste, not a gloss — it uses *du*, like the rest of
the guide.

---

### Intro

> **EN** — Thanks for using the unofficial gamescom 2026 guide. Five questions,
> about a minute. Anonymous — no account, no email needed, and nothing here is
> passed on to anyone.

> **DE** — Danke, dass du den inoffiziellen gamescom-2026-Guide benutzt hast.
> Fünf Fragen, ungefähr eine Minute. Anonym — kein Konto, keine E-Mail-Adresse
> nötig, und nichts davon wird weitergegeben.

---

### Q0 · How you used it *(addition — drop it if you want the short version)*

Single choice, optional.

Everything below reads differently depending on this answer, and it costs one
tap. "Not useful" from someone who planned in June and never opened it in the
hall is a different report from "not useful" from someone standing in Hall 9.

> **EN** — How did you use the guide?
> - Planning before the show
> - On my phone at the show
> - Both
> - I looked at it but didn't really use it
> - I didn't go to gamescom

> **DE** — Wie hast du den Guide benutzt?
> - Zur Planung vor der Messe
> - Auf dem Handy vor Ort
> - Beides
> - Angesehen, aber nicht wirklich benutzt
> - Ich war nicht auf der gamescom

---

### Q1 · Was it useful

Linear scale 1–5, **required**.

> **EN** — How useful was the guide to you?
> `1 = Not useful` … `5 = Very useful`

> **DE** — Wie nützlich war der Guide für dich?
> `1 = Gar nicht nützlich` … `5 = Sehr nützlich`

Follow-up, short answer, optional:

> **EN** — What made it useful — or what didn't?
> **DE** — Was war daran nützlich — oder was nicht?

---

### Q2 · Again in 2027

Single choice, **required**.

> **EN** — Would you want this guide back for gamescom 2027?
> - Yes, definitely
> - Yes, if it covers what I need
> - Maybe — no strong feeling
> - No

> **DE** — Möchtest du den Guide für die gamescom 2027 wieder haben?
> - Ja, auf jeden Fall
> - Ja, wenn er abdeckt, was ich brauche
> - Vielleicht — mir egal
> - Nein

Follow-up, paragraph, optional. This is the single most useful field in the
form: it is where "I wanted X and there was no X" gets written down.

> **EN** — What would make it better next year?
> **DE** — Was würde ihn nächstes Jahr besser machen?

---

### Q3 · What you liked most

Checkboxes, **pick up to 3** (Tally: block settings → maximum number of
choices). Optional.

The cap is the point. Without it people tick nine boxes and the answer is
"everything", which decides nothing about what to build first.

> **EN** — Which parts did you get the most out of? (up to 3)
> - Exhibitor list — who's there, what they're showing, booth numbers
> - Search and filters — hall, playable demos, ONL, 18+
> - Saved list, and sharing it to another device or a friend
> - Your plan — stops by day or by hall, in walking order
> - The hall map — booths drawn, your stops pinned
> - Live queue times
> - Today — the day's route while you're standing in it
> - Crowd forecasts and visit advice
> - Event info — hours, tickets, entrances
> - Works offline / installed to the home screen
> - Trade-badge exhibitors and the business halls
> - The full directory — all 1,785 exhibitors, including uncarded ones
> - Something else (say below)

> **DE** — Was hat dir am meisten gebracht? (bis zu 3)
> - Ausstellerliste — wer da ist, was gezeigt wird, Standnummern
> - Suche und Filter — Halle, spielbare Demos, ONL, 18+
> - Merkliste, und sie auf ein anderes Gerät oder zu Freunden schicken
> - Dein Plan — Stopps nach Tag oder nach Halle, in Laufreihenfolge
> - Der Hallenplan — Stände eingezeichnet, deine Stopps markiert
> - Live-Wartezeiten
> - Heute — die Route des Tages, während du drinsteckst
> - Andrangsprognosen und Besuchstipps
> - Messe-Infos — Öffnungszeiten, Tickets, Eingänge
> - Funktioniert offline / auf dem Homescreen installiert
> - Fachbesucher-Aussteller und die Businesshallen
> - Das vollständige Verzeichnis — alle 1.785 Aussteller
> - Etwas anderes (unten sagen)

Short answer, optional:

> **EN** — Anything else you used a lot?
> **DE** — Noch etwas, das du viel benutzt hast?

---

### Q4 · Problems

Checkboxes, optional. Put "It worked fine" first — no builder here makes an
option exclusive, and first is where people stop reading when the answer is no.

> **EN** — Did anything go wrong?
> - No, it worked fine
> - A booth number or hall was wrong or out of date
> - An exhibitor or game was missing
> - Queue times were wrong, missing, or never appeared
> - The map was hard to read or hard to use
> - Slow, froze, or crashed
> - It didn't work offline when I needed it to
> - Hard to find my way around it
> - Something in the German was wrong or missing
> - Installing it / adding it to the home screen didn't work
> - Something else (say below)

> **DE** — Ist etwas schiefgegangen?
> - Nein, hat funktioniert
> - Eine Standnummer oder Halle war falsch oder veraltet
> - Ein Aussteller oder Spiel hat gefehlt
> - Wartezeiten waren falsch, fehlten oder kamen nie
> - Der Hallenplan war schwer zu lesen oder zu bedienen
> - Langsam, hängen geblieben oder abgestürzt
> - Hat offline nicht funktioniert, als ich es gebraucht habe
> - Ich habe mich darin nicht zurechtgefunden
> - Etwas auf Deutsch war falsch oder hat gefehlt
> - Installieren / zum Homescreen hinzufügen hat nicht geklappt
> - Etwas anderes (unten sagen)

Paragraph, optional:

> **EN** — If you can, what happened and where? (which booth, which hall, what
> you were doing)
> **DE** — Wenn du magst: Was ist passiert und wo? (welcher Stand, welche Halle,
> was du gerade gemacht hast)

---

### Q5 · How you found it

Single choice, optional. The list is the channels the guide was actually posted
to, plus the ways it travels on its own — a shared link, a QR code held up in a
queue. Keep it honest to where you posted; an option nobody can have used makes
the whole question look invented.

> **EN** — How did you come across the guide?
> - Reddit
> - Twitter / X
> - A link someone sent me
> - Someone showed me at the show, or held up the QR code
> - Discord
> - Google or another search engine
> - Bluesky or Mastodon
> - TikTok, Instagram or YouTube
> - Somewhere else (say below)

> **DE** — Wie bist du auf den Guide gestoßen?
> - Reddit
> - Twitter / X
> - Jemand hat mir den Link geschickt
> - Jemand hat ihn mir vor Ort gezeigt oder den QR-Code hochgehalten
> - Discord
> - Google oder eine andere Suchmaschine
> - Bluesky oder Mastodon
> - TikTok, Instagram oder YouTube
> - Woanders (unten sagen)

---

### Q6 · Anything else *(addition)*

Paragraph, optional.

> **EN** — Anything else you want to say?
> **DE** — Möchtest du sonst noch etwas loswerden?

**Do not add an email field** unless you want the responses to stop being
anonymous. The moment one is there, the sheet holds personal data: it needs a
lawful basis, a line in `privacy.html`, and deletion when you are done with it.
The footer already carries a mail address for anyone who wants a reply, and they
will use it.

## Building it in Tally

### The quick way: import the JSON

`docs/feedback-form.en.json` and `docs/feedback-form.de.json` hold the questions
below in the shape Tally's importer reads. **+ New form → Import from → JSON**,
one file per form, and you get a draft with the blocks already laid out. Two
files rather than one bilingual form, because the app has two slots for them:
the English one goes in `url`, the German one in `urlDe`.

The import is AI-driven rather than schema-driven — Tally reads the file and
drafts a form from it — so it is a starting point, not a guarantee. Three things
to check on the draft before publishing, because they are the ones an importer
gets wrong:

- **Q1 is a linear scale**, 1–5, with both anchors labelled — not a multiple
  choice with five options in it.
- **Q3 caps at 3.** The cap lives in block settings → maximum number of choices,
  and it is the difference between an answer and a shrug.
- **The `source` hidden field is hidden.** If it came in as a visible question,
  delete it and re-add it with `/hidden`.

Then set what no file can carry: no respondent email collection, no
per-respondent limit (those need an account and turn away more answers than they
protect), and the after-submission message — *Thanks. That's genuinely useful.* /
*Danke. Das hilft wirklich.*

Publish, take the `tally.so/r/…` link, append `?source=app`, and paste it into
`data/event.json`. Then answer it yourself on a phone before you ship the link: a
form nobody has walked through on the device it will be answered on always has
exactly one broken question.

### The manual way

Blocks are inserted by typing `/` and the block name, so the list below reads
the way the editor does.

1. New form, titled **gamescom 2026 guide — feedback**. Open with a `/text`
   block carrying the intro above. If you build one bilingual form, pair each
   question's two wordings the way this file does rather than making the reader
   pick a language first.
2. Add the questions in order:

   | | Block | Settings |
   |---|---|---|
   | Q0 | `/multiple choice` | — |
   | Q1 | `/linear scale` | 1–5, both anchors labelled. Required |
   | Q2 | `/multiple choice` | Required |
   | Q3 | `/checkboxes` | **maximum 3 choices** |
   | Q4 | `/checkboxes` | — |
   | Q5 | `/multiple choice` | — |
   | follow-ups | `/short answer`, `/long answer` | — |
   | source tag | `/hidden` | named `source`, see above |

3. Settings → **Privacy**: leave respondent email collection off, and do not
   turn on any per-respondent limit — those need an account and turn away more
   answers than they protect.
4. Settings → **After submission**: *Thanks. That's genuinely useful.* /
   *Danke. Das hilft wirklich.*
5. Publish and wire the link up as above.

The app only ever wants a URL, so none of this is load-bearing: CryptPad Forms,
LimeSurvey, Formbricks or a form you host yourself all work the same way. Prefer
an EU-hosted one and the privacy note below stays short.

## Before you paste the URL in

- `privacy.html` names **Tally BV** in both languages as the processor, with its
  address, EU hosting and the fact that nothing reaches it until someone taps
  the link. Pick a different host and that is the paragraph to correct — in
  both languages, and the transfers-outside-the-EU note with it.
- Accept Tally's DPA on the account that owns the form. You are the controller
  for whatever people write in it; they are the processor.
- Add a `data/changelog.json` entry and bump `revision` in `data/meta.json`, so
  the Updates tab mentions it. Nothing announces it before then — that is
  deliberate, so the feature can ship dark and go live with a data push.
