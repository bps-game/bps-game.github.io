// Recharge automatiquement la page quand une nouvelle version a été
// déployée (ex : ce que tu viens de vivre — editor.html mis à jour mais
// editor.js resté en cache, décalage qui casse le bouton "Nouvelle
// question"). Compare l'ETag/Last-Modified renvoyé par le serveur à celui
// vu au chargement : s'il a changé, quelqu'un a poussé une mise à jour entre
// temps, on recharge tout seul — pas la peine d'aller faire Ctrl+Maj+R à la
// main. Uniquement sur editor.html : jamais sur le jeu (index.html), où
// recharger couperait une partie en cours pour tout le monde.
(function () {
  const CHECK_INTERVAL_MS = 60000;
  let baselineTag = null;

  function responseTag(res) {
    return res.headers.get("etag") || res.headers.get("last-modified") || null;
  }

  function modalIsOpen() {
    const overlay = document.getElementById("modal-overlay");
    return !!overlay && getComputedStyle(overlay).display !== "none";
  }

  async function checkForUpdate() {
    try {
      const res = await fetch(location.pathname, { method: "HEAD", cache: "no-store" });
      if (!res.ok) return;
      const tag = responseTag(res);
      if (!tag) return; // serveur sans ETag/Last-Modified : rien à comparer, tant pis

      if (baselineTag === null) {
        baselineTag = tag;
        return;
      }
      if (tag === baselineTag) return;

      // Ne coupe pas un formulaire en cours de remplissage : la prochaine
      // vérification (dans au plus CHECK_INTERVAL_MS, ou au retour sur
      // l'onglet) rechargera une fois le formulaire refermé.
      if (modalIsOpen()) return;

      location.reload();
    } catch (err) {
      // Pas de réseau pour l'instant : on retentera au prochain cycle.
    }
  }

  function start() {
    checkForUpdate();
    setInterval(checkForUpdate, CHECK_INTERVAL_MS);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") checkForUpdate();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
