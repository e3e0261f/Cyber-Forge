// server.ts
import express from 'express';
import path from 'path';
import { GameState } from './server/game_state';

// Allow BigInt to serialize to JSON as strings
(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

const app = express();
const PORT = 3000;

app.use(express.json());

// Session store for multi-account support via X-Auth-Token
const sessions = new Map<string, GameState>();

function getSession(token?: string): GameState {
  const accountId = token && token.trim().length > 0 ? token.trim() : 'default_cultivator';
  let state = sessions.get(accountId);
  if (!state) {
    state = new GameState();
    sessions.set(accountId, state);
  }
  return state;
}

// API Routes
app.get('/api/state', (req, res) => {
  const token = req.headers['x-auth-token'] as string | undefined;
  const state = getSession(token);
  res.json(state.snapshot());
});

app.post('/api/strike', (req, res) => {
  const token = req.headers['x-auth-token'] as string | undefined;
  const state = getSession(token);
  state.player_strike();
  res.json(state.snapshot());
});

app.post('/api/tick', (req, res) => {
  const token = req.headers['x-auth-token'] as string | undefined;
  const state = getSession(token);
  state.tick();
  res.json(state.snapshot());
});

app.post('/api/action', (req, res) => {
  const token = req.headers['x-auth-token'] as string | undefined;
  const state = getSession(token);
  const body = req.body || {};
  state.handle_action(body);
  res.json(state.snapshot());
});

// Serve Static UI Assets
const uiPath = path.join(process.cwd(), 'ui');
app.use(express.static(uiPath));

// Fallback to index.html for single page layout
app.get('*', (req, res) => {
  res.sendFile(path.join(uiPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Cyber-Forge] Server listening on http://0.0.0.0:${PORT}`);
});
