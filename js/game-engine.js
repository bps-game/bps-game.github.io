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
  // réponse est acceptée si elle correspond à l'une des `acceptableAnswers`
  // de la question, selon plusieurs stratégies cumulées :
  //  1. Égalité exacte après normalisation (accents/casse/ponctuation).
  //  2. Tolérance aux fautes de frappe (distance de Levenshtein, proportionnelle
  //     à la longueur du texte).
  //  3. Titre partiel : un sous-titre ou une forme raccourcie est accepté dès
  //     lors qu'il correspond à une suite de mots CONTIGUË de la réponse
  //     complète (ex : "Tears of the Kingdom" dans "The Legend of Zelda:
  //     Tears of the Kingdom"), dans un sens comme dans l'autre.
  //  4. Acronymes/sigles : les initiales de n'importe quelle suite d'au moins
  //     3 mots consécutifs de la réponse sont acceptées (ex : "TOTK").
  //
  // Résultat concret : il suffit en général de renseigner le titre complet
  // dans `acceptableAnswers` pour que les formes raccourcies et les sigles
  // les plus courants soient reconnus automatiquement.

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

  function levenshtein(a, b) {
    const m = a.length;
    const n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] =
          a[i - 1] === b[j - 1]
            ? dp[i - 1][j - 1]
            : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[m][n];
  }

  function fuzzyTolerance(len) {
    if (len <= 3) return 0;
    if (len <= 7) return 1;
    if (len <= 15) return 2;
    return 3;
  }

  // Suite de mots contiguë, avec tolérance aux fautes de frappe : on cherche,
  // parmi toutes les suites de mots contiguës de la plus longue réponse (de
  // longueur proche de la plus courte), celle qui est la plus proche
  // (distance de Levenshtein) de la réponse la plus courte. Couvre à la fois
  // "titre partiel" (distance 0) et "faute de frappe dans un titre partiel".
  // L'écart de longueur est plafonné pour éviter qu'une réponse interminable
  // ne valide tout par simple inclusion.
  function bestWordRunDistance(shorterWords, longerWords) {
    const shorterStr = shorterWords.join(" ");
    const minLen = Math.max(1, shorterWords.length - 1);
    const maxLen = Math.min(longerWords.length, shorterWords.length + 2);
    let best = Infinity;
    for (let len = minLen; len <= maxLen; len++) {
      for (let start = 0; start + len <= longerWords.length; start++) {
        const run = longerWords.slice(start, start + len).join(" ");
        const d = levenshtein(shorterStr, run);
        if (d < best) best = d;
      }
    }
    return best;
  }

  function matchesContiguousSubset(subWords, accWords) {
    if (subWords.length < 2 || accWords.length < 2) return false;
    const shorter = subWords.length <= accWords.length ? subWords : accWords;
    const longer = subWords.length <= accWords.length ? accWords : subWords;
    if (longer.length - shorter.length > 5) return false;
    const tolerance = fuzzyTolerance(shorter.join(" ").length);
    return bestWordRunDistance(shorter, longer) <= tolerance;
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

    const tolerance = fuzzyTolerance(Math.max(submittedNorm.length, acceptedNorm.length));
    if (levenshtein(submittedNorm, acceptedNorm) <= tolerance) return true;

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
      const payload = { type: MSG.LOBBY_UPDATE, players: playersArray(), winScore };
      window.Network.broadcast(payload);
      if (callbacks.lobbyUpdate) callbacks.lobbyUpdate(playersArray(), winScore);
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
      players.clear();
      players.set(myId, { id: myId, pseudo: myPseudo, score: 0, streak: 0, isHost: true });
    }

    // Réglable uniquement depuis le lobby, avant le lancement de la partie.
    function hostSetWinScore(value) {
      if (currentIndex !== -1) return; // partie déjà lancée : on n'y touche plus
      winScore = Math.max(1, Math.round(Number(value) || DEFAULT_WIN_SCORE));
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

    function hostStartGame(loadedQuestions) {
      questions = loadedQuestions;
      currentIndex = -1;
      hostNextQuestion();
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
        timeLimit: q.timeLimit,
        winScore,
      };
      window.Network.broadcast(payload);
      if (callbacks.question) callbacks.question(payload);
      broadcastLiveStatus();
      questionTimer = setTimeout(() => hostRevealAnswer(), q.timeLimit * 1000 + 300);
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
        if (callbacks.lobbyUpdate) callbacks.lobbyUpdate(data.players, winScore);
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
      hostHandleAttempt,
      clientHandleMessage,
      getPlayers: playersArray,
      getRole: () => role,
      getCurrentIndex: () => currentIndex,
      getWinScore: () => winScore,
      // exposés pour les tests manuels / debug
      _internal: { normalize, levenshtein, isAnswerCorrect, computeScore },
    };
  }

  window.GameEngine = createGameEngine();
})();
