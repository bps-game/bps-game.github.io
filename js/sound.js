// Effets sonores 100% synthétisés (Web Audio API) : aucun fichier audio à
// héberger, aucun souci de droits. Le volume/mute est mémorisé en local.
(function () {
  const MUTE_KEY = "bps_muted";
  let ctx = null;
  let muted = false;

  try {
    muted = localStorage.getItem(MUTE_KEY) === "1";
  } catch (e) {
    muted = false;
  }

  function getCtx() {
    if (!ctx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  // Une note = un oscillateur avec une petite enveloppe (attaque/chute douce)
  // pour éviter les "clics" audio.
  function note(freq, startAt, duration, type, peakGain) {
    const audio = getCtx();
    if (!audio) return;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type || "sine";
    osc.frequency.value = freq;
    const t0 = audio.currentTime + startAt;
    const t1 = t0 + duration;
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peakGain || 0.18, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t1);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(t0);
    osc.stop(t1 + 0.02);
  }

  function play(fn) {
    if (muted) return;
    try {
      fn();
    } catch (e) {
      // Web Audio indisponible ou bloqué : on reste silencieux, pas bloquant.
    }
  }

  function playCorrect() {
    play(() => {
      note(880, 0, 0.1, "triangle", 0.2);
      note(1318.5, 0.08, 0.16, "triangle", 0.22);
    });
  }

  function playWrong() {
    play(() => {
      note(220, 0, 0.16, "sawtooth", 0.15);
      note(164.8, 0.08, 0.18, "sawtooth", 0.15);
    });
  }

  function playTick() {
    play(() => {
      note(700, 0, 0.05, "square", 0.08);
    });
  }

  function playQuestionStart() {
    play(() => {
      note(440, 0, 0.09, "sine", 0.14);
      note(660, 0.06, 0.12, "sine", 0.14);
    });
  }

  function playReveal() {
    play(() => {
      note(520, 0, 0.14, "sine", 0.12);
    });
  }

  function playVictory() {
    play(() => {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
        note(f, i * 0.12, 0.22, "triangle", 0.2);
      });
    });
  }

  function isMuted() {
    return muted;
  }

  function setMuted(value) {
    muted = !!value;
    try {
      localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch (e) {
      // stockage indisponible (navigation privée...) : tant pis, non bloquant
    }
  }

  function toggleMuted() {
    setMuted(!muted);
    return muted;
  }

  window.Sound = {
    playCorrect,
    playWrong,
    playTick,
    playQuestionStart,
    playReveal,
    playVictory,
    isMuted,
    setMuted,
    toggleMuted,
  };
})();
