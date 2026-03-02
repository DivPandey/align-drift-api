# Align Drift

A calm precision game: slide shapes toward magnetic zones. Gentle snap within a fixed radius. No grid, no completion screen — designed for steady engagement and micro-rewards.

## What it trains

- Calm precision  
- Micro-adjustment  
- Focus without over-efforting  

## Run the project

### Backend (API)

```bash
cd backend
npm install
npm start
```

API runs at **http://localhost:3001**.

### Frontend (game)

Open `frontend/index.html` in a browser, or serve the folder with any static server, for example:

```bash
cd frontend
npx serve .
```

Then open the URL shown (e.g. http://localhost:3000). For full features (unlocks, engagement), the backend should be running.

## Structure

- **backend/** — Express API: game config, progress, unlock-by-engagement, CORS enabled.
- **frontend/** — Single-page game: canvas, drag-to-zone, soft snap, sounds, glow, no completion screen.

## Soft gamification

- Snap sound variations on alignment  
- Background tone shift when a shape snaps  
- New shapes unlock over time (by engagement)  
- Subtle glow on aligned shapes  
- Rewards engagement, not correctness  
