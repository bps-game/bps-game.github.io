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
    timerInterval = setInterval(() => {
      const elapsed = Date.now() - start;
      const ratio = Math.max(0, 1 - elapsed / totalMs);
      fill.style.width = ratio * 100 + "%";
      if (ratio <= 0.3) fill.classList.add("low");
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

    showScreen("question");
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
    } else {
      input.value = "";
      input.disabled = false;
      button.disabled = false;
      input.focus();
      input.classList.remove("wrong-flash");
      // force le redémarrage de l'animation même si elle vient de jouer
      void input.offsetWidth;
      input.classList.add("wrong-flash");
    }
  }

  // Tableau des scores affiché à droite pendant la question : qui a trouvé,
  // qui tâtonne encore (avec sa dernière tentative fausse), classé par score.
  function renderScoreboard(players, myId) {
    const container = $("live-scoreboard");
    container.innerHTML = "";
    players.forEach((p) => {
      const row = document.createElement("div");
      row.className = "score-row " + p.status + (p.id === myId ? " you" : "");

      let statusText;
      if (p.status === "correct") {
        statusText = "✅ A trouvé !";
      } else if (p.status === "wrong") {
        statusText = "« " + p.lastWrongAnswer + " »";
      } else {
        statusText = "en réflexion…";
      }

      const top = document.createElement("div");
      top.className = "score-row-top";
      const name = document.createElement("span");
      name.className = "score-row-name";
      name.textContent = p.pseudo;
      const points = document.createElement("span");
      points.className = "score-row-points";
      points.textContent = p.score + " pts";
      top.appendChild(name);
      top.appendChild(points);

      const status = document.createElement("div");
      status.className = "score-row-status";
      status.textContent = statusText;

      row.appendChild(top);
      row.appendChild(status);
      container.appendChild(row);
    });
  }

  function renderReveal(payload, myId) {
    stopTimer();
    activeAnswer = null;
    const banner = $("reveal-banner");
    const mine = payload.results.find((r) => r.id === myId);
    if (mine && mine.correct) {
      banner.className = "reveal-banner correct";
      banner.textContent = "✅ Bonne réponse ! +" + mine.gained + " points";
    } else if (mine && mine.answered) {
      banner.className = "reveal-banner incorrect";
      banner.textContent = "❌ Mauvaise réponse (tu as répondu « " + mine.submitted + " »)";
    } else {
      banner.className = "reveal-banner incorrect";
      banner.textContent = "⏱️ Temps écoulé, pas de réponse";
    }

    const correctText = $("reveal-correct-answer");
    correctText.textContent = "Réponse(s) acceptée(s) : " + payload.acceptableAnswers.join(", ");

    renderLeaderboardInto($("reveal-leaderboard"), payload.leaderboard, myId, true);
    showScreen("reveal");
  }

  function renderLeaderboardInto(container, leaderboard, myId, showDelta) {
    container.innerHTML = "";
    leaderboard.forEach((p, i) => {
      const row = document.createElement("div");
      row.className = "leaderboard-row" + (p.id === myId ? " you" : "");
      row.innerHTML =
        '<span class="rank">#' +
        (i + 1) +
        '</span><span class="name">' +
        escapeHtml(p.pseudo) +
        '</span><span class="score">' +
        p.score +
        "</span>";
      container.appendChild(row);
    });
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function renderEnd(payload, myId) {
    const podium = $("end-podium");
    podium.innerHTML = "";
    const order = ["silver", "gold", "bronze"]; // ordre visuel : 2e, 1er, 3e
    const top3 = payload.leaderboard.slice(0, 3);
    const byRank = { gold: top3[0], silver: top3[1], bronze: top3[2] };
    const medal = { gold: "🥇", silver: "🥈", bronze: "🥉" };

    order.forEach((rank) => {
      const p = byRank[rank];
      if (!p) return;
      const step = document.createElement("div");
      step.className = "podium-step " + rank;
      step.innerHTML =
        '<div class="medal">' +
        medal[rank] +
        '</div><div class="bar">' +
        p.score +
        '</div><div class="name">' +
        escapeHtml(p.pseudo) +
        "</div>";
      podium.appendChild(step);
    });

    renderLeaderboardInto($("end-leaderboard"), payload.leaderboard, myId, false);
    showScreen("end");
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
