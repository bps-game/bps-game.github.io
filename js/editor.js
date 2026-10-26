// Logique de l'éditeur visuel de questions (editor.html). Page autonome,
// indépendante du jeu : elle réutilise seulement js/questions.js (schéma,
// validation) et js/game-engine.js (moteur de correction, pour le testeur
// de réponse) — pas de réseau, pas de PeerJS.
(function () {
  const $ = (id) => document.getElementById(id);
  const DRAFT_KEY = "bps_editor_draft";

  let questions = [];
  let fileHandle = null; // File System Access API, si disponible
  let editingId = null; // null = création d'une nouvelle question
  let currentTags = [];

  // ---------- Petites notifications ----------
  function toast(message) {
    const el = $("toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(el._hideTimeout);
    el._hideTimeout = setTimeout(() => el.classList.remove("show"), 2500);
  }

  // ---------- Brouillon local (localStorage) ----------
  function saveDraft() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(questions));
    } catch (e) {
      // stockage indisponible (navigation privée...) : tant pis, non bloquant
    }
  }

  function loadDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  // ---------- Liste des questions ----------
  function nextId() {
    let max = 0;
    questions.forEach((q) => {
      const m = /^q(\d+)$/.exec(q.id || "");
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    let candidate = "q" + (max + 1);
    while (questions.some((q) => q.id === candidate)) {
      max++;
      candidate = "q" + (max + 1);
    }
    return candidate;
  }

  function mediaLabel(media) {
    if (!media) return null;
    if (media.type === "image") return "🖼️ image";
    if (media.type === "video") return "🎬 vidéo";
    if (media.type === "quote") return "💬 citation";
    return null;
  }

  // Petite vignette pour reconnaître la question d'un coup d'œil dans la
  // liste (utile notamment pour les questions qui partagent le même texte,
  // ex : les drapeaux). Pas de vignette pour une citation (pas d'élément
  // visuel à montrer) ni quand il n'y a aucun média.
  function mediaThumbnail(media) {
    if (!media) return null;
    const wrap = document.createElement("div");
    wrap.className = "editor-question-thumb";
    if (media.type === "image") {
      const img = document.createElement("img");
      img.src = media.src;
      img.alt = "";
      img.loading = "lazy";
      wrap.appendChild(img);
    } else if (media.type === "video") {
      const video = document.createElement("video");
      video.src = media.src;
      video.muted = true;
      video.playsInline = true;
      video.preload = "metadata";
      wrap.appendChild(video);
    } else if (media.type === "quote") {
      wrap.classList.add("editor-question-thumb-quote");
      wrap.textContent = "💬";
    } else {
      return null;
    }
    return wrap;
  }

  function renderList() {
    const container = $("editor-list");
    container.innerHTML = "";
    const search = $("search-input").value.trim().toLowerCase();

    const filtered = questions.filter((q) => {
      if (!search) return true;
      const haystack = [q.question, q.category, ...(q.acceptableAnswers || [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    });

    $("editor-status").textContent =
      questions.length +
      " question" +
      (questions.length !== 1 ? "s" : "") +
      (fileHandle ? " — connecté à " + fileHandle.name : " — pense à Ouvrir/Importer ton fichier existant");

    if (filtered.length === 0) {
      const empty = document.createElement("p");
      empty.className = "hint";
      empty.textContent =
        questions.length === 0
          ? "Aucune question pour l'instant. Ouvre ton questions.json existant, importe un fichier, ou crée une nouvelle question."
          : "Aucun résultat pour cette recherche.";
      container.appendChild(empty);
      return;
    }

    filtered.forEach((q) => {
      const card = document.createElement("div");
      card.className = "editor-question-card";

      const thumb = mediaThumbnail(q.media);
      if (thumb) card.appendChild(thumb);

      const main = document.createElement("div");
      main.className = "editor-question-main";

      const text = document.createElement("div");
      text.className = "editor-question-text";
      text.textContent = q.question || "(sans texte)";

      const answers = document.createElement("div");
      answers.className = "editor-question-answers";
      answers.textContent = (q.acceptableAnswers || []).join(", ") || "(aucune réponse acceptée)";

      const meta = document.createElement("div");
      meta.className = "editor-question-meta";
      const metaParts = [q.category || "Sans catégorie", (q.timeLimit || "?") + "s"];
      const label = mediaLabel(q.media);
      if (label) metaParts.push(label);
      meta.textContent = metaParts.join(" · ");

      main.appendChild(text);
      main.appendChild(answers);
      main.appendChild(meta);

      const actions = document.createElement("div");
      actions.className = "editor-question-actions";

      const editBtn = document.createElement("button");
      editBtn.className = "btn-secondary";
      editBtn.textContent = "Modifier";
      editBtn.addEventListener("click", () => openModal(q.id));

      const delBtn = document.createElement("button");
      delBtn.className = "btn-secondary btn-danger";
      delBtn.textContent = "Supprimer";
      delBtn.addEventListener("click", () => deleteQuestion(q.id));

      actions.appendChild(editBtn);
      actions.appendChild(delBtn);

      card.appendChild(main);
      card.appendChild(actions);
      container.appendChild(card);
    });
  }

  function deleteQuestion(id) {
    const q = questions.find((x) => x.id === id);
    if (!q) return;
    if (!confirm("Supprimer la question « " + q.question + " » ?")) return;
    questions = questions.filter((x) => x.id !== id);
    saveDraft();
    renderList();
    toast("Question supprimée.");
    publishDeletionIfAdmin(id);
  }

  // ---------- Formulaire (création / édition) ----------
  function updateCategoryList() {
    const list = $("category-list");
    list.innerHTML = "";
    const seen = new Set();
    questions.forEach((q) => {
      if (q.category && !seen.has(q.category)) {
        seen.add(q.category);
        const opt = document.createElement("option");
        opt.value = q.category;
        list.appendChild(opt);
      }
    });
  }

  function renderTags() {
    const list = $("tags-list");
    list.innerHTML = "";
    currentTags.forEach((tag, i) => {
      const chip = document.createElement("div");
      chip.className = "tag-chip";

      const span = document.createElement("span");
      span.textContent = tag;

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.textContent = "×";
      removeBtn.addEventListener("click", () => {
        currentTags.splice(i, 1);
        renderTags();
        updateAnswerTest();
      });

      chip.appendChild(span);
      chip.appendChild(removeBtn);
      list.appendChild(chip);
    });
  }

  function addTagFromInput() {
    const input = $("f-tag-entry");
    const value = input.value.trim();
    input.value = "";
    if (!value) return;
    if (!currentTags.includes(value)) {
      currentTags.push(value);
      renderTags();
      updateAnswerTest();
    }
  }

  function updateMediaFieldsVisibility() {
    const type = $("f-media-type").value;
    $("field-image-src").style.display = type === "image" ? "block" : "none";
    $("field-video").style.display = type === "video" ? "block" : "none";
    $("field-quote").style.display = type === "quote" ? "block" : "none";
    updatePreview();
  }

  // Version "souple" utilisée pour l'aperçu : un champ vide ne casse rien,
  // on n'affiche simplement rien pour ce média.
  function collectMediaLoose() {
    const type = $("f-media-type").value;
    if (type === "image") {
      const src = $("f-image-src").value.trim();
      return src ? { type: "image", src } : null;
    }
    if (type === "video") {
      const src = $("f-video-src").value.trim();
      return src
        ? { type: "video", src, loop: $("f-video-loop").checked, muted: $("f-video-muted").checked }
        : null;
    }
    if (type === "quote") {
      const text = $("f-quote-text").value.trim();
      return text ? { type: "quote", text } : null;
    }
    return null;
  }

  // Version "stricte" utilisée à l'enregistrement : si un type est choisi,
  // l'objet media est construit tel quel (même avec des champs vides), pour
  // que la validation puisse signaler clairement ce qui manque.
  function collectMediaStrict() {
    const type = $("f-media-type").value;
    if (!type) return null;
    if (type === "image") return { type: "image", src: $("f-image-src").value.trim() };
    if (type === "video") {
      return {
        type: "video",
        src: $("f-video-src").value.trim(),
        loop: $("f-video-loop").checked,
        muted: $("f-video-muted").checked,
      };
    }
    if (type === "quote") return { type: "quote", text: $("f-quote-text").value.trim() };
    return null;
  }

  function updatePreview() {
    $("preview-category").textContent = $("f-category").value.trim() || "Catégorie";
    $("preview-question").textContent = $("f-question").value.trim() || "Texte de la question…";

    const img = $("preview-image");
    const video = $("preview-video");
    const quote = $("preview-quote");
    img.style.display = "none";
    img.removeAttribute("src");
    video.pause();
    video.style.display = "none";
    video.removeAttribute("src");
    quote.style.display = "none";
    quote.textContent = "";

    const media = collectMediaLoose();
    if (!media) return;

    if (media.type === "image") {
      img.src = media.src;
      img.style.display = "block";
    } else if (media.type === "video") {
      video.src = media.src;
      video.loop = media.loop !== false;
      video.muted = media.muted !== false;
      video.style.display = "block";
      video.play().catch(() => {});
    } else if (media.type === "quote") {
      quote.textContent = media.text;
      quote.style.display = "block";
    }
  }

  function updateAnswerTest() {
    const value = $("f-answer-test").value.trim();
    const result = $("answer-test-result");
    if (!value) {
      result.textContent = "";
      result.className = "answer-test-result";
      return;
    }
    if (currentTags.length === 0) {
      result.textContent = "Ajoute au moins une réponse acceptée pour tester.";
      result.className = "answer-test-result";
      return;
    }
    const correct = window.GameEngine._internal.isAnswerCorrect(value, currentTags);
    result.textContent = correct ? "✅ Serait acceptée" : "❌ Serait refusée";
    result.className = "answer-test-result " + (correct ? "correct" : "incorrect");
  }

  function openModal(id) {
    editingId = id || null;
    const q = id ? questions.find((x) => x.id === id) : null;

    $("modal-title").textContent = q ? "Modifier la question" : "Nouvelle question";
    $("f-category").value = (q && q.category) || "";
    $("f-question").value = (q && q.question) || "";
    $("f-time-limit").value = (q && q.timeLimit) || 18;

    const mediaType = q && q.media ? q.media.type : "";
    $("f-media-type").value = mediaType;
    $("f-image-src").value = mediaType === "image" ? q.media.src || "" : "";
    $("f-video-src").value = mediaType === "video" ? q.media.src || "" : "";
    $("f-video-loop").checked = mediaType === "video" ? q.media.loop !== false : true;
    $("f-video-muted").checked = mediaType === "video" ? q.media.muted !== false : true;
    $("f-quote-text").value = mediaType === "quote" ? q.media.text || "" : "";

    currentTags = q ? (q.acceptableAnswers || []).slice() : [];
    renderTags();

    $("f-answer-test").value = "";
    updateAnswerTest();
    updateCategoryList();
    updateMediaFieldsVisibility();
    $("modal-error").textContent = "";
    $("modal-overlay").style.display = "flex";
    $("f-category").focus();
  }

  function closeModal() {
    $("preview-video").pause();
    $("modal-overlay").style.display = "none";
    editingId = null;
  }

  // Construit l'objet question à partir du formulaire actuellement ouvert,
  // sans rien enregistrer. Réutilisé pour l'enregistrement local ET pour la
  // proposition en ligne (js/online.js), afin que les deux partagent
  // exactement le même formulaire plutôt que d'en dupliquer un second.
  function buildDraftFromForm() {
    const draft = {
      id: editingId || nextId(),
      category: $("f-category").value.trim(),
      question: $("f-question").value.trim(),
      acceptableAnswers: currentTags.slice(),
      timeLimit: parseInt($("f-time-limit").value, 10),
    };
    const media = collectMediaStrict();
    if (media) draft.media = media;
    return draft;
  }

  function saveQuestionFromForm() {
    const draft = buildDraftFromForm();
    const errors = window.Questions.validateOne(draft);
    if (errors.length > 0) {
      $("modal-error").textContent = errors.join(" · ");
      return;
    }

    if (editingId) {
      const idx = questions.findIndex((x) => x.id === editingId);
      questions[idx] = draft;
    } else {
      questions.push(draft);
    }
    saveDraft();
    renderList();
    closeModal();
    toast(editingId ? "Question mise à jour." : "Question ajoutée.");
    publishIfAdmin(draft);
  }

  // ---------- Publication en direct (admin, voir js/online.js) ----------
  // Si le compte connecté est admin, chaque sauvegarde/suppression locale
  // est aussi répercutée immédiatement sur Firestore (collection
  // /questions), donc déjà vivante dans le jeu sans étape manuelle. Pour
  // tout le monde d'autre (pas connecté, pas admin, Firebase non configuré),
  // l'éditeur se comporte exactement comme avant : local, à exporter/committer.
  function publishIfAdmin(q) {
    if (!window.QuestionsSync || !window.QuestionsSync.isReady()) return;
    window.QuestionsSync.publish(q).catch((err) => {
      toast("Enregistré localement, mais échec de la publication en direct : " + err.message);
    });
  }

  function publishDeletionIfAdmin(id) {
    if (!window.QuestionsSync || !window.QuestionsSync.isReady()) return;
    window.QuestionsSync.unpublish(id).catch((err) => {
      toast("Supprimé localement, mais échec de la suppression en direct : " + err.message);
    });
  }

  // ---------- Chargement / enregistrement du fichier ----------
  function replaceQuestions(list, sourceName) {
    if (!Array.isArray(list)) {
      toast("Le fichier ne contient pas un tableau de questions valide.");
      return false;
    }
    if (
      questions.length > 0 &&
      !confirm(
        "Charger ce fichier remplacera les " + questions.length + " questions actuellement affichées. Continuer ?"
      )
    ) {
      return false;
    }
    questions = list;
    saveDraft();
    renderList();
    toast("Questions chargées depuis " + sourceName + " (" + list.length + ").");
    return true;
  }

  async function openFile() {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: "JSON", accept: { "application/json": [".json"] } }],
      });
      const file = await handle.getFile();
      const list = JSON.parse(await file.text());
      if (replaceQuestions(list, file.name)) {
        fileHandle = handle;
        $("btn-save-file").disabled = false;
        renderList();
      }
    } catch (err) {
      if (err.name !== "AbortError") toast("Impossible d'ouvrir le fichier : " + err.message);
    }
  }

  function importFile() {
    $("file-input").click();
  }

  function handleFileInputChange(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        replaceQuestions(JSON.parse(reader.result), file.name);
      } catch (err) {
        toast("Fichier JSON invalide : " + err.message);
      }
    };
    reader.readAsText(file);
  }

  function validateAll() {
    const errors = [];
    const seenIds = new Set();
    questions.forEach((q, i) => {
      const qErrors = window.Questions.validateOne(q);
      if (q.id && seenIds.has(q.id)) qErrors.push("identifiant en double (" + q.id + ")");
      if (q.id) seenIds.add(q.id);
      if (qErrors.length > 0) {
        errors.push("#" + (i + 1) + " « " + (q.question || q.id || "?") + " » : " + qErrors.join(", "));
      }
    });
    return errors;
  }

  async function saveFile() {
    const errors = validateAll();
    if (errors.length > 0) {
      alert("Impossible d'enregistrer, corrige d'abord :\n\n" + errors.join("\n"));
      return;
    }
    if (!fileHandle) return;
    try {
      const writable = await fileHandle.createWritable();
      await writable.write(JSON.stringify(questions, null, 2) + "\n");
      await writable.close();
      toast("✅ " + fileHandle.name + " enregistré.");
    } catch (err) {
      toast("Échec de l'enregistrement : " + err.message);
    }
  }

  function exportFile() {
    const errors = validateAll();
    if (errors.length > 0) {
      alert(
        "Attention, certaines questions sont invalides (export quand même possible) :\n\n" + errors.join("\n")
      );
    }
    const blob = new Blob([JSON.stringify(questions, null, 2) + "\n"], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "questions.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast("Téléchargement de questions.json lancé.");
  }

  // Ajoute une question déjà approuvée (venue du mode en ligne, voir
  // js/online.js) à la liste locale, prête à être enregistrée/exportée
  // comme n'importe quelle autre question. Renomme l'id en cas de collision
  // plutôt que d'écraser une question existante — renvoie la question telle
  // qu'ajoutée (id éventuellement renommé) pour que js/online.js publie sur
  // Firestore exactement sous le même id que celui affiché localement.
  function addApprovedQuestion(q) {
    let toAdd = q;
    if (questions.some((x) => x.id === toAdd.id)) {
      toAdd = Object.assign({}, toAdd, { id: nextId() });
    }
    questions.push(toAdd);
    saveDraft();
    renderList();
    return toAdd;
  }

  // Charge les questions actuellement en ligne (statique + Firestore, voir
  // js/questions.js) si l'éditeur démarre à vide (pas de brouillon local) :
  // évite d'avoir à Ouvrir/Importer manuellement juste pour voir/éditer
  // l'existant. Un brouillon en cours (dès la première modification) prend
  // toujours le pas au prochain chargement de page.
  async function loadLiveQuestionsIfEmpty() {
    try {
      const list = await window.Questions.load();
      if (questions.length === 0) {
        questions = list;
        renderList();
        toast("Questions actuelles chargées (" + list.length + ").");
      }
    } catch (err) {
      // Pas grave : Ouvrir/Importer restent disponibles.
    }
  }

  // Pont avec js/online.js (module ES séparé à cause du SDK Firebase) : le
  // mode en ligne réutilise le même formulaire que l'édition locale pour
  // proposer une question, et dépose les questions approuvées ici.
  window.EditorBridge = { buildDraftFromForm, addApprovedQuestion };

  // ---------- Initialisation ----------
  function init() {
    const hasFsAccess = "showOpenFilePicker" in window;
    $("btn-open-file").style.display = hasFsAccess ? "inline-block" : "none";
    $("btn-save-file").style.display = hasFsAccess ? "inline-block" : "none";

    const draft = loadDraft();
    if (draft && draft.length > 0) {
      questions = draft;
      toast("Brouillon local restauré (" + draft.length + " question(s)).");
      renderList();
    } else {
      renderList();
      loadLiveQuestionsIfEmpty();
    }

    $("search-input").addEventListener("input", renderList);
    $("btn-new-question").addEventListener("click", () => openModal(null));
    $("btn-cancel").addEventListener("click", closeModal);
    $("btn-save-question").addEventListener("click", saveQuestionFromForm);
    $("f-media-type").addEventListener("change", updateMediaFieldsVisibility);

    ["f-category", "f-question", "f-image-src", "f-video-src", "f-video-loop", "f-video-muted", "f-quote-text"].forEach(
      (id) => $(id).addEventListener("input", updatePreview)
    );

    $("f-tag-entry").addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        addTagFromInput();
      }
    });
    $("f-answer-test").addEventListener("input", updateAnswerTest);

    $("btn-open-file").addEventListener("click", openFile);
    $("btn-import-file").addEventListener("click", importFile);
    $("file-input").addEventListener("change", handleFileInputChange);
    $("btn-save-file").addEventListener("click", saveFile);
    $("btn-export-file").addEventListener("click", exportFile);

    $("modal-overlay").addEventListener("click", (e) => {
      if (e.target.id === "modal-overlay") closeModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && $("modal-overlay").style.display !== "none") closeModal();
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
