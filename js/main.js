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

  function init() {
    UI.initHomeTabs();
    wireHomeScreen();
    wireLobbyScreen();
    wireEndScreen();
    wireMuteButton();
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
      const pseudo = document.getElementById("create-pseudo").value.trim();
      if (!pseudo) {
        UI.setHomeError("Choisis un pseudo avant de créer une partie.");
        return;
      }
      UI.setHomeError("");
      createBtn.disabled = true;
      createBtn.textContent = "Création de la salle…";

      Network.createRoom(
        (code) => {
          role = "host";
          myId = Network.getMyId();
          myPseudo = pseudo;
          GameEngine.hostInit(myId, myPseudo);
          UI.setLobbyCode(code, true);
          UI.renderLobby(GameEngine.getPlayers(), true, myId);
          UI.showScreen("lobby");
          createBtn.disabled = false;
          createBtn.textContent = "Créer la partie";
        },
        (err) => {
          createBtn.disabled = false;
          createBtn.textContent = "Créer la partie";
          UI.setHomeError("Impossible de créer la salle (" + describeError(err) + ").");
        }
      );
    });

    joinBtn.addEventListener("click", () => {
      const pseudo = document.getElementById("join-pseudo").value.trim();
      const code = document.getElementById("join-code").value.trim();
      if (!pseudo) {
        UI.setHomeError("Choisis un pseudo avant de rejoindre.");
        return;
      }
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
          myPseudo = pseudo;
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

  function describeError(err) {
    if (!err) return "erreur inconnue";
    if (err.type === "peer-unavailable") return "code introuvable";
    if (err.type === "unavailable-id") return "code déjà pris, réessaie";
    return err.type || err.message || "erreur inconnue";
  }

  function wireLobbyScreen() {
    document.getElementById("btn-start-game").addEventListener("click", async () => {
      const btn = document.getElementById("btn-start-game");
      btn.disabled = true;
      btn.textContent = "Chargement des questions…";
      try {
        const all = await window.Questions.load();
        const prepared = window.Questions.shuffle(all);
        GameEngine.hostStartGame(prepared);
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
    GameEngine.on("lobbyUpdate", (players) => {
      UI.renderLobby(players, role === "host", myId);
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
