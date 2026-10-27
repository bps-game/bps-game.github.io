// Point d'entrée : branche les boutons de l'interface au réseau (PeerJS) et
// au moteur de jeu. C'est le seul fichier qui connaît à la fois l'UI, le
// réseau et le moteur de jeu.
(function () {
  const Network = window.Network;
  const GameEngine = window.GameEngine;
  const UI = window.UI;

  let role = null; // "host" | "client"
  let myId = null;
  let myPseudo = null;
  let cachedQuestions = null; // questions chargées à la création de la salle (hôte), réutilisées au démarrage

  function init() {
    UI.initHomeTabs();
    wireHomeScreen();
    wireLobbyScreen();
    wireEndScreen();
    wireMuteButton();
    wireChat();
    wireNetwork();
    wireGameEngine();
  }

  function wireMuteButton() {
    const btn = document.getElementById("btn-mute");
    const sync = () => {
      btn.textContent = window.Sound.isMuted() ? "🔇" : "🔊";
    };
    sync();
    btn.addEventListener("click", () => {
      window.Sound.toggleMuted();
      sync();
    });
  }

  function wireHomeScreen() {
    const createBtn = document.getElementById("btn-create-room");
    const joinBtn = document.getElementById("btn-join-room");

    createBtn.addEventListener("click", () => {
      UI.setHomeError("");
      createBtn.disabled = true;
      createBtn.textContent = "Création de la salle…";

      Network.createRoom(
        (code) => {
          role = "host";
          myId = Network.getMyId();
          myPseudo = currentPseudo();
          GameEngine.hostInit(myId, myPseudo);
          UI.setLobbyCode(code, true);
          UI.renderLobby(GameEngine.getPlayers(), true, myId, GameEngine.getWinScore(), GameEngine.getTimeLimit());
          UI.showScreen("lobby");
          createBtn.disabled = false;
          createBtn.textContent = "Créer la partie";
          loadCategoriesForLobby();
        },
        (err) => {
          createBtn.disabled = false;
          createBtn.textContent = "Créer la partie";
          UI.setHomeError("Impossible de créer la salle (" + describeError(err) + ").");
        }
      );
    });

    joinBtn.addEventListener("click", () => {
      const code = document.getElementById("join-code").value.trim();
      if (!code) {
        UI.setHomeError("Entre le code de la partie à rejoindre.");
        return;
      }
      UI.setHomeError("");
      joinBtn.disabled = true;
      joinBtn.textContent = "Connexion…";

      Network.joinRoom(
        code,
        () => {
          role = "client";
          myId = Network.getMyId();
          myPseudo = currentPseudo();
          Network.sendToHost({ type: GameEngine.MSG.JOIN, pseudo: myPseudo });
          UI.setLobbyCode(code.trim().toUpperCase(), false);
          UI.renderLobby([{ id: myId, pseudo: myPseudo, score: 0, isHost: false }], false, myId);
          UI.showScreen("lobby");
          joinBtn.disabled = false;
          joinBtn.textContent = "Rejoindre";
        },
        (err) => {
          joinBtn.disabled = false;
          joinBtn.textContent = "Rejoindre";
          UI.setHomeError("Impossible de rejoindre (" + describeError(err) + "). Vérifie le code.");
        }
      );
    });
  }

  // Pseudo de jeu : celui du compte Google connecté (choisi dans le widget
  // d'accueil), ou un "Newbie-XXXXX" aléatoire si personne n'est connecté —
  // il n'y a plus de champ pseudo à remplir avant de jouer. Repli local au
  // cas où account-widget.js n'aurait pas pu se charger (ex : Firebase
  // injoignable) : le jeu P2P reste jouable sans compte dans tous les cas.
  function fallbackPseudo() {
    const n = Math.floor(Math.random() * 100000);
    return "Newbie-" + String(n).padStart(5, "0");
  }

  function currentPseudo() {
    return (window.AccountIdentity && window.AccountIdentity.getPseudo()) || fallbackPseudo();
  }

  function describeError(err) {
    if (!err) return "erreur inconnue";
    if (err.type === "peer-unavailable") return "code introuvable";
    if (err.type === "unavailable-id") return "code déjà pris, réessaie";
    return err.type || err.message || "erreur inconnue";
  }

  // Chat de partie : l'hôte fait toujours autorité sur la diffusion (les
  // joueurs ne se connaissent qu'à travers lui, topologie en étoile), comme
  // pour le reste du jeu — il n'a pas besoin de passer par le moteur de jeu,
  // ça n'affecte ni score ni déroulé de la partie.
  function wireChat() {
    const input = document.getElementById("chat-input");
    const btn = document.getElementById("btn-chat-send");
    if (!input || !btn) return;

    const submit = () => {
      const text = input.value.trim();
      if (!text) return;
      sendChatMessage(text);
      input.value = "";
    };
    btn.addEventListener("click", submit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") submit();
    });
  }

  function sendChatMessage(text) {
    if (role === "host") {
      const entry = { id: myId, pseudo: myPseudo, text, ts: Date.now() };
      Network.broadcast({ type: GameEngine.MSG.CHAT, entry });
      UI.addChatMessage(entry, myId);
    } else {
      Network.sendToHost({ type: GameEngine.MSG.CHAT, text });
    }
  }

  // L'hôte reçoit le texte brut d'un joueur, l'associe à son pseudo connu et
  // le redistribue à tout le monde (y compris lui-même, localement) ; les
  // joueurs ne font qu'afficher l'entrée déjà complète reçue de l'hôte.
  function handleChatMessage(fromPeerId, data) {
    if (role === "host") {
      const player = GameEngine.getPlayers().find((p) => p.id === fromPeerId);
      const entry = { id: fromPeerId, pseudo: player ? player.pseudo : "Joueur", text: data.text, ts: Date.now() };
      Network.broadcast({ type: GameEngine.MSG.CHAT, entry });
      UI.addChatMessage(entry, myId);
    } else {
      UI.addChatMessage(data.entry, myId);
    }
  }

  // Charge les questions dès la création de la salle (hôte uniquement) pour
  // en tirer la liste des catégories affichées dans le lobby — réutilisée
  // (sans rechargement) au clic sur "Démarrer la partie".
  async function loadCategoriesForLobby() {
    try {
      cachedQuestions = await window.Questions.load();
      const categories = Array.from(new Set(cachedQuestions.map((q) => q.category).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, "fr")
      );
      UI.buildCategoryPicker(categories, (selected) => GameEngine.hostSetCategories(selected));
    } catch (err) {
      // Pas grave : la sélection de catégories reste vide (= toutes), et le
      // chargement sera retenté au clic sur "Démarrer la partie".
    }
  }

  function wireLobbyScreen() {
    document.getElementById("win-score-input").addEventListener("change", (e) => {
      GameEngine.hostSetWinScore(e.target.value);
    });

    document.getElementById("time-limit-input").addEventListener("change", (e) => {
      GameEngine.hostSetTimeLimit(e.target.value);
    });

    document.getElementById("btn-start-game").addEventListener("click", async () => {
      const btn = document.getElementById("btn-start-game");
      btn.disabled = true;
      btn.textContent = "Chargement des questions…";
      try {
        const all = cachedQuestions || (await window.Questions.load());
        const prepared = window.Questions.shuffle(all);
        const started = GameEngine.hostStartGame(prepared);
        if (!started) {
          UI.toast("Aucune question dans les catégories choisies.");
          btn.disabled = false;
          btn.textContent = "Démarrer la partie";
        }
      } catch (err) {
        UI.toast("Erreur de chargement des questions : " + err.message);
        btn.disabled = false;
        btn.textContent = "Démarrer la partie";
      }
    });
  }

  function wireEndScreen() {
    document.getElementById("btn-restart").addEventListener("click", () => {
      window.location.reload();
    });
  }

  function wireNetwork() {
    Network.onMessage((fromPeerId, data) => {
      if (data.type === GameEngine.MSG.CHAT) {
        handleChatMessage(fromPeerId, data);
        return;
      }
      if (role === "host") {
        if (data.type === GameEngine.MSG.JOIN) {
          GameEngine.hostAddPlayer(fromPeerId, data.pseudo);
        } else if (data.type === GameEngine.MSG.ANSWER) {
          GameEngine.hostHandleAttempt(fromPeerId, data.answer);
        }
      } else {
        GameEngine.clientHandleMessage(data);
      }
    });

    Network.onPeerLeave((peerId) => {
      if (role === "host") {
        GameEngine.hostRemovePlayer(peerId);
        UI.toast("Un joueur a quitté la partie.");
      }
    });

    Network.onError((err) => {
      console.error("Network error:", err);
    });

    Network.onDisconnected(() => {
      UI.toast("Connexion perdue avec le serveur de signalisation.");
    });
  }

  function wireGameEngine() {
    GameEngine.on("lobbyUpdate", (players, winScore, timeLimit, selectedCategories) => {
      UI.renderLobby(players, role === "host", myId, winScore, timeLimit, selectedCategories);
    });

    GameEngine.on("question", (payload) => {
      UI.renderQuestion(payload, {
        onAnswer: (answer) => {
          if (role === "host") {
            GameEngine.hostHandleAttempt(myId, answer);
          } else {
            Network.sendToHost({ type: GameEngine.MSG.ANSWER, index: payload.index, answer });
          }
        },
      });
    });

    GameEngine.on("answerResult", (payload) => {
      UI.handleAnswerResult(payload);
    });

    GameEngine.on("liveStatus", (payload) => {
      UI.renderScoreboard(payload.players, myId);
    });

    GameEngine.on("reveal", (payload) => {
      UI.renderReveal(payload, myId);
    });

    GameEngine.on("gameEnd", (payload) => {
      UI.renderEnd(payload, myId);
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
