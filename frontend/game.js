(function () {
  'use strict';

  const API_BASE = window.ALIGN_DRIFT_API || 'http://localhost:3001';
  let sessionId = 'session-' + Math.random().toString(36).slice(2, 11);

  let config = {
    snapRadius: 60,
    canvasWidth: 800,
    canvasHeight: 600,
    shapes: [],
    magneticZones: 3,
  };
  let unlockedShapes = [];
  let zones = [];
  let shapes = [];
  let canvas, ctx;
  let dragged = null;
  let dragOffset = { x: 0, y: 0 };
  let time = 0;
  let audioCtx = null;
  let initialized = false;

  // --------------- Audio ---------------

  function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  const SNAP_FREQS = [280, 320, 360, 400, 520];
  function playSnapSound() {
    initAudio();
    if (!audioCtx) return;
    const freq = SNAP_FREQS[Math.floor(Math.random() * SNAP_FREQS.length)] + (Math.random() * 40 - 20);
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.55, audioCtx.currentTime + 0.1);
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.07, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.18);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.18);
  }

  function shiftBgTone() {
    document.body.classList.add('tone-aligned');
    setTimeout(() => document.body.classList.remove('tone-aligned'), 800);
  }

  // --------------- Geometry ---------------

  function getPointer(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function lerp(a, b, t) { return a + (b - a) * Math.min(1, t); }

  // --------------- Responsive resize ---------------

  function resizeCanvas() {
    if (!canvas) return;
    const wrap = canvas.parentElement;
    const availW = wrap ? wrap.clientWidth : Math.min(800, window.innerWidth - 24);
    const newW = Math.max(280, Math.min(800, availW));
    const newH = Math.round(newW * (600 / 800));
    canvas.width  = newW;
    canvas.height = newH;
    config.canvasWidth  = newW;
    config.canvasHeight = newH;
    if (initialized) {
      createZones();
      createShapes();
    }
  }

  let resizeTimer;
  function onWindowResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resizeCanvas, 150);
  }

  // --------------- Layout ---------------

  const SHELF_Y_RATIO = 0.82;  // shapes start in bottom shelf

  function createZones() {
    zones = [];
    const w = config.canvasWidth || 800;
    const h = config.canvasHeight || 600;
    const n = config.magneticZones || 3;
    // evenly spread, alternating row heights in upper area
    for (let i = 0; i < n; i++) {
      zones.push({
        x: w * (0.18 + (0.64 / Math.max(1, n - 1)) * i),
        y: h * (0.28 + 0.14 * (i % 2)),
        radius: config.snapRadius || 60,
        hue: 260 + i * 30,
        occupiedBy: null,
      });
    }
  }

  function createShapes() {
    const list = unlockedShapes.length
      ? unlockedShapes
      : (config.shapes || []).filter(s => s.unlockedByDefault);
    const fallback = [
      { id: 'crystal-1', name: 'Crystal', hue: 280 },
      { id: 'orb-1',     name: 'Orb',     hue: 180 },
      { id: 'star-1',    name: 'Star',     hue: 45  },
    ];
    const listToUse = list.length ? list : fallback;
    const w = config.canvasWidth || 800;
    const h = config.canvasHeight || 600;
    const count = Math.min(listToUse.length, 5);
    shapes = listToUse.slice(0, count).map((s, i) => ({
      id: s.id,
      hue: s.hue ?? 200,
      // spread evenly along shelf
      x: w * (0.15 + (0.7 / Math.max(1, count - 1)) * i),
      y: h * SHELF_Y_RATIO,
      homeX: w * (0.15 + (0.7 / Math.max(1, count - 1)) * i),
      homeY: h * SHELF_Y_RATIO,
      r: 30,
      type: (s.name || 'orb').toLowerCase(),
      snapProgress: 0,
      targetZone: null,
      snapped: false,
      pulseOffset: i * 1.2,
    }));
  }

  function findZoneAt(x, y) {
    let best = null, bestD = Infinity;
    for (const z of zones) {
      const d = dist({ x, y }, z);
      if (d <= z.radius && d < bestD) { bestD = d; best = z; }
    }
    return best;
  }

  // --------------- Draw helpers ---------------

  function drawStar(cx, cy, spikes, outer, inner) {
    const step = Math.PI / spikes;
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = i * step - Math.PI / 2;
      const x = cx + r * Math.cos(a);
      const y = cy + r * Math.sin(a);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  // Proper gem/diamond crystal — 6-sided hexagon
  function drawCrystal(cx, cy, r) {
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx + r * 0.7, cy - r * 0.3);
    ctx.lineTo(cx + r * 0.7, cy + r * 0.3);
    ctx.lineTo(cx, cy + r);
    ctx.lineTo(cx - r * 0.7, cy + r * 0.3);
    ctx.lineTo(cx - r * 0.7, cy - r * 0.3);
    ctx.closePath();
  }

  function drawComet(cx, cy, r) {
    ctx.ellipse(cx, cy, r * 1.2, r * 0.6, 0.3, 0, Math.PI * 2);
  }

  function drawMoon(cx, cy, r) {
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
  }

  // --------------- Zone drawing ---------------

  function drawZone(z) {
    // outer glow
    const grad = ctx.createRadialGradient(z.x, z.y, 0, z.x, z.y, z.radius);
    grad.addColorStop(0,   `hsla(${z.hue}, 70%, 60%, 0.28)`);
    grad.addColorStop(0.5, `hsla(${z.hue}, 60%, 50%, 0.10)`);
    grad.addColorStop(1,   'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
    ctx.fill();

    // ring — subtly pulses
    const ringAlpha = 0.30 + 0.12 * Math.sin(time * 1.8 + z.hue);
    ctx.strokeStyle = `hsla(${z.hue}, 65%, 72%, ${ringAlpha})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // --------------- Shape drawing ---------------

  function drawShape(s) {
    const { x, y, r, hue, snapProgress, snapped, pulseOffset } = s;

    // idle pulse halo (only on unsnapped shapes)
    if (!snapped) {
      const pulse = 0.10 + 0.07 * Math.sin(time * 2 + pulseOffset);
      const hg = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
      hg.addColorStop(0,   `hsla(${hue}, 70%, 70%, ${pulse})`);
      hg.addColorStop(1,   'transparent');
      ctx.fillStyle = hg;
      ctx.beginPath();
      ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // snap glow
    if (snapProgress > 0) {
      const sg = ctx.createRadialGradient(x, y, 0, x, y, r * 2.5);
      sg.addColorStop(0, `hsla(${hue}, 85%, 75%, ${0.4 * snapProgress})`);
      sg.addColorStop(1, 'transparent');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(x, y, r * 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle   = `hsla(${hue}, 78%, 68%, 0.95)`;
    ctx.strokeStyle = `hsla(${hue}, 55%, 90%, 0.85)`;
    ctx.lineWidth   = 2;
    ctx.beginPath();
    if      (s.type === 'star')    drawStar(x, y, 5, r, r * 0.48);
    else if (s.type === 'crystal') drawCrystal(x, y, r);
    else if (s.type === 'comet')   drawComet(x, y, r);
    else if (s.type === 'moon')    drawMoon(x, y, r);
    else { ctx.arc(x, y, r, 0, Math.PI * 2); }
    ctx.fill();
    ctx.stroke();
  }

  // --------------- Shelf divider ---------------

  function drawShelf() {
    const w = canvas.width;
    const h = canvas.height;
    const sy = h * (SHELF_Y_RATIO - 0.13);
    ctx.fillStyle = 'rgba(255,255,255,0.018)';
    ctx.fillRect(0, sy, w, h - sy);
    ctx.strokeStyle = 'rgba(255,255,255,0.055)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, sy);
    ctx.lineTo(w, sy);
    ctx.stroke();

    // label
    ctx.fillStyle = 'rgba(200,195,230,0.22)';
    ctx.font = '13px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('drag shapes to glowing zones', w / 2, sy + 16);
    ctx.textAlign = 'start';
  }

  // --------------- Main draw ---------------

  function draw() {
    if (!ctx) return;
    const w = canvas.width, h = canvas.height;
    ctx.fillStyle = '#12121f';
    ctx.fillRect(0, 0, w, h);
    drawShelf();
    zones.forEach(drawZone);
    shapes.forEach(drawShape);
  }

  // --------------- Animation ---------------

  function animate() {
    time += 0.022;
    for (const s of shapes) {
      if (s.targetZone) {
        s.x = lerp(s.x, s.targetZone.x, 0.12);
        s.y = lerp(s.y, s.targetZone.y, 0.12);
        s.snapProgress = lerp(s.snapProgress, 1, 0.1);
        if (Math.abs(s.x - s.targetZone.x) < 0.5 && Math.abs(s.y - s.targetZone.y) < 0.5) {
          s.x = s.targetZone.x;
          s.y = s.targetZone.y;
          s.snapped = true;
          s.targetZone = null;
        }
      } else if (s.snapProgress > 0 && !s.snapped) {
        s.snapProgress = Math.max(0, s.snapProgress - 0.015);
      }
    }
    draw();
    requestAnimationFrame(animate);
  }

  // --------------- Events ---------------

  function shapeAt(x, y) {
    for (let i = shapes.length - 1; i >= 0; i--) {
      if (dist({ x, y }, shapes[i]) <= shapes[i].r * 1.4) return shapes[i];
    }
    return null;
  }

  function onDown(e) {
    e.preventDefault();
    const p = getPointer(e);
    dragged = shapeAt(p.x, p.y);
    if (dragged) {
      dragged.snapped = false;
      dragged.snapProgress = 0;
      dragOffset.x = p.x - dragged.x;
      dragOffset.y = p.y - dragged.y;
    }
  }

  function onMove(e) {
    if (!dragged) return;
    e.preventDefault();
    const p = getPointer(e);
    dragged.x = Math.max(dragged.r, Math.min(canvas.width  - dragged.r, p.x - dragOffset.x));
    dragged.y = Math.max(dragged.r, Math.min(canvas.height - dragged.r, p.y - dragOffset.y));
  }

  function onUp(e) {
    if (!dragged) return;
    e.preventDefault();
    const zone = findZoneAt(dragged.x, dragged.y);
    if (zone) {
      dragged.targetZone = zone;
      playSnapSound();
      shiftBgTone();
      reportEngage('snap', true);
    }
    dragged = null;
  }

  // --------------- API ---------------

  function reportEngage(event, value) {
    fetch(API_BASE + '/api/engage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId },
      body: JSON.stringify({ event, value }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.unlockedShapes && data.unlockedShapes.length > unlockedShapes.length) {
          unlockedShapes = data.unlockedShapes;
          createShapes();
        }
      })
      .catch(() => {});
  }

  async function loadConfig() {
    try {
      const res = await fetch(API_BASE + '/api/config');
      config = await res.json();
    } catch (_) {
      config = { snapRadius: 60, canvasWidth: 800, canvasHeight: 600, magneticZones: 3, shapes: [] };
    }
    createZones();
  }

  async function loadProgress() {
    try {
      const res = await fetch(API_BASE + '/api/progress', {
        headers: { 'X-Session-Id': sessionId },
      });
      const data = await res.json();
      unlockedShapes = data.unlockedShapes || data.allShapes?.filter(s => s.unlockedByDefault) || [];
      if (data.allShapes?.length) config.shapes = data.allShapes;
    } catch (_) {
      unlockedShapes = (config.shapes || []).filter(s => s.unlockedByDefault);
    }
    createShapes();
  }

  // --------------- Boot ---------------

  function run() {
    canvas = document.getElementById('game');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    canvas.addEventListener('mousedown',  onDown);
    canvas.addEventListener('mousemove',  onMove);
    canvas.addEventListener('mouseup',    onUp);
    canvas.addEventListener('mouseleave', onUp);
    canvas.addEventListener('touchstart', onDown, { passive: false });
    canvas.addEventListener('touchmove',  onMove, { passive: false });
    canvas.addEventListener('touchend',   onUp,   { passive: false });

    window.addEventListener('resize', onWindowResize);

    (async () => {
      await loadConfig();
      resizeCanvas();
      await loadProgress();
      initialized = true;
      requestAnimationFrame(animate);
    })();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
