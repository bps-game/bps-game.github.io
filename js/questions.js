// Chargement et préparation de la banque de questions (questions/questions.json).
(function () {
  function shuffle(array) {
    const result = array.slice();
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function validate(list) {
    if (!Array.isArray(list) || list.length === 0) {
      throw new Error("questions.json doit contenir un tableau non vide.");
    }
    list.forEach((q, i) => {
      if (!q.id || !q.question || !q.timeLimit) {
        throw new Error(`Question #${i} invalide : champs obligatoires manquants.`);
      }
      if (!Array.isArray(q.acceptableAnswers) || q.acceptableAnswers.length === 0) {
        throw new Error(`Question #${i} invalide : "acceptableAnswers" manquant ou vide.`);
      }
      if (q.media) {
        const validTypes = ["image", "video", "quote"];
        if (!validTypes.includes(q.media.type)) {
          throw new Error(`Question #${i} invalide : "media.type" doit être image, video ou quote.`);
        }
        if (q.media.type === "quote" && !q.media.text) {
          throw new Error(`Question #${i} invalide : "media.text" manquant pour une citation.`);
        }
        if ((q.media.type === "image" || q.media.type === "video") && !q.media.src) {
          throw new Error(`Question #${i} invalide : "media.src" manquant.`);
        }
      }
    });
  }

  async function load() {
    const response = await fetch("questions/questions.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Impossible de charger questions/questions.json (" + response.status + ")");
    }
    const list = await response.json();
    validate(list);
    return list;
  }

  window.Questions = {
    load,
    shuffle,
  };
})();
