// Chargement et préparation de la banque de questions : le fichier statique
// questions/questions.json (le socle, marche sans rien configurer) fusionné
// avec les questions publiées en direct par les admins depuis editor.html
// (collection Firestore /questions, voir js/contribute.js et
// firestore.rules). Lu en pur REST (pas de SDK Firebase) pour que le jeu
// n'ait jamais besoin d'authentification juste pour charger les questions —
// et pour que tout continue de marcher sans backend si Firebase n'est pas
// configuré (voir le `catch` de fetchPublishedQuestions, qui échoue en
// silence vers [] dans ce cas).
(function () {
  // Doit correspondre au `projectId` de js/firebase-config.js.
  const FIRESTORE_PROJECT_ID = "betterpopsauce";

  function decodeFirestoreValue(value) {
    if (!value) return null;
    if (value.stringValue !== undefined) return value.stringValue;
    if (value.integerValue !== undefined) return parseInt(value.integerValue, 10);
    if (value.doubleValue !== undefined) return value.doubleValue;
    if (value.booleanValue !== undefined) return value.booleanValue;
    if (value.nullValue !== undefined) return null;
    if (value.arrayValue !== undefined) return (value.arrayValue.values || []).map(decodeFirestoreValue);
    if (value.mapValue !== undefined) return decodeFirestoreFields(value.mapValue.fields || {});
    return null;
  }

  function decodeFirestoreFields(fields) {
    const obj = {};
    Object.keys(fields).forEach((key) => {
      obj[key] = decodeFirestoreValue(fields[key]);
    });
    return obj;
  }

  // Jamais d'exception ici : un souci réseau, un projet Firebase non
  // configuré, ou une collection vide ne doivent jamais empêcher de jouer
  // avec le socle statique.
  async function fetchPublishedQuestions() {
    const base =
      "https://firestore.googleapis.com/v1/projects/" + FIRESTORE_PROJECT_ID + "/databases/(default)/documents/questions";
    const docs = [];
    let pageToken = "";
    try {
      do {
        const url = base + "?pageSize=300" + (pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : "");
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) return [];
        const data = await res.json();
        (data.documents || []).forEach((d) => docs.push(d));
        pageToken = data.nextPageToken || "";
      } while (pageToken);
    } catch (e) {
      return [];
    }
    return docs.map((d) => decodeFirestoreFields(d.fields || {}));
  }

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
    const staticList = await response.json();
    const published = await fetchPublishedQuestions();

    // Fusion par id : une question publiée depuis l'éditeur remplace la
    // version statique du même id (édition en direct) ou s'ajoute si
    // nouvelle ; un repère deleted=true la retire même si elle ne vient que
    // du fichier statique (suppression depuis l'éditeur).
    const byId = new Map();
    staticList.forEach((q) => byId.set(q.id, q));
    published.forEach((q) => {
      if (q.deleted) byId.delete(q.id);
      else byId.set(q.id, q);
    });
    const list = Array.from(byId.values());

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
