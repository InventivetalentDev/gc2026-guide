/* gamescom 2026 guide — install & offline plumbing.

   Kept out of app.js: nothing here touches the guide's content, and the app
   renders identically if service workers are unavailable or blocked. */

(function () {
  const $ = (sel) => document.querySelector(sel);
  const t = window.GCI18N?.t || ((key) => key);

  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches ||
    window.navigator.standalone === true;

  if (standalone) document.documentElement.dataset.standalone = "true";

  /* An installed copy is a choice of address, and the redirect in the head of
     index.html and map.html has to be able to see it. That block moves a
     draining hostname to hallgui.de only when nothing at all is stored on it,
     and "installed, but nothing saved yet" otherwise looks exactly like a
     first visit — the move notice writes its answer only when somebody
     answers it, so an ignored toast leaves no trace either.

     A standalone launch is that fact, written where it can be read
     synchronously on every later load, including from a plain browser tab on
     the same origin — which is the visit the redirect actually has to judge,
     since the app itself is stopped by the display-mode check.

     navigator.getInstalledRelatedApps() would name it more directly and is
     deliberately not used: it is Chromium-only, it answers a promise so it
     cannot gate something that has to happen before the first paint, and it
     reads the manifest link that map.html deliberately does not have.

     iOS is the gap and there is no closing it. A home-screen web app there
     keeps its own storage container, so nothing written in the app is visible
     to Safari on the same origin, and no API offers the install either; a tab
     there is judged on its own storage, which is all anything knows. */
  const INSTALLED_KEY = "gc2026.installed.v1";

  function rememberInstalled() {
    try {
      localStorage.setItem(INSTALLED_KEY, "1");
    } catch {
      /* storage blocked (Safari private mode) — then this origin is holding
         nothing to strand, which is the case the redirect is safe in anyway */
    }
  }

  if (standalone) rememberInstalled();

  /* ---------- service worker ---------- */

  /* Reload only when the user asked for the update. A first visit also fires
     controllerchange — the fresh worker calls clients.claim() — and reloading
     on that would flash the page for no reason. */
  let updateAccepted = false;

  function offerUpdate(worker) {
    window.gcToast?.show(t("pwa.updateReady"), t("pwa.reload"), () => {
      window.gcToast?.hide();
      updateAccepted = true;
      worker.postMessage("skip-waiting");
    });
  }

  function watchForUpdate(reg) {
    const incoming = reg.installing;
    if (!incoming) return;
    incoming.addEventListener("statechange", () => {
      if (incoming.state === "installed" && navigator.serviceWorker.controller) offerUpdate(incoming);
    });
  }

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("sw.js", { scope: "./" })
        .then((reg) => {
          if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
          reg.addEventListener("updatefound", () => watchForUpdate(reg));

          /* The guide's data is refreshed every few days, and an installed
             copy can otherwise sit on the same worker for weeks. Re-check
             when the window comes back to the foreground, at most hourly. */
          let lastCheck = Date.now();
          document.addEventListener("visibilitychange", () => {
            if (document.visibilityState !== "visible") return;
            if (Date.now() - lastCheck < 3600000) return;
            lastCheck = Date.now();
            reg.update().catch(() => {});
          });
        })
        .catch(() => {
          /* Registration fails on private-mode Firefox and behind some
             enterprise policies. The guide works fine without it. */
        });

      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (!updateAccepted) return;
        updateAccepted = false;
        location.reload();
      });
    });
  }

  /* ---------- install ---------- */

  const installBtn = $("#install-app");
  let deferredPrompt = null;

  /* Safari has no beforeinstallprompt and no programmatic install, so iOS
     gets the same button pointing at the Share-sheet route instead. */
  const iOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const iOSSafari = iOS && !/crios|fxios|edgios|opios/i.test(navigator.userAgent);

  function showInstallButton(label) {
    if (!installBtn || standalone) return;
    installBtn.textContent = label;
    installBtn.hidden = false;
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showInstallButton(t("pwa.install"));
  });

  if (installBtn) {
    installBtn.addEventListener("click", async () => {
      if (deferredPrompt) {
        installBtn.hidden = true;
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        deferredPrompt = null;
        if (outcome !== "accepted") showInstallButton(t("pwa.install"));
        return;
      }
      window.gcToast?.show(t("pwa.iosHint"));
    });
  }

  window.addEventListener("appinstalled", () => {
    /* The installing tab hears this first, and it is a browser tab: recording
       it here is what stops the redirect above pulling this origin out from
       under an install made seconds ago. */
    rememberInstalled();
    deferredPrompt = null;
    if (installBtn) installBtn.hidden = true;
    const notice = window.gcToast?.show(t("pwa.installed"));
    if (notice) setTimeout(() => window.gcToast?.hide(notice), 6000);
  });

  if (iOSSafari) showInstallButton(t("pwa.addToHome"));

  /* ---------- connectivity ---------- */

  function syncOnline() {
    document.documentElement.dataset.offline = String(!navigator.onLine);
  }
  window.addEventListener("online", syncOnline);
  window.addEventListener("offline", syncOnline);
  syncOnline();
})();
