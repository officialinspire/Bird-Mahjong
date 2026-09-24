// Install + offline support: registers sw.js, offers new versions safely, and
// shows an Install button where the browser supports the install prompt.
//
// Update flow (see sw.js for the worker side):
//   * check for a new worker on load and whenever the page returns to the
//     foreground (updateViaCache: "none" so sw.js itself is never stale)
//   * when a new worker is installed and waiting, show a small banner
//   * "Refresh": autosave, tell the worker to take over, reload once it has
//   * "Later": hide the banner; the update applies on the next cold start

export function setupPwa({ banner, refreshButton, laterButton, installButton, beforeReload = () => {} }) {
  // Service workers need a secure context (https, or localhost for testing).
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return { supported: false };

  let refreshing = false;
  let userAskedToRefresh = false;

  function showUpdate(worker) {
    banner.hidden = false;
    refreshButton.onclick = () => {
      userAskedToRefresh = true;
      beforeReload(); // autosave the board so nothing is lost
      worker.postMessage({ type: "SKIP_WAITING" });
    };
    laterButton.onclick = () => { banner.hidden = true; };
  }

  // Reload exactly once, and only when the player asked for the new version.
  // (On the very first install the worker claims the page; that must not reload.)
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!userAskedToRefresh || refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  const ready = navigator.serviceWorker
    .register("./sw.js", { scope: "./", updateViaCache: "none" })
    .then((registration) => {
      const watch = (worker) => {
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          // "installed" with an existing controller = an update is waiting.
          if (worker.state === "installed" && navigator.serviceWorker.controller) showUpdate(worker);
        });
      };
      if (registration.waiting && navigator.serviceWorker.controller) showUpdate(registration.waiting);
      watch(registration.installing);
      registration.addEventListener("updatefound", () => watch(registration.installing));
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) registration.update().catch(() => {});
      });
      return registration;
    })
    .catch((error) => {
      // Offline play just won't be available; the game itself is unaffected.
      console.warn("Service worker registration failed:", error);
      return null;
    });

  // Install button (Chrome, Edge, Android). iOS has no prompt: see README.
  let deferred = null;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event;
    installButton.hidden = false;
  });
  installButton.addEventListener("click", async () => {
    if (!deferred) return;
    installButton.hidden = true;
    deferred.prompt();
    await deferred.userChoice.catch(() => {});
    deferred = null;
  });
  window.addEventListener("appinstalled", () => {
    installButton.hidden = true;
    deferred = null;
  });

  return { supported: true, ready };
}
