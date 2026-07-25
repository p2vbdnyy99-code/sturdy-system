// AI Copilot backend
// -----------------------------------------------------------------------------
// A small Express server that sits between the browser extension and the
// Anthropic Claude API. It provides:
//   * JWT-based authentication (register / login / me)
//   * A credit system: each account has a balance, metered against token usage
//   * An AI proxy with both buffered (`/api/ai/complete`) and streaming
//     (`/api/ai/stream`, Server-Sent Events) endpoints
//
// State is kept in memory and optionally persisted to a JSON file so a demo
// survives restarts. This is a prototype — swap the store for a real database
// before shipping.

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import Anthropic from '@anthropic-ai/sdk';

// ─── Configuration ───────────────────────────────────────────────────────────

const {
  ANTHROPIC_API_KEY,
  DEFAULT_MODEL = 'claude-opus-5',
  JWT_SECRET = 'dev-only-insecure-secret',
  JWT_EXPIRES_IN = '7d',
  PORT = 8787,
  CORS_ORIGINS = '*',
  SIGNUP_CREDITS = '100',
  CREDITS_PER_1K_OUTPUT = '1',
  DATA_FILE,
} = process.env;

if (!ANTHROPIC_API_KEY) {
  console.warn(
    '[warn] ANTHROPIC_API_KEY is not set. AI endpoints will fail until it is configured.',
  );
}

const signupCredits = Number(SIGNUP_CREDITS) || 0;
const creditsPer1kOutput = Number(CREDITS_PER_1K_OUTPUT) || 1;
const MAX_TOKENS_CAP = 4096;

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

// ─── Persistence layer (in-memory, optional JSON snapshot) ───────────────────

/** @type {{ users: Record<string, any> }} */
const store = { users: {} };

function loadStore() {
  if (!DATA_FILE) return;
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.users) {
        store.users = parsed.users;
      }
    }
  } catch (err) {
    console.error('[store] failed to load, starting fresh:', err.message);
  }
}

let persistQueued = false;
function persistStore() {
  if (!DATA_FILE || persistQueued) return;
  persistQueued = true;
  // Debounce writes so a burst of requests doesn't hammer the disk.
  setTimeout(() => {
    persistQueued = false;
    try {
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
    } catch (err) {
      console.error('[store] failed to persist:', err.message);
    }
  }, 250);
}

loadStore();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    credits: user.credits,
    createdAt: user.createdAt,
  };
}

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

function findUserByEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  return Object.values(store.users).find((u) => u.email === normalized);
}

/** Convert token usage into a credit cost (minimum 1 credit per call). */
function creditsForUsage(usage) {
  const output = usage?.output_tokens ?? 0;
  return Math.max(1, Math.ceil((output / 1000) * creditsPer1kOutput));
}

// ─── App setup ───────────────────────────────────────────────────────────────

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

const corsOrigins = CORS_ORIGINS.split(',').map((s) => s.trim());
app.use(
  cors({
    origin: corsOrigins.includes('*') ? true : corsOrigins,
    credentials: false,
  }),
);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later.' },
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded, slow down.' },
});

// Authentication middleware — attaches req.user or 401s.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing bearer token.' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = store.users[payload.sub];
    if (!user) return res.status(401).json({ error: 'Account no longer exists.' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

// ─── Routes: health ──────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, model: DEFAULT_MODEL, hasKey: Boolean(ANTHROPIC_API_KEY) });
});

// ─── Routes: auth ────────────────────────────────────────────────────────────

