// Machine à états du jeu + correction des réponses libres + calcul des scores.
// L'hôte (celui qui a créé la salle) fait tourner toute la logique et diffuse
// l'état ; les autres joueurs ne font qu'afficher ce qu'ils reçoivent et
// renvoyer leurs réponses à l'hôte. Cela évite tout besoin de serveur.
(function () {
  const MSG = {
    JOIN: "JOIN",
    LOBBY_UPDATE: "LOBBY_UPDATE",
    QUESTION: "QUESTION",
    ANSWER: "ANSWER",
    ANSWER_RESULT: "ANSWER_RESULT",
    LIVE_STATUS: "LIVE_STATUS",
    REVEAL: "REVEAL",
    GAME_END: "GAME_END",
    CHAT: "CHAT",
  };

  const REVEAL_DURATION_MS = 6000;

  // Barème : le premier joueur à trouver la bonne réponse a toujours le
  // score maximum. Les suivants reçoivent de moins en moins de points au
  // fur et à mesure que le temps passe DEPUIS CETTE PREMIÈRE BONNE RÉPONSE
  // (et non depuis le début de la question) — jusqu'à un plancher, atteint
  // après SCORE_DECAY_WINDOW_MS.
  const MAX_POINTS_PER_QUESTION = 20;
  const MIN_POINTS_PER_QUESTION = 1; // une bonne réponse rapporte toujours au moins 1 point
  const SCORE_DECAY_WINDOW_MS = 12000;
  const DEFAULT_WIN_SCORE = 100; // seuil de victoire par défaut, réglable par l'hôte dans le lobby
  const DEFAULT_TIME_LIMIT = 15; // secondes par question par défaut, réglable par l'hôte dans le lobby
  const MIN_TIME_LIMIT = 3;

  // Plage Unicode des diacritiques combinants (0300-036F), construite via
  // String.fromCharCode pour éviter tout souci d'échappement de séquence
  // unicode dans le code source.
  const ACCENT_RANGE_RE = new RegExp(
    "[" + String.fromCharCode(768) + "-" + String.fromCharCode(879) + "]",
    "g"
  );

  // ---------- Correction des réponses libres ----------
  //
  // Toutes les questions sont à réponse libre (texte tapé au clavier). Une
  // réponse est acceptée si elle correspond EXACTEMENT (après normalisation
  // accents/casse/ponctuation) à l'une des `acceptableAnswers`, à un sous-titre
  // contigu de l'une d'elles (ex : "Tears of the Kingdom" dans "The Legend of
  // Zelda: Tears of the Kingdom"), ou à son acronyme (ex : "TOTK").
  //
  // Pas de tolérance aux fautes de frappe (distance de Levenshtein) : sur des
  // réponses courtes (noms de pays, titres courts...), ça acceptait à tort des
  // réponses clairement différentes d'une seule lettre (ex : "Iran" pour
  // "Irak"). Mieux vaut renseigner plusieurs `acceptableAnswers` explicites
  // (fautes d'accent déjà ignorées, variantes orthographiques courantes) que
  // d'ouvrir la porte à ce genre de faux positifs.

  function normalize(str) {
    return (str || "")
      .toString()
      .normalize("NFD")
      .replace(ACCENT_RANGE_RE, "") // accents
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ") // ponctuation -> espace (jamais fusionnée)
      .trim()
      .replace(/\s+/g, " ");
  }

  function wordsOf(normalized) {
    return normalized ? normalized.split(" ").filter(Boolean) : [];
  }

  // Suite de mots contiguë EXACTE : accepte un sous-titre ou une forme
  // raccourcie dès lors qu'il correspond mot pour mot à une suite de mots
  // consécutifs de l'autre réponse (ex : "Tears of the Kingdom" dans "The
  // Legend of Zelda: Tears of the Kingdom"). Pas de tolérance aux fautes ici.
  function containsWordRun(shorterWords, longerWords) {
    const shorterStr = shorterWords.join(" ");
    for (let start = 0; start + shorterWords.length <= longerWords.length; start++) {
      if (longerWords.slice(start, start + shorterWords.length).join(" ") === shorterStr) return true;
    }
    return false;
  }

  function matchesContiguousSubset(subWords, accWords) {
    if (subWords.length < 2 || accWords.length < 2) return false;
    const shorter = subWords.length <= accWords.length ? subWords : accWords;
    const longer = subWords.length <= accWords.length ? accWords : subWords;
    // Écart plafonné : évite qu'une réponse interminable (abus) ne valide tout
    // en contenant par hasard la suite de mots cherchée.
    if (longer.length - shorter.length > 5) return false;
    return containsWordRun(shorter, longer);
  }

  function acronymOf(wordList) {
    return wordList.map((w) => w[0]).join("");
  }

  // Teste si le texte tapé (sans espaces) correspond au sigle d'une suite
  // d'au moins 3 mots consécutifs de la réponse acceptée.
  function matchesAcronym(submittedNoSpace, accWords) {
    if (submittedNoSpace.length < 3) return false;
    for (let start = 0; start < accWords.length; start++) {
      for (let len = 3; start + len <= accWords.length; len++) {
        if (acronymOf(accWords.slice(start, start + len)) === submittedNoSpace) return true;
      }
    }
    return false;
  }

  function matchesOneAnswer(submittedNorm, submittedWords, submittedNoSpace, accepted) {
    const acceptedNorm = normalize(accepted);
    if (!acceptedNorm) return false;
    if (submittedNorm === acceptedNorm) return true;

    const acceptedWords = wordsOf(acceptedNorm);
    if (matchesContiguousSubset(submittedWords, acceptedWords)) return true;
    if (acceptedWords.length >= 3 && matchesAcronym(submittedNoSpace, acceptedWords)) return true;

    return false;
  }

  function isAnswerCorrect(submitted, acceptableAnswers) {
    const submittedNorm = normalize(submitted);
    if (!submittedNorm) return false;
    const submittedWords = wordsOf(submittedNorm);
    const submittedNoSpace = submittedNorm.replace(/\s+/g, "");
    return (acceptableAnswers || []).some((accepted) =>
      matchesOneAnswer(submittedNorm, submittedWords, submittedNoSpace, accepted)
    );
  }

  // Score d'une bonne réponse qui n'est PAS la première : décroît de
  // MAX_POINTS_PER_QUESTION à MIN_POINTS_PER_QUESTION au fil de
  // SCORE_DECAY_WINDOW_MS écoulées depuis la première bonne réponse.
  function computeScore(elapsedSinceFirstCorrectMs) {
    const ratio = Math.min(1, Math.max(0, elapsedSinceFirstCorrectMs / SCORE_DECAY_WINDOW_MS));
    return Math.round(
      MAX_POINTS_PER_QUESTION - ratio * (MAX_POINTS_PER_QUESTION - MIN_POINTS_PER_QUESTION)
    );
  }

  function createGameEngine() {
    let role = null;
    let hostOwnId = null;
    let questions = [];
    let currentIndex = -1;
    let questionTimer = null;
    let revealTimer = null;
    let firstCorrectAt = null; // instant (ms) de la première bonne réponse de la question en cours
    let currentAnswers = new Map(); // peerId -> { answer, gained } (réponses CORRECTES verrouillées)
    let lastWrongAttempt = new Map(); // peerId -> dernier texte tenté (faux), pour l'affichage en correction
    let winScore = DEFAULT_WIN_SCORE; // seuil de points pour remporter la partie, réglé par l'hôte
    let questionTimeLimit = DEFAULT_TIME_LIMIT; // secondes par question, commun à toutes, réglé par l'hôte
    let selectedCategories = []; // vide = toutes les catégories, réglé par l'hôte

    // players: peerId -> { id, pseudo, score, isHost }
    const players = new Map();

    const callbacks = {
      lobbyUpdate: null,
      question: null,
      answerResult: null,
      liveStatus: null,
      reveal: null,
      gameEnd: null,
    };

    function on(event, fn) {
      callbacks[event] = fn;
    }

    function playersArray() {
      return Array.from(players.values());
    }

    function sortedLeaderboard() {
      return playersArray()
        .slice()
        .sort((a, b) => b.score - a.score);
    }

    function broadcastLobby() {
      const payload = {
        type: MSG.LOBBY_UPDATE,
        players: playersArray(),
        winScore,
        questionTimeLimit,
        selectedCategories,
      };
      window.Network.broadcast(payload);
      if (callbacks.lobbyUpdate) callbacks.lobbyUpdate(playersArray(), winScore, questionTimeLimit, selectedCategories);
    }

    // Statut de chaque joueur pour la question en cours : trouvé, en train
    // d'essayer (avec sa dernière tentative fausse), ou encore muet.
    function buildLiveStatus() {
      const list = playersArray().map((player) => {
        const correctEntry = currentAnswers.get(player.id);
        const wrongAttempt = lastWrongAttempt.get(player.id);
        return {
          id: player.id,
          pseudo: player.pseudo,
          score: player.score,
          streak: player.streak,
          status: correctEntry ? "correct" : wrongAttempt ? "wrong" : "none",
          lastWrongAnswer: wrongAttempt || null,
        };
      });
      list.sort((a, b) => b.score - a.score);
      return list;
    }

    function broadcastLiveStatus() {
      const payload = { type: MSG.LIVE_STATUS, players: buildLiveStatus() };
      window.Network.broadcast(payload);
      if (callbacks.liveStatus) callbacks.liveStatus(payload);
    }

    // ---------- Rôle hôte ----------

    function hostInit(myId, myPseudo) {
      role = "host";
      hostOwnId = myId;
      winScore = DEFAULT_WIN_SCORE;
      questionTimeLimit = DEFAULT_TIME_LIMIT;
      selectedCategories = [];
      players.clear();
      players.set(myId, { id: myId, pseudo: myPseudo, score: 0, streak: 0, isHost: true });
    }

    // Réglables uniquement depuis le lobby, avant le lancement de la partie.
    function hostSetWinScore(value) {
      if (currentIndex !== -1) return; // partie déjà lancée : on n'y touche plus
      winScore = Math.max(1, Math.round(Number(value) || DEFAULT_WIN_SCORE));
      broadcastLobby();
    }

    function hostSetTimeLimit(value) {
      if (currentIndex !== -1) return; // partie déjà lancée : on n'y touche plus
      questionTimeLimit = Math.max(MIN_TIME_LIMIT, Math.round(Number(value) || DEFAULT_TIME_LIMIT));
      broadcastLobby();
    }

    // categories vide (ou absente) = toutes les catégories, sans filtre.
    function hostSetCategories(categories) {
      if (currentIndex !== -1) return; // partie déjà lancée : on n'y touche plus
      selectedCategories = Array.isArray(categories) ? categories.slice() : [];
      broadcastLobby();
    }

    function hostAddPlayer(peerId, pseudo) {
      if (players.has(peerId)) return;
      players.set(peerId, { id: peerId, pseudo: pseudo || "Joueur", score: 0, streak: 0, isHost: false });
      broadcastLobby();
    }

    function hostRemovePlayer(peerId) {
      if (!players.has(peerId)) return;
      players.delete(peerId);
      broadcastLobby();
    }

    // Filtre par les catégories choisies dans le lobby (aucune sélection =
    // toutes). Renvoie false (sans rien démarrer) si le filtre ne laisse
    // aucune question — l'appelant (main.js) doit vérifier ce retour avant
    // de considérer la partie lancée.
    function hostStartGame(loadedQuestions) {
      const filtered =
        selectedCategories.length > 0
          ? loadedQuestions.filter((q) => selectedCategories.includes(q.category))
          : loadedQuestions;
      if (filtered.length === 0) return false;
      questions = filtered;
      currentIndex = -1;
      hostNextQuestion();
      return true;
    }

    function hostNextQuestion() {
      clearTimeout(questionTimer);
      clearTimeout(revealTimer);
      currentIndex++;
      if (currentIndex >= questions.length) {
        hostEndGame("no-more-questions");
        return;
      }
      currentAnswers = new Map();
      lastWrongAttempt = new Map();
      firstCorrectAt = null;
      const q = questions[currentIndex];
      const payload = {
        type: MSG.QUESTION,
        index: currentIndex,
        total: questions.length,
        category: q.category,
        text: q.question,
        media: q.media || null,
        timeLimit: questionTimeLimit,
        winScore,
      };
      window.Network.broadcast(payload);
      if (callbacks.question) callbacks.question(payload);
      broadcastLiveStatus();
      questionTimer = setTimeout(() => hostRevealAnswer(), questionTimeLimit * 1000 + 300);
    }

    // Le joueur peut retenter autant de fois qu'il veut jusqu'à expiration du
    // temps : une tentative fausse vide le champ (le joueur retape), une
    // tentative juste verrouille le champ et rapporte immédiatement les
    // points (calculés sur l'instant de CETTE tentative, pas de la première).
    function hostHandleAttempt(peerId, answer) {
      if (currentAnswers.has(peerId)) return; // déjà verrouillé sur une bonne réponse
      const q = questions[currentIndex];
      const correct = isAnswerCorrect(answer, q.acceptableAnswers);
      let payload;

      if (correct) {
        let gained;
        if (firstCorrectAt === null) {
          firstCorrectAt = Date.now();
          gained = MAX_POINTS_PER_QUESTION; // le premier a toujours le score maximum
        } else {
          gained = computeScore(Date.now() - firstCorrectAt);
        }
        const player = players.get(peerId);
        player.score += gained;
        player.streak += 1;
        currentAnswers.set(peerId, { answer, gained });
        payload = { type: MSG.ANSWER_RESULT, correct: true, gained, totalScore: player.score };
      } else {
        lastWrongAttempt.set(peerId, answer);
        payload = { type: MSG.ANSWER_RESULT, correct: false };
      }

      if (peerId === hostOwnId) {
        if (callbacks.answerResult) callbacks.answerResult(payload);
      } else {
        window.Network.send(peerId, payload);
      }
      broadcastLiveStatus();

      if (correct && currentAnswers.size >= players.size) {
        clearTimeout(questionTimer);
        hostRevealAnswer();
      }
    }

    function hostRevealAnswer() {
      clearTimeout(questionTimer);
      const q = questions[currentIndex];
      const results = [];

      players.forEach((player, peerId) => {
        const entry = currentAnswers.get(peerId);
        const wrongAttempt = lastWrongAttempt.get(peerId);
        if (!entry) player.streak = 0; // série cassée si pas trouvé cette question
        results.push({
          id: peerId,
          pseudo: player.pseudo,
          answered: !!entry || !!wrongAttempt,
          submitted: entry ? entry.answer : wrongAttempt || null,
          correct: !!entry,
          gained: entry ? entry.gained : 0,
          totalScore: player.score,
          streak: player.streak,
        });
      });

      const leaderboard = sortedLeaderboard();
      const payload = {
        type: MSG.REVEAL,
        index: currentIndex,
        acceptableAnswers: q.acceptableAnswers,
        results,
        leaderboard,
      };
      window.Network.broadcast(payload);
      if (callbacks.reveal) callbacks.reveal(payload);

      // Le seuil de victoire prime sur le nombre de questions : dès qu'un
      // joueur l'atteint (ou le dépasse) SEUL en tête, la partie s'arrête
      // après cette correction, même s'il reste des questions. En cas
      // d'égalité en tête (plusieurs joueurs à égalité sur le score le plus
      // haut), la partie continue pour les départager — tout le monde
      // continue de jouer, pas seulement les joueurs à égalité.
      const topScore = leaderboard.length > 0 ? leaderboard[0].score : 0;
      const tiedAtTop = leaderboard.filter((p) => p.score === topScore).length;
      const hasSoleWinner = topScore >= winScore && tiedAtTop === 1;
      if (hasSoleWinner) {
        revealTimer = setTimeout(() => hostEndGame("threshold"), REVEAL_DURATION_MS);
      } else {
        revealTimer = setTimeout(() => hostNextQuestion(), REVEAL_DURATION_MS);
      }
    }

    function hostEndGame(reason) {
      clearTimeout(questionTimer);
      clearTimeout(revealTimer);
      const payload = {
        type: MSG.GAME_END,
        leaderboard: sortedLeaderboard(),
        winScore,
        reason: reason || "no-more-questions",
      };
      window.Network.broadcast(payload);
      if (callbacks.gameEnd) callbacks.gameEnd(payload);
    }

    // ---------- Rôle client ----------

    function clientHandleMessage(data) {
      if (data.type === MSG.LOBBY_UPDATE) {
        players.clear();
        data.players.forEach((p) => players.set(p.id, p));
        winScore = data.winScore || winScore;
        questionTimeLimit = data.questionTimeLimit || questionTimeLimit;
        selectedCategories = data.selectedCategories || selectedCategories;
        if (callbacks.lobbyUpdate) callbacks.lobbyUpdate(data.players, winScore, questionTimeLimit, selectedCategories);
      } else if (data.type === MSG.QUESTION) {
        if (callbacks.question) callbacks.question(data);
      } else if (data.type === MSG.ANSWER_RESULT) {
        if (callbacks.answerResult) callbacks.answerResult(data);
      } else if (data.type === MSG.LIVE_STATUS) {
        if (callbacks.liveStatus) callbacks.liveStatus(data);
      } else if (data.type === MSG.REVEAL) {
        if (callbacks.reveal) callbacks.reveal(data);
      } else if (data.type === MSG.GAME_END) {
        if (callbacks.gameEnd) callbacks.gameEnd(data);
      }
    }

    return {
      MSG,
      REVEAL_DURATION_MS,
      on,
      hostInit,
      hostAddPlayer,
      hostRemovePlayer,
      hostStartGame,
      hostSetWinScore,
      hostSetTimeLimit,
      hostSetCategories,
      hostHandleAttempt,
      clientHandleMessage,
      getPlayers: playersArray,
      getRole: () => role,
      getCurrentIndex: () => currentIndex,
      getWinScore: () => winScore,
      getTimeLimit: () => questionTimeLimit,
      getCategories: () => selectedCategories,
      // exposés pour les tests manuels / debug
      _internal: { normalize, isAnswerCorrect, computeScore },
    };
  }

  window.GameEngine = createGameEngine();
})();
