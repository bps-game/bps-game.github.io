// Machine à états du jeu + correction des réponses libres + calcul des scores.
// L'hôte (celui qui a créé la salle) fait tourner toute la logique et diffuse
// l'état ; les autres joueurs ne font qu'afficher ce qu'ils reçoivent et
// renvoyer leurs réponses à l'hôte. Cela évite tout besoin de serveur.
(function () {
  const MSG = {
    JOIN: "JOIN",
    LOBBY_UPDATE: "LOBBY_UPDATE",
    QUESTION: "QUESTION",
    REVEAL: "REVEAL",
    GAME_END: "GAME_END",
    ANSWER: "ANSWER",
  };

  const REVEAL_DURATION_MS = 6000;

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
      .replace(/[̀-ͯ]/g, "") // accents
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

  function computeScore(basePoints, timeLimitSeconds, elapsedMs) {
    const elapsedSeconds = elapsedMs / 1000;
    const ratio = Math.min(1, Math.max(0, elapsedSeconds / timeLimitSeconds));
    const factor = 1 - ratio * 0.5; // 100% des points si instantané, 50% si pile dans les temps
    return Math.round(basePoints * factor);
  }

  function createGameEngine() {
    let role = null;
    let questions = [];
    let currentIndex = -1;
    let questionTimer = null;
    let revealTimer = null;
    let questionStartedAt = 0;
    let currentAnswers = new Map(); // peerId -> { answer, elapsedMs }

    // players: peerId -> { id, pseudo, score, isHost }
    const players = new Map();

    const callbacks = {
      lobbyUpdate: null,
      question: null,
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
      const payload = { type: MSG.LOBBY_UPDATE, players: playersArray() };
      window.Network.broadcast(payload);
      if (callbacks.lobbyUpdate) callbacks.lobbyUpdate(playersArray());
    }

    // ---------- Rôle hôte ----------

    function hostInit(myId, myPseudo) {
      role = "host";
      players.clear();
      players.set(myId, { id: myId, pseudo: myPseudo, score: 0, isHost: true });
    }

    function hostAddPlayer(peerId, pseudo) {
      if (players.has(peerId)) return;
      players.set(peerId, { id: peerId, pseudo: pseudo || "Joueur", score: 0, isHost: false });
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
        hostEndGame();
        return;
      }
      currentAnswers = new Map();
      questionStartedAt = Date.now();
      const q = questions[currentIndex];
      const payload = {
        type: MSG.QUESTION,
        index: currentIndex,
        total: questions.length,
        category: q.category,
        text: q.question,
        image: q.image || null,
        timeLimit: q.timeLimit,
      };
      window.Network.broadcast(payload);
      if (callbacks.question) callbacks.question(payload);
      questionTimer = setTimeout(() => hostRevealAnswer(), q.timeLimit * 1000 + 300);
    }

    function hostRecordAnswer(peerId, answer) {
      if (currentAnswers.has(peerId)) return; // une seule réponse comptée par joueur
      const elapsedMs = Date.now() - questionStartedAt;
      currentAnswers.set(peerId, { answer, elapsedMs });
      if (currentAnswers.size >= players.size) {
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
        let correct = false;
        let gained = 0;
        if (entry) {
          correct = isAnswerCorrect(entry.answer, q.acceptableAnswers);
          if (correct) gained = computeScore(q.points, q.timeLimit, entry.elapsedMs);
        }
        player.score += gained;
        results.push({
          id: peerId,
          pseudo: player.pseudo,
          answered: !!entry,
          submitted: entry ? entry.answer : null,
          correct,
          gained,
          totalScore: player.score,
        });
      });

      const payload = {
        type: MSG.REVEAL,
        index: currentIndex,
        acceptableAnswers: q.acceptableAnswers,
        results,
        leaderboard: sortedLeaderboard(),
      };
      window.Network.broadcast(payload);
      if (callbacks.reveal) callbacks.reveal(payload);

      revealTimer = setTimeout(() => hostNextQuestion(), REVEAL_DURATION_MS);
    }

    function hostEndGame() {
      const payload = { type: MSG.GAME_END, leaderboard: sortedLeaderboard() };
      window.Network.broadcast(payload);
      if (callbacks.gameEnd) callbacks.gameEnd(payload);
    }

    // ---------- Rôle client ----------

    function clientHandleMessage(data) {
      if (data.type === MSG.LOBBY_UPDATE) {
        players.clear();
        data.players.forEach((p) => players.set(p.id, p));
        if (callbacks.lobbyUpdate) callbacks.lobbyUpdate(data.players);
      } else if (data.type === MSG.QUESTION) {
        if (callbacks.question) callbacks.question(data);
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
      hostRecordAnswer,
      clientHandleMessage,
      getPlayers: playersArray,
      getRole: () => role,
      getCurrentIndex: () => currentIndex,
      // exposés pour les tests manuels / debug
      _internal: { normalize, levenshtein, isAnswerCorrect, computeScore },
    };
  }

  window.GameEngine = createGameEngine();
})();