app.post('/api/auth/register', authLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) {
    return res.status(400).json({ error: 'A valid email is required.' });
  }
  if (!password || String(password).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  if (findUserByEmail(normalized)) {
    return res.status(409).json({ error: 'An account with that email already exists.' });
  }

  const id = crypto.randomUUID();
  const user = {
    id,
    email: normalized,
    passwordHash: await bcrypt.hash(String(password), 10),
    credits: signupCredits,
    createdAt: new Date().toISOString(),
  };
  store.users[id] = user;
  persistStore();

  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  const user = findUserByEmail(email);
  if (!user || !(await bcrypt.compare(String(password || ''), user.passwordHash))) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// ─── Routes: credits ─────────────────────────────────────────────────────────

app.get('/api/credits', requireAuth, (req, res) => {
  res.json({ credits: req.user.credits });
});

// ─── AI request normalization ────────────────────────────────────────────────

/**
 * Build a Claude Messages API request from the client payload. Accepts either
 * a `messages` array or a simple `prompt` string, plus an optional `system`.
 */
function buildMessagesRequest(body) {
  const model = typeof body.model === 'string' && body.model ? body.model : DEFAULT_MODEL;
  const maxTokens = Math.min(Number(body.maxTokens) || 1024, MAX_TOKENS_CAP);

  let messages;
  if (Array.isArray(body.messages) && body.messages.length > 0) {
    messages = body.messages
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant'))
      .map((m) => ({ role: m.role, content: String(m.content ?? '') }));
  } else if (typeof body.prompt === 'string' && body.prompt.trim()) {
    messages = [{ role: 'user', content: body.prompt }];
  }

  if (!messages || messages.length === 0) {
    const err = new Error('Provide a non-empty `prompt` or `messages` array.');
    err.status = 400;
    throw err;
  }

  const request = { model, max_tokens: maxTokens, messages };
  if (typeof body.system === 'string' && body.system.trim()) {
    request.system = body.system;
  }
  return request;
}

// ─── Routes: AI proxy (buffered) ─────────────────────────────────────────────

app.post('/api/ai/complete', aiLimiter, requireAuth, async (req, res) => {
  if (req.user.credits <= 0) {
    return res.status(402).json({ error: 'Out of credits.' });
  }

  let request;
  try {
    request = buildMessagesRequest(req.body || {});
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  try {
    const message = await anthropic.messages.create(request);
    const text = message.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('');

    const cost = creditsForUsage(message.usage);
    req.user.credits = Math.max(0, req.user.credits - cost);
    persistStore();

    res.json({
      text,
      model: message.model,
      stopReason: message.stop_reason,
      usage: message.usage,
      cost,
      credits: req.user.credits,
    });
  } catch (err) {
    console.error('[ai/complete]', err.status, err.message);
    res.status(err.status || 502).json({ error: err.message || 'Upstream AI error.' });
  }
});

// ─── Routes: AI proxy (streaming SSE) ────────────────────────────────────────

app.post('/api/ai/stream', aiLimiter, requireAuth, async (req, res) => {
  if (req.user.credits <= 0) {
    return res.status(402).json({ error: 'Out of credits.' });
  }

  let request;
  try {
    request = buildMessagesRequest(req.body || {});
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  let aborted = false;
  req.on('close', () => {
    aborted = true;
  });

  try {
    const stream = anthropic.messages.stream(request);

    stream.on('text', (delta) => {
      if (!aborted) send('delta', { text: delta });
    });

    const finalMessage = await stream.finalMessage();
    if (aborted) return;

    const cost = creditsForUsage(finalMessage.usage);
    req.user.credits = Math.max(0, req.user.credits - cost);
    persistStore();

    send('done', {
      usage: finalMessage.usage,
      stopReason: finalMessage.stop_reason,
      cost,
      credits: req.user.credits,
    });
    res.end();
  } catch (err) {
    console.error('[ai/stream]', err.status, err.message);
    if (!aborted) {
      send('error', { error: err.message || 'Upstream AI error.' });
      res.end();
    }
  }
});

// ─── Fallback + start ────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
});

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[unhandled]', err);
  res.status(500).json({ error: 'Internal server error.' });
});

app.listen(PORT, () => {
  console.log(`AI Copilot backend listening on http://localhost:${PORT}`);
  console.log(`  model: ${DEFAULT_MODEL} · signup credits: ${signupCredits}`);
});
