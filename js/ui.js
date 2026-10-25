// Tout le rendu DOM / manipulation d'écran vit ici. Pas de logique réseau ou
// de score — ui.js se contente d'afficher ce qu'on lui donne et de relayer
// les interactions (clics, saisie) via des callbacks.
(function () {
  const $ = (id) => document.getElementById(id);
  let timerInterval = null;
  let activeAnswer = null; // { input, button, status, locked }

  function showScreen(name) {
    document.querySelectorAll(".screen").forEach((el) => el.classList.remove("active"));
    $("screen-" + name).classList.add("active");
  }

  function toast(message, duration) {
    const el = $("toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(el._hideTimeout);
    el._hideTimeout = setTimeout(() => el.classList.remove("show"), duration || 2500);
  }

  function setHomeError(message) {
    $("home-error").textContent = message || "";
  }

  function initHomeTabs() {
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        const tabName = tab.dataset.tab;
        $("panel-create").style.display = tabName === "create" ? "block" : "none";
        $("panel-join").style.display = tabName === "join" ? "block" : "none";
        setHomeError("");
      });
    });
  }

  // Anime un nombre affiché dans `el` de `from` à `to` (ease-out), avec un
  // suffixe optionnel (ex : " pts"). Petite touche de "juice" réutilisée
  // partout où un score change sous les yeux du joueur.
  function animateNumber(el, from, to, duration, suffix) {
    suffix = suffix || "";
    if (from === to) {
      el.textContent = to + suffix;
      return;
    }
    const start = performance.now();
    function tick(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = Math.round(from + (to - from) * eased);
      el.textContent = value + suffix;
      if (t < 1) requestAnimationFrame(tick);
      else el.textContent = to + suffix;
    }
    requestAnimationFrame(tick);
  }

  function renderLobby(players, isHost, myId) {
    const list = $("lobby-players");
    list.innerHTML = "";
    players.forEach((p) => {
      const chip = document.createElement("div");
      chip.className = "player-chip" + (p.isHost ? " host" : "") + (p.id === myId ? " you" : "");
      chip.textContent = p.pseudo;
      list.appendChild(chip);
    });
    $("btn-start-game").style.display = isHost ? "block" : "none";
    $("lobby-hint").textContent = isHost
      ? "Lance la partie quand tout le monde est prêt."
      : "En attente que l'hôte démarre la partie…";
  }

  function setLobbyCode(code, isHost) {
    $("lobby-code").textContent = code;
    $("lobby-code-label").textContent = isHost
      ? "Code de la partie à partager"
      : "Tu as rejoint la partie";
  }

  function stopTimer() {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  function startTimer(seconds, onExpire) {
    stopTimer();
    const fill = $("timer-fill");
    fill.classList.remove("low");
    fill.style.width = "100%";
    const start = Date.now();
    const totalMs = seconds * 1000;
    let lastTickSecond = null;
    timerInterval = setInterval(() => {
      const elapsed = Date.now() - start;
      const remainingMs = Math.max(0, totalMs - elapsed);
      const ratio = Math.max(0, 1 - elapsed / totalMs);
      fill.style.width = ratio * 100 + "%";
      if (ratio <= 0.3) fill.classList.add("low");

      const remainingSecond = Math.ceil(remainingMs / 1000);
      if (remainingSecond <= 3 && remainingSecond >= 1 && remainingSecond !== lastTickSecond) {
        lastTickSecond = remainingSecond;
        window.Sound.playTick();
      }

      if (elapsed >= totalMs) {
        stopTimer();
        if (onExpire) onExpire();
      }
    }, 100);
  }

  function renderQuestion(payload, handlers) {
    $("question-progress").textContent = "Question " + (payload.index + 1) + "/" + payload.total;
    $("question-category").textContent = payload.category || "";
    $("question-text").textContent = payload.text;

    const img = $("question-image");
    if (payload.image) {
      img.src = payload.image;
      img.style.display = "block";
    } else {
      img.style.display = "none";
      img.removeAttribute("src");
    }

    const status = $("answer-status");
    status.style.display = "none";
    status.textContent = "";

    const input = $("libre-input");
    const button = $("btn-submit-libre");
    input.value = "";
    input.disabled = false;
    input.classList.remove("wrong-flash");
    input.focus();
    button.disabled = false;

    activeAnswer = { input, button, status, locked: false };

    const submit = () => {
      if (activeAnswer.locked) return;
      const value = input.value.trim();
      if (!value) return;
      handlers.onAnswer(value);
    };
    button.onclick = submit;
    input.onkeydown = (e) => {
      if (e.key === "Enter") submit();
    };

    startTimer(payload.timeLimit, () => {
      input.disabled = true;
      button.disabled = true;
    });

    window.Sound.playQuestionStart();
    showScreen("question");
  }

  function spawnFloatingPoints(gained) {
    const wrap = document.querySelector(".answer-field-wrap");
    if (!wrap) return;
    const el = document.createElement("div");
    el.className = "floating-points";
    el.textContent = "+" + gained;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 950);
  }

  // Appelé dès que l'hôte a jugé une tentative (bonne ou mauvaise), avant même
  // la correction finale : une bonne réponse verrouille le champ et crédite
  // les points tout de suite, une mauvaise réponse vide juste le champ pour
  // retenter (le chrono, lui, continue de tourner).
  function handleAnswerResult(result) {
    if (!activeAnswer) return;
    const { input, button, status } = activeAnswer;
    if (result.correct) {
      activeAnswer.locked = true;
      input.disabled = true;
      input.classList.remove("wrong-flash");
      button.disabled = true;
      status.textContent = "✅ Bonne réponse ! +" + result.gained + " points — en attente des autres joueurs…";
      status.style.display = "block";
      window.Sound.playCorrect();
      spawnFloatingPoints(result.gained);
    } else {
      input.value = "";
      input.disabled = false;
      button.disabled = false;
      input.focus();
      input.classList.remove("wrong-flash");
      // force le redémarrage de l'animation même si elle vient de jouer
      void input.offsetWidth;
      input.classList.add("wrong-flash");
      window.Sound.playWrong();
      const card = $("question-card");
      card.classList.remove("shake-hard");
      void card.offsetWidth;
      card.classList.add("shake-hard");
    }
  }

  function buildStreakBadge(streak) {
    if (!streak || streak < 2) return null;
    const badge = document.createElement("span");
    badge.className = "streak-badge";
    badge.textContent = "🔥 x" + streak;
    return badge;
  }

  // Tableau des scores affiché à droite pendant la question : qui a trouvé,
  // qui tâtonne encore (avec sa dernière tentative fausse), classé par score.
  // Anime les scores qui changent et flashe la ligne dont le statut vient de
  // bouger (y compris pour les AUTRES joueurs, pour l'effet "en direct").
  function renderScoreboard(players, myId) {
    const container = $("live-scoreboard");
    const previous = {};
    container.querySelectorAll(".score-row").forEach((row) => {
      previous[row.dataset.playerId] = {
        score: parseInt(row.dataset.score || "0", 10),
        status: row.dataset.status || "none",
      };
    });
    container.innerHTML = "";

    players.forEach((p) => {
      const prev = previous[p.id];
      const row = document.createElement("div");
      row.className = "score-row " + p.status + (p.id === myId ? " you" : "");
      row.dataset.playerId = p.id;
      row.dataset.score = p.score;
      row.dataset.status = p.status;

      let statusText;
      if (p.status === "correct") statusText = "✅ A trouvé !";
      else if (p.status === "wrong") statusText = "« " + p.lastWrongAnswer + " »";
      else statusText = "en réflexion…";

      const top = document.createElement("div");
      top.className = "score-row-top";
      const name = document.createElement("span");
      name.className = "score-row-name";
      name.textContent = p.pseudo;
      const badge = buildStreakBadge(p.streak);
      if (badge) name.appendChild(badge);
      const points = document.createElement("span");
      points.className = "score-row-points";
      top.appendChild(name);
      top.appendChild(points);

      const status = document.createElement("div");
      status.className = "score-row-status";
      status.textContent = statusText;

      row.appendChild(top);
      row.appendChild(status);
      container.appendChild(row);

      if (prev && prev.score !== p.score) {
        animateNumber(points, prev.score, p.score, 500, " pts");
      } else {
        points.textContent = p.score + " pts";
      }
      if (prev && prev.status !== p.status) {
        row.classList.add("just-updated");
      }
    });
  }

  function renderReveal(payload, myId) {
    stopTimer();
    activeAnswer = null;
    const banner = $("reveal-banner");
    const mine = payload.results.find((r) => r.id === myId);
    let bannerClass, bannerText;
    if (mine && mine.correct) {
      bannerClass = "reveal-banner correct";
      bannerText = "✅ Bonne réponse ! +" + mine.gained + " points";
    } else if (mine && mine.answered) {
      bannerClass = "reveal-banner incorrect";
      bannerText = "❌ Mauvaise réponse (tu as répondu « " + mine.submitted + " »)";
    } else {
      bannerClass = "reveal-banner incorrect";
      bannerText = "⏱️ Temps écoulé, pas de réponse";
    }
    // repart de zéro pour relancer l'animation "pop" à chaque question
    banner.className = "";
    void banner.offsetWidth;
    banner.className = bannerClass;
    banner.textContent = bannerText;

    const correctText = $("reveal-correct-answer");
    correctText.textContent = "Réponse(s) acceptée(s) : " + payload.acceptableAnswers.join(", ");

    renderLeaderboardInto($("reveal-leaderboard"), payload.leaderboard, myId);
    window.Sound.playReveal();
    showScreen("reveal");
  }

  function renderLeaderboardInto(container, leaderboard, myId) {
    const previous = {};
    container.querySelectorAll(".leaderboard-row").forEach((row) => {
      previous[row.dataset.playerId] = parseInt(row.dataset.score || "0", 10);
    });
    container.innerHTML = "";

    leaderboard.forEach((p, i) => {
      const row = document.createElement("div");
      row.className = "leaderboard-row" + (p.id === myId ? " you" : "");
      row.dataset.playerId = p.id;
      row.dataset.score = p.score;

      const rank = document.createElement("span");
      rank.className = "rank";
      rank.textContent = "#" + (i + 1);

      const name = document.createElement("span");
      name.className = "name";
      name.textContent = p.pseudo;
      const badge = buildStreakBadge(p.streak);
      if (badge) name.appendChild(badge);

      const score = document.createElement("span");
      score.className = "score";

      row.appendChild(rank);
      row.appendChild(name);
      row.appendChild(score);
      container.appendChild(row);

      const prev = previous[p.id];
      if (prev !== undefined && prev !== p.score) {
        animateNumber(score, prev, p.score, 500, "");
      } else {
        score.textContent = p.score;
      }
    });
  }

  function renderEnd(payload, myId) {
    const podium = $("end-podium");
    podium.innerHTML = "";
    const order = ["silver", "gold", "bronze"]; // ordre visuel : 2e, 1er, 3e
    const top3 = payload.leaderboard.slice(0, 3);
    const byRank = { gold: top3[0], silver: top3[1], bronze: top3[2] };
    const medal = { gold: "🥇", silver: "🥈", bronze: "🥉" };
    const targetHeight = { gold: 130, silver: 95, bronze: 70 };
    const stagger = { silver: 0, gold: 180, bronze: 360 };

    const bars = [];
    order.forEach((rank) => {
      const p = byRank[rank];
      if (!p) return;
      const step = document.createElement("div");
      step.className = "podium-step " + rank;

      const medalEl = document.createElement("div");
      medalEl.className = "medal";
      medalEl.textContent = medal[rank];

      const bar = document.createElement("div");
      bar.className = "bar";
      bar.style.height = "0px";
      bar.textContent = p.score;

      const name = document.createElement("div");
      name.className = "name";
      name.textContent = p.pseudo;

      step.appendChild(medalEl);
      step.appendChild(bar);
      step.appendChild(name);
      podium.appendChild(step);

      bars.push({ bar, height: targetHeight[rank], delay: stagger[rank] });
    });

    // Force un premier rendu à hauteur 0 avant de déclencher la transition
    // CSS vers la hauteur finale, en escalier (argent, puis or, puis bronze).
    requestAnimationFrame(() => {
      bars.forEach(({ bar, height, delay }) => {
        setTimeout(() => {
          bar.style.height = height + "px";
        }, delay);
      });
    });

    renderLeaderboardInto($("end-leaderboard"), payload.leaderboard, myId);
    showScreen("end");

    window.Sound.playVictory();
    window.Confetti.burst();
  }

  window.UI = {
    showScreen,
    toast,
    setHomeError,
    initHomeTabs,
    renderLobby,
    setLobbyCode,
    renderQuestion,
    handleAnswerResult,
    renderScoreboard,
    renderReveal,
    renderEnd,
    stopTimer,
  };
})();
