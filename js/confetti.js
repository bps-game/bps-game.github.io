// Confettis dessinés sur un <canvas> plein écran, sans dépendance externe.
(function () {
  const COLORS = ["#00f2ea", "#ff0a78", "#ffffff", "#7af8ff", "#ff6ec7"];

  let canvas = null;
  let ctx2d = null;
  let particles = [];
  let rafId = null;
  let lastTs = null;

  function ensureCanvas() {
    if (canvas) return;
    canvas = document.getElementById("confetti-canvas");
    if (!canvas) return;
    ctx2d = canvas.getContext("2d");
    resize();
    window.addEventListener("resize", resize);
  }

  function resize() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function spawnParticle() {
    return {
      x: Math.random() * window.innerWidth,
      y: -20 - Math.random() * 120,
      vx: (Math.random() - 0.5) * 3,
      vy: 2 + Math.random() * 3,
      size: 6 + Math.random() * 6,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rotation: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.3,
      shape: Math.random() < 0.5 ? "rect" : "circle",
      life: 0,
      maxLife: 1800 + Math.random() * 1000,
    };
  }

  function tick(ts) {
    if (!canvas) return;
    if (!lastTs) lastTs = ts || performance.now();
    const now = ts || performance.now();
    const dt = Math.min(32, now - lastTs);
    lastTs = now;

    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach((p) => {
      p.vy += 0.015 * dt;
      p.x += p.vx * (dt / 16);
      p.y += p.vy * (dt / 16);
      p.rotation += p.vr * (dt / 16);
      p.life += dt;
      const fade = Math.max(0, 1 - p.life / p.maxLife);

      ctx2d.save();
      ctx2d.translate(p.x, p.y);
      ctx2d.rotate(p.rotation);
      ctx2d.globalAlpha = fade;
      ctx2d.fillStyle = p.color;
      if (p.shape === "rect") {
        ctx2d.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else {
        ctx2d.beginPath();
        ctx2d.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx2d.fill();
      }
      ctx2d.restore();
    });

    particles = particles.filter((p) => p.life < p.maxLife && p.y < canvas.height + 40);

    if (particles.length > 0) {
      rafId = requestAnimationFrame(tick);
    } else {
      rafId = null;
      lastTs = null;
      ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  function burst(count) {
    ensureCanvas();
    if (!canvas) return;
    for (let i = 0; i < (count || 140); i++) particles.push(spawnParticle());
    if (!rafId) rafId = requestAnimationFrame(tick);
  }

  window.Confetti = { burst };
})();
