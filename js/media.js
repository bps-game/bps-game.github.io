// Utilitaires partagés pour les médias de question (image/vidéo/citation) :
// détection des liens YouTube — une <video> brute ne peut pas les lire, il
// faut passer par le lecteur intégré de YouTube (iframe) — et construction
// d'une vignette de liste. Script classique chargé par index.html (jeu) ET
// editor.html (éditeur + propositions), pour que les deux affichent
// exactement les mêmes données de la même façon.
(function () {
  function parseYouTubeId(url) {
    if (!url) return null;
    let u;
    try {
      u = new URL(url, window.location.href);
    } catch (e) {
      return null;
    }
    const host = u.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtu.be") {
      return u.pathname.slice(1).split("/")[0] || null;
    }
    if (host === "youtube.com") {
      if (u.pathname === "/watch") return u.searchParams.get("v");
      const m = /^\/(embed|shorts)\/([^/?]+)/.exec(u.pathname);
      if (m) return m[2];
    }
    return null;
  }

  // loop=1 ne boucle une seule vidéo sur YouTube que si on répète son id
  // dans playlist — sans ça, loop est ignoré.
  function youtubeEmbedUrl(id, opts) {
    opts = opts || {};
    const params = new URLSearchParams({
      autoplay: opts.autoplay === false ? "0" : "1",
      mute: opts.muted === false ? "0" : "1",
      controls: opts.controls === false ? "0" : "1",
      rel: "0",
      playsinline: "1",
    });
    if (opts.loop !== false) {
      params.set("loop", "1");
      params.set("playlist", id);
    }
    return "https://www.youtube.com/embed/" + id + "?" + params.toString();
  }

  function youtubeThumbnailUrl(id) {
    return "https://img.youtube.com/vi/" + id + "/hqdefault.jpg";
  }

  // Construit une vignette de liste (liste de l'éditeur ET file de
  // propositions, pour un rendu identique) : image, aperçu YouTube, premier
  // cadre d'une vidéo classique, ou icône pour une citation. `className` est
  // la classe du conteneur (le CSS d'habillage dépend de l'appelant).
  function buildThumbnail(media, className) {
    if (!media) return null;
    const wrap = document.createElement("div");
    wrap.className = className;

    if (media.type === "image") {
      const img = document.createElement("img");
      img.src = media.src;
      img.alt = "";
      img.loading = "lazy";
      wrap.appendChild(img);
    } else if (media.type === "video") {
      const ytId = parseYouTubeId(media.src);
      if (ytId) {
        const img = document.createElement("img");
        img.src = youtubeThumbnailUrl(ytId);
        img.alt = "";
        img.loading = "lazy";
        wrap.appendChild(img);
      } else {
        const video = document.createElement("video");
        video.src = media.src;
        video.muted = true;
        video.playsInline = true;
        video.preload = "metadata";
        wrap.appendChild(video);
      }
    } else if (media.type === "quote") {
      wrap.classList.add(className + "-quote");
      wrap.textContent = "💬";
    } else {
      return null;
    }
    return wrap;
  }

  window.Media = {
    parseYouTubeId,
    youtubeEmbedUrl,
    youtubeThumbnailUrl,
    buildThumbnail,
  };
})();
