// Fine couche au-dessus de PeerJS : gère la création/connexion des pairs WebRTC
// et expose une API simple (broadcast / send / onMessage) utilisée par game-engine.js.
// Topologie en étoile : l'hôte est connecté à chaque joueur, les joueurs ne se
// connaissent pas entre eux.
(function () {
  const ROOM_PREFIX = "BPS-";
  const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sans 0/O/1/I/L pour éviter les confusions

  function randomCode(length) {
    let code = "";
    for (let i = 0; i < length; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    return code;
  }

  function createNetwork() {
    let peer = null;
    let role = null; // "host" | "client"
    const connections = new Map(); // peerId -> DataConnection (hôte uniquement)
    let hostConnection = null; // DataConnection vers l'hôte (client uniquement)

    const messageHandlers = [];
    const peerJoinHandlers = [];
    const peerLeaveHandlers = [];
    const errorHandlers = [];
    const disconnectedHandlers = [];

    function wireConnection(conn, isHost) {
      conn.on("open", () => {
        if (isHost) connections.set(conn.peer, conn);
        peerJoinHandlers.forEach((fn) => fn(conn.peer));
      });
      conn.on("data", (data) => {
        messageHandlers.forEach((fn) => fn(conn.peer, data));
      });
      conn.on("close", () => {
        if (isHost) connections.delete(conn.peer);
        peerLeaveHandlers.forEach((fn) => fn(conn.peer));
      });
      conn.on("error", (err) => errorHandlers.forEach((fn) => fn(err)));
    }

    function createRoom(onReady, onFatalError, attempt) {
      attempt = attempt || 0;
      role = "host";
      const code = ROOM_PREFIX + randomCode(5);
      peer = new Peer(code);

      peer.on("open", () => onReady(code));
      peer.on("connection", (conn) => wireConnection(conn, true));
      peer.on("disconnected", () => disconnectedHandlers.forEach((fn) => fn()));
      peer.on("error", (err) => {
        if (err.type === "unavailable-id" && attempt < 3) {
          createRoom(onReady, onFatalError, attempt + 1);
          return;
        }
        errorHandlers.forEach((fn) => fn(err));
        if (onFatalError) onFatalError(err);
      });
    }

    function joinRoom(code, onOpen, onFatalError) {
      role = "client";
      peer = new Peer();
      peer.on("open", () => {
        const conn = peer.connect(code.trim().toUpperCase(), { reliable: true });
        hostConnection = conn;
        wireConnection(conn, false);
        conn.on("open", () => onOpen && onOpen());
      });
      peer.on("disconnected", () => disconnectedHandlers.forEach((fn) => fn()));
      peer.on("error", (err) => {
        errorHandlers.forEach((fn) => fn(err));
        if (onFatalError) onFatalError(err);
      });
    }

    function broadcast(data) {
      connections.forEach((conn) => {
        if (conn.open) conn.send(data);
      });
    }

    function sendToHost(data) {
      if (hostConnection && hostConnection.open) hostConnection.send(data);
    }

    // Envoi privé de l'hôte vers un seul joueur (réponse à une tentative).
    function send(peerId, data) {
      const conn = connections.get(peerId);
      if (conn && conn.open) conn.send(data);
    }

    return {
      createRoom,
      joinRoom,
      broadcast,
      sendToHost,
      send,
      onMessage: (fn) => messageHandlers.push(fn),
      onPeerJoin: (fn) => peerJoinHandlers.push(fn),
      onPeerLeave: (fn) => peerLeaveHandlers.push(fn),
      onError: (fn) => errorHandlers.push(fn),
      onDisconnected: (fn) => disconnectedHandlers.push(fn),
      getRole: () => role,
      getMyId: () => (peer ? peer.id : null),
      getConnectedCount: () => connections.size,
    };
  }

  window.Network = createNetwork();
})();
