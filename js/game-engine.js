// Machine à états du jeu + calcul des scores.
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

  function normalize(str) {
    return (str || "")
      .toString()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .trim()
      .replace(/\s+/g, " ");
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
    if (len <= 4) return 0;
    if (len <= 8) return 1;
    return 2;
  }

  function isLibreAnswerCorrect(submitted, acceptableAnswers) {
    const normSubmitted = normalize(submitted);
    if (!normSubmitted) return false;
    const tolerance = fuzzyTolerance(normSubmitted.length);
    return (acceptableAnswers || []).some((accepted) => {
      const normAccepted = normalize(accepted);
      if (tolerance === 0) return normSubmitted === normAccepted;
      return levenshtein(normSubmitted, normAccepted) <= tolerance;
    });
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
        qtype: q.type,
        text: q.question,
        image: q.image || null,
        choices: q.type === "qcm" ? q.choices : null,
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
          if (q.type === "qcm") {
            correct = entry.answer === q.correctIndex;
          } else {
            correct = isLibreAnswerCorrect(entry.answer, q.acceptableAnswers);
          }
          if (correct) gained = computeScore(q.points, q.timeLimit, entry.elapsedMs);
        }
        player.score += gained;
        results.push({
          id: peerId,
          pseudo: player.pseudo,
          answered: !!entry,
          correct,
          gained,
          totalScore: player.score,
        });
      });

      const payload = {
        type: MSG.REVEAL,
        index: currentIndex,
        qtype: q.type,
        correctIndex: q.type === "qcm" ? q.correctIndex : null,
        acceptableAnswers: q.type === "libre" ? q.acceptableAnswers : null,
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
      // exposés pour les tests unitaires manuels / debug
      _internal: { normalize, levenshtein, isLibreAnswerCorrect, computeScore },
    };
  }

  window.GameEngine = createGameEngine();
})();
