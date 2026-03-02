const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN ? process.env.ALLOWED_ORIGIN.split(',') : true,
  methods: ['GET', 'POST'],
}));
app.use(express.json());

// In-memory store (replace with DB if needed)
const sessions = new Map();

// Game config: fixed snap radius, shapes, magnetic zones
const GAME_CONFIG = {
  snapRadius: 60,
  canvasWidth: 800,
  canvasHeight: 600,
  shapes: [
    { id: 'crystal-1', name: 'Crystal', unlockedByDefault: true, hue: 280 },
    { id: 'orb-1', name: 'Orb', unlockedByDefault: true, hue: 180 },
    { id: 'star-1', name: 'Star', unlockedByDefault: false, unlockAfterSnaps: 5, hue: 45 },
    { id: 'moon-1', name: 'Moon', unlockedByDefault: false, unlockAfterSnaps: 12, hue: 220 },
    { id: 'comet-1', name: 'Comet', unlockedByDefault: false, unlockAfterSnaps: 25, hue: 320 },
  ],
  magneticZones: 3,
  theme: 'crystals',
};

// Generate session ID
function getSessionId(req) {
  return req.headers['x-session-id'] || req.body?.sessionId || 'default';
}

// Get or create session
function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      totalSnaps: 0,
      totalAlignments: 0,
      playTimeSeconds: 0,
      unlockedShapeIds: GAME_CONFIG.shapes.filter(s => s.unlockedByDefault).map(s => s.id),
      lastPlayedAt: new Date().toISOString(),
    });
  }
  return sessions.get(sessionId);
}

// GET game config (no auth needed)
app.get('/api/config', (req, res) => {
  res.json(GAME_CONFIG);
});

// GET progress and unlocked shapes (uses session)
app.get('/api/progress', (req, res) => {
  const sessionId = getSessionId(req);
  const session = getSession(sessionId);
  const unlocked = GAME_CONFIG.shapes.filter(s => session.unlockedShapeIds.includes(s.id));
  res.json({
    totalSnaps: session.totalSnaps,
    totalAlignments: session.totalAlignments,
    playTimeSeconds: session.playTimeSeconds,
    unlockedShapes: unlocked,
    allShapes: GAME_CONFIG.shapes,
  });
});

// POST engagement (snap / alignment) - rewards engagement, not correctness
app.post('/api/engage', (req, res) => {
  const sessionId = getSessionId(req);
  const session = getSession(sessionId);
  const { event, value } = req.body || {};

  if (event === 'snap') {
    session.totalSnaps += 1;
    session.totalAlignments += value === true ? 1 : 0;
  }
  if (event === 'play_time') {
    session.playTimeSeconds = (session.playTimeSeconds || 0) + (value || 0);
  }
  session.lastPlayedAt = new Date().toISOString();

  // Unlock shapes by snap count
  for (const shape of GAME_CONFIG.shapes) {
    if (shape.unlockAfterSnaps && session.totalSnaps >= shape.unlockAfterSnaps) {
      if (!session.unlockedShapeIds.includes(shape.id)) {
        session.unlockedShapeIds.push(shape.id);
      }
    }
  }

  res.json({
    ok: true,
    unlockedShapes: GAME_CONFIG.shapes.filter(s => session.unlockedShapeIds.includes(s.id)),
  });
});

// Serve frontend in production (optional)
app.use(express.static(path.join(__dirname, '..', 'frontend')));

app.listen(PORT, () => {
  console.log(`Align Drift API running at http://localhost:${PORT}`);
});
