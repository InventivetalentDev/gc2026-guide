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
