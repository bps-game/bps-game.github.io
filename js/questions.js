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

  // Valide une question isolée et renvoie la liste des problèmes trouvés
  // (tableau vide = valide). Ne lève jamais d'exception : pensé pour être
  // appelé question par question, notamment par l'éditeur visuel.
  function validateOne(q) {
    const errors = [];
    if (!q || typeof q !== "object") return ["question invalide"];
    if (!q.id) errors.push("identifiant manquant");
    if (!q.question) errors.push("texte de la question manquant");
    if (!q.timeLimit || Number(q.timeLimit) <= 0) errors.push("temps limite invalide");
    if (!Array.isArray(q.acceptableAnswers) || q.acceptableAnswers.length === 0) {
      errors.push("au moins une réponse acceptée est requise");
    }
    if (q.media) {
      const validTypes = ["image", "video", "quote"];
      if (!validTypes.includes(q.media.type)) {
        errors.push("type de média invalide (image, video ou quote)");
      } else if (q.media.type === "quote" && !q.media.text) {
        errors.push("texte de la citation manquant");
      } else if ((q.media.type === "image" || q.media.type === "video") && !q.media.src) {
        errors.push("chemin du média manquant");
      }
    }
    return errors;
  }

  function validate(list) {
    if (!Array.isArray(list) || list.length === 0) {
      throw new Error("questions.json doit contenir un tableau non vide.");
    }
    list.forEach((q, i) => {
      const errors = validateOne(q);
      if (errors.length > 0) {
        throw new Error(`Question #${i} invalide : ${errors.join(", ")}.`);
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
    validate,
    validateOne,
  };
})();
