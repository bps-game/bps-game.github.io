// Tout le rendu DOM / manipulation d'écran vit ici. Pas de logique réseau ou
// de score — ui.js se contente d'afficher ce qu'on lui donne et de relayer
// les interactions (clics, saisie) via des callbacks.
(function () {
  const $ = (id) => document.getElementById(id);
  let timerInterval = null;

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

    const qcmArea = $("qcm-area");
    const libreArea = $("libre-area");
    const status = $("answer-status");
    status.style.display = "none";
    status.textContent = "";

    if (payload.qtype === "qcm") {
      qcmArea.style.display = "grid";
      libreArea.style.display = "none";
      qcmArea.innerHTML = "";
      payload.choices.forEach((choiceText, index) => {
        const btn = document.createElement("button");
        btn.className = "choice-btn";
        btn.textContent = choiceText;
        btn.addEventListener("click", () => {
          if (btn.disabled) return;
          qcmArea.querySelectorAll(".choice-btn").forEach((b) => (b.disabled = true));
          btn.classList.add("selected");
          showAnswered();
          handlers.onAnswer(index);
        });
        qcmArea.appendChild(btn);
      });
    } else {
      qcmArea.style.display = "none";
      libreArea.style.display = "block";
      const input = $("libre-input");
      input.value = "";
      input.disabled = false;
      $("btn-submit-libre").disabled = false;
      const submit = () => {
        const value = input.value.trim();
        if (!value) return;
        input.disabled = true;
        $("btn-submit-libre").disabled = true;
        showAnswered();
        handlers.onAnswer(value);
      };
      $("btn-submit-libre").onclick = submit;
      input.onkeydown = (e) => {
        if (e.key === "Enter") submit();
      };
    }

    startTimer(payload.timeLimit, () => {
      qcmArea.querySelectorAll(".choice-btn").forEach((b) => (b.disabled = true));
      $("libre-input").disabled = true;
      $("btn-submit-libre").disabled = true;
    });

    showScreen("question");
  }

  function showAnswered() {
    const status = $("answer-status");
    status.textContent = "Réponse envoyée, en attente des autres joueurs…";
    status.style.display = "block";
  }

  function renderReveal(payload, myId) {
    stopTimer();
    const banner = $("reveal-banner");
    const mine = payload.results.find((r) => r.id === myId);
    if (mine && mine.correct) {
      banner.className = "reveal-banner correct";
      banner.textContent = "✅ Bonne réponse ! +" + mine.gained + " points";
    } else if (mine && mine.answered) {
      banner.className = "reveal-banner incorrect";
      banner.textContent = "❌ Mauvaise réponse";
    } else {
      banner.className = "reveal-banner incorrect";
      banner.textContent = "⏱️ Temps écoulé, pas de réponse";
    }

    const correctText = $("reveal-correct-answer");
    if (payload.qtype === "qcm" && typeof payload.correctIndex === "number") {
      correctText.textContent = "";
    } else if (payload.acceptableAnswers) {
      correctText.textContent = "Réponse(s) acceptée(s) : " + payload.acceptableAnswers.join(", ");
    } else {
      correctText.textContent = "";
    }

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
    renderReveal,
    renderEnd,
    stopTimer,
  };
})();
