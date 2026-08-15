/* gamescom 2026 guide — i18n runtime.

   The guide ships two languages (en, de) picked at load time and applied
   everywhere: static markup via data-i18n attributes, JS-composed strings
   via t(), and the editorial prose via data/i18n/<lang>.json (merged in
   app.js). English is the authored source — it lives in the markup and in
   js/i18n/en.js — and the fallback for any key a locale is missing.

   Both registries load unconditionally (~10 KB gzipped together): en is
   needed in every locale as the fallback chain, so the only avoidable
   load would be de.js for English users — not worth conditional script
   injection in the pre-paint boot path. The per-locale split that keeps
   unused bytes off the wire is the data prose, which is 5× the size.

   Loaded before app.js/map.js as a plain script (no modules, no build —
   see README architecture notes). The inline <head> script in index.html
   and map.html stamps <html lang> before first paint; this file trusts
   that stamp so the pre-paint frame and the applied strings can never
   disagree. */

(function () {
  const SUPPORTED = ["en", "de"];
  const PREFS_KEY = "gc2026.prefs.v1";

  /* Labels for the switcher, each deliberately fixed in its own language:
     "Deutsch" is the one spelling every German speaker recognises on an
     English page, and vice versa. */
  const NAMES = { en: "English", de: "Deutsch" };
  const SWITCH_LABELS = { en: "Switch to English", de: "Auf Deutsch wechseln" };

  function prefLang() {
    try {
      const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
      return SUPPORTED.includes(raw.lang) ? raw.lang : null;
    } catch {
      /* corrupt entry, or storage blocked entirely (Safari private mode) */
      return null;
    }
  }

  /* ?lang wins for this load only and is never persisted — a German link
     shared to an English-preferring friend must not flip them for good.
     The explicit pref wins over the browser's list because it only exists
     when the switcher was used on purpose. */
  function resolveLang() {
    const q = new URLSearchParams(location.search).get("lang");
    if (SUPPORTED.includes(q)) return q;
    const pref = prefLang();
    if (pref) return pref;
    const wanted = (navigator.languages || [navigator.language || "en"])
      .map((code) => String(code).slice(0, 2).toLowerCase())
      .find((code) => SUPPORTED.includes(code));
    return wanted || "en";
  }

  /* The inline head script already stamped the language before first paint;
     re-resolving here could only ever disagree with what was painted. The
     fallback covers pages without the inline script. */
  const stamped = document.documentElement.lang;
  const lang = SUPPORTED.includes(stamped) ? stamped : resolveLang();
  document.documentElement.lang = lang;

  const strings = window.GC_STRINGS || {};

  /* Active language → English → the key itself. A missing key rendering as
     "toast.moveUndone" is ugly but visible and debuggable; a blank is
     neither. Plurals are a single "one|other" split — en and de both have
     exactly two forms, so CLDR machinery would buy nothing. */
  function t(key, params) {
    let s = (strings[lang] || {})[key] ?? (strings.en || {})[key] ?? key;
    if (typeof s !== "string") return key;
    if (params && "n" in params && s.includes("|")) {
      const [one, other] = s.split("|");
      s = params.n === 1 ? one : other;
    }
    return params
      ? s.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match))
      : s;
  }

  /* Weekday names come from the date, not from the data — deleting the
     hand-written labels removed a whole class of strings from both
     locales. Noon UTC so no timezone can shift the day. */
  function dayName(date, style = "long") {
    try {
      return new Intl.DateTimeFormat(lang, { weekday: style, timeZone: "UTC" }).format(
        new Date(`${date}T12:00:00Z`)
      );
    } catch {
      return String(date);
    }
  }

  /* Dates in the data files stay as sortable ISO values. Format them only at
     the display edge so German readers see "15. Aug. 2026" while English
     keeps its familiar month-first form. UTC preserves the authored day in
     every timezone. */
  function formatDate(date) {
    const raw = String(date || "");
    const when = new Date(`${raw}T12:00:00Z`);
    if (Number.isNaN(when.getTime())) return raw;
    try {
      return new Intl.DateTimeFormat(lang, {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(when);
    } catch {
      return raw;
    }
  }

  /* Translate the static markup in place. English is the authored markup,
     so for en this is a no-op and English users pay nothing. data-i18n-html
     is reserved for the handful of nodes with our own inline <b>/<a> —
     its strings are written by us and never carry data. */
  function apply(root) {
    /* Notes that only make sense in one language — "the changelog below is
       English" is nothing an English reader needs told. Runs for every
       locale, so it is above the en fast path. */
    root.querySelectorAll("[data-i18n-only]").forEach((el) => {
      el.hidden = el.dataset.i18nOnly !== lang;
    });
    if (lang === "en") return;
    root.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.dataset.i18n);
    });
    root.querySelectorAll("[data-i18n-html]").forEach((el) => {
      el.innerHTML = t(el.dataset.i18nHtml);
    });
    root.querySelectorAll("[data-i18n-attr]").forEach((el) => {
      el.dataset.i18nAttr.split(",").forEach((pair) => {
        const i = pair.indexOf(":");
        if (i === -1) return;
        el.setAttribute(pair.slice(0, i).trim(), t(pair.slice(i + 1).trim()));
      });
    });
  }

  /* Switching reloads: the guide has ~120 innerHTML render sites plus the
     locale data overlay to re-fetch, and this control is used about once
     per visitor. The pref is written first so the reload resolves to it;
     if storage is blocked the choice rides the URL instead, scoped to the
     session — the same graceful degradation the other prefs use. */
  function setLang(next) {
    if (!SUPPORTED.includes(next) || next === lang) return;
    let persisted = true;
    try {
      const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
      raw.lang = next;
      localStorage.setItem(PREFS_KEY, JSON.stringify(raw));
    } catch {
      persisted = false;
    }
    /* The address bar carries the choice only when storage refused it;
       otherwise the pref is the record and ?lang is cleaned away. */
    const url = new URL(location.href);
    if (persisted) url.searchParams.delete("lang");
    else url.searchParams.set("lang", next);
    if (url.href !== location.href) history.replaceState(null, "", url.href);

    /* reload(), not replace(): every view here writes a hash — syncHash(),
       the brand link, the map's #hall/stand — and navigating to a URL that
       differs only in its fragment, or not at all, is a same-document
       navigation the browser answers without re-running anything. That
       persisted the pref and changed nothing on screen until the next real
       load, so the button looked dead. reload() ignores the fragment and
       keeps it, which is what lands you back on the view you were reading. */
    location.reload();
  }

  /* Every element carrying data-lang-switch becomes the toggle, labelled
     with the other language's own name. Built from SUPPORTED so a third
     language later means a small cycle, not a redesign. */
  function wireSwitchers(root) {
    const next = SUPPORTED[(SUPPORTED.indexOf(lang) + 1) % SUPPORTED.length];
    root.querySelectorAll("[data-lang-switch]").forEach((btn) => {
      btn.textContent = NAMES[next] || next;
      btn.setAttribute("lang", next);
      /* The accessible name is in the target language — it addresses the
         person who wants to switch to it. */
      btn.setAttribute("aria-label", SWITCH_LABELS[next] || `Switch to ${next}`);
      btn.setAttribute("title", SWITCH_LABELS[next] || "");
      btn.hidden = false;
      btn.addEventListener("click", () => setLang(next));
    });
  }

  window.GCI18N = { lang, t, apply, setLang, dayName, formatDate };

  /* This script loads at the end of <body>, after the static markup and
     before app.js/map.js — translate and wire now, before first paint. */
  apply(document);
  wireSwitchers(document);
})();
