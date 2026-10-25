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
      if (!q.id || !q.type || !q.question || !q.timeLimit || !q.points) {
        throw new Error(`Question #${i} invalide : champs obligatoires manquants.`);
      }
      if (q.type === "qcm" && (!Array.isArray(q.choices) || typeof q.correctIndex !== "number")) {
        throw new Error(`Question #${i} (qcm) invalide : "choices"/"correctIndex" manquants.`);
      }
      if (q.type === "libre" && !Array.isArray(q.acceptableAnswers)) {
        throw new Error(`Question #${i} (libre) invalide : "acceptableAnswers" manquant.`);
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

  // Pour un QCM, mélange l'ordre des choix affichés tout en gardant une trace
  // de la bonne réponse, pour ne pas toujours montrer la bonne réponse en 1ère position.
  function shuffleChoices(question) {
    if (question.type !== "qcm") return question;
    const indices = shuffle(question.choices.map((_, i) => i));
    const choices = indices.map((i) => question.choices[i]);
    const correctIndex = indices.indexOf(question.correctIndex);
    return Object.assign({}, question, { choices, correctIndex });
  }

  window.Questions = {
    load,
    shuffle,
    shuffleChoices,
  };
})();
