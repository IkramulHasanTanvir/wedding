'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { createClient } = require('@libsql/client');

/* ---------- tiny .env loader (no extra dependency) ---------- */
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const PORT = Number(process.env.PORT) || 3000;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const BKASH_NUMBER = process.env.BKASH_NUMBER || '01XXXXXXXXX';
const BKASH_ACCOUNT_NAME = process.env.BKASH_ACCOUNT_NAME || 'Tanvir Hridoy';
const CASH_RECEIVER = process.env.CASH_RECEIVER || 'Tanvir Hridoy';
const EVENT_TITLE = process.env.EVENT_TITLE || 'Wedding Panjabi Collection';
// Local dev: a file database. Production: Turso (set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN).
const DB_URL = process.env.TURSO_DATABASE_URL || 'file:' + (process.env.DB_PATH || path.join(__dirname, 'data', 'wedding.db'));
const DB_TOKEN = process.env.TURSO_AUTH_TOKEN || undefined;

if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 8) {
  console.error('\n  ADMIN_PASSWORD is missing or too short (min 8 chars).');
  console.error('  Copy .env.example to .env and set it, then start again.\n');
  process.exit(1);
}

/* ---------- database ---------- */
if (DB_URL.startsWith('file:')) fs.mkdirSync(path.dirname(DB_URL.slice(5)), { recursive: true });
const db = createClient({ url: DB_URL, authToken: DB_TOKEN });
const all = async (sql, args = []) => (await db.execute({ sql, args })).rows;
const one = async (sql, args = []) => (await all(sql, args))[0];
const run = (sql, args = []) => db.execute({ sql, args });

let SECRET; // signing secret for admin sessions, stored in the DB so it survives restarts
async function initDb() {
  await db.batch([
    `CREATE TABLE IF NOT EXISTS friends (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      code          TEXT NOT NULL UNIQUE,
      name          TEXT NOT NULL,
      panjabi_size  TEXT NOT NULL,
      phone         TEXT NOT NULL UNIQUE,
      method        TEXT NOT NULL CHECK (method IN ('bkash','cash')),
      sender_number TEXT,
      status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed')),
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  ], 'write');
  await run("INSERT OR IGNORE INTO settings (key, value) VALUES ('session_secret', ?)", [crypto.randomBytes(32).toString('hex')]);
  SECRET = (await one("SELECT value FROM settings WHERE key='session_secret'")).value;
}

/* ---------- helpers ---------- */
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no look-alike characters
async function newCode() {
  for (let i = 0; i < 20; i++) {
    let c = 'FW-';
    for (let j = 0; j < 5; j++) c += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
    if (!(await one('SELECT 1 AS x FROM friends WHERE code=?', [c]))) return c;
  }
  throw new Error('Could not generate code');
}

function normalizePhone(raw) {
  let p = String(raw || '').replace(/[\s\-()]/g, '');
  if (p.startsWith('+88')) p = p.slice(3);
  else if (p.startsWith('88') && p.length === 13) p = p.slice(2);
  return p;
}
const isPhone = (p) => /^01[3-9]\d{8}$/.test(p);

const cleanText = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

/** Validates and normalizes friend fields. Returns { error } or { value }. */
function validateFriend(body, { requireCashConfirm }) {
  const name = cleanText(body.name);
  const size = cleanText(body.panjabiSize);
  const phone = normalizePhone(body.phone);
  const method = body.method;
  let sender = normalizePhone(body.senderNumber);

  if (name.length < 2 || name.length > 80) return { error: 'Please enter your full name (2–80 characters).' };
  if (!size || size.length > 10 || !/^[A-Za-z0-9 .\/\-]+$/.test(size)) return { error: 'Please enter a valid Panjabi size (e.g. 40, 42, 44).' };
  if (!isPhone(phone)) return { error: 'Please enter a valid mobile number (e.g. 01712345678).' };
  if (method !== 'bkash' && method !== 'cash') return { error: 'Please choose a payment method.' };

  if (method === 'bkash') {
    if (sender && !isPhone(sender)) return { error: 'The sender bKash number is not valid.' };
  } else {
    sender = '';
    if (requireCashConfirm && body.cashConfirmed !== true) {
      return { error: `Please tick the box to confirm you will pay cash to ${CASH_RECEIVER}.` };
    }
  }
  return { value: { name, size, phone, method, sender: sender || null } };
}

const publicView = (r) => ({
  id: r.code,
  name: r.name,
  panjabiSize: r.panjabi_size,
  paymentMethod: r.method,
  paymentStatus: r.status,
});
const adminView = (r) => ({
  id: r.id,
  code: r.code,
  name: r.name,
  panjabiSize: r.panjabi_size,
  phone: r.phone,
  paymentMethod: r.method,
  senderNumber: r.sender_number || '',
  paymentStatus: r.status,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/* ---------- simple in-memory rate limiter ---------- */
function rateLimit({ windowMs, max, message }) {
  const hits = new Map();
  setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (v.reset < now) hits.delete(k); }, windowMs).unref();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip;
    let h = hits.get(key);
    if (!h || h.reset < now) h = { count: 0, reset: now + windowMs };
    h.count++;
    hits.set(key, h);
    if (h.count > max) return res.status(429).json({ error: message });
    next();
  };
}

/* ---------- admin auth (signed, HttpOnly cookie) ---------- */
const SESSION_MS = 12 * 60 * 60 * 1000;
const sign = (v) => crypto.createHmac('sha256', SECRET).update(v).digest('hex');
const safeEqual = (a, b) => {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
};
function readCookie(req, name) {
  const m = (req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}
function isAdmin(req) {
  const tok = readCookie(req, 'admin_session');
  if (!tok) return false;
  const [exp, sig] = tok.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEqual(sig, sign(exp));
}
const requireAdmin = (req, res, next) => (isAdmin(req) ? next() : res.status(401).json({ error: 'Not authorized.' }));

/* ---------- app ---------- */
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '10kb' }));

app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; frame-ancestors 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
});
// Body-carrying API calls must be JSON (blocks simple cross-site form posts).
// DELETE is covered by the SameSite=Strict admin cookie (and CORS preflight).
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && !req.is('application/json')) {
    return res.status(415).json({ error: 'JSON required.' });
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

/* --- public API --- */
app.get('/api/config', (req, res) => {
  res.json({ bkashNumber: BKASH_NUMBER, bkashName: BKASH_ACCOUNT_NAME, cashReceiver: CASH_RECEIVER, eventTitle: EVENT_TITLE });
});

app.post('/api/register',
  rateLimit({ windowMs: 10 * 60 * 1000, max: 20, message: 'Too many attempts. Please try again later.' }),
  async (req, res) => {
    const { error, value } = validateFriend(req.body || {}, { requireCashConfirm: true });
    if (error) return res.status(400).json({ error });

    if (await one('SELECT 1 AS x FROM friends WHERE phone=?', [value.phone])) {
      return res.status(409).json({ error: 'This mobile number is already registered. Use “Check My Status” to see your details.' });
    }
    try {
      const code = await newCode();
      await run(`INSERT INTO friends (code, name, panjabi_size, phone, method, sender_number)
                 VALUES (?, ?, ?, ?, ?, ?)`, [code, value.name, value.size, value.phone, value.method, value.sender]);
      const row = await one('SELECT * FROM friends WHERE code=?', [code]);
      res.status(201).json({ friend: publicView(row) });
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) {
        return res.status(409).json({ error: 'This mobile number is already registered.' });
      }
      console.error(e);
      res.status(500).json({ error: 'Something went wrong. Please try again.' });
    }
  });

app.post('/api/status',
  rateLimit({ windowMs: 5 * 60 * 1000, max: 60, message: 'Too many lookups. Please wait a few minutes.' }),
  async (req, res) => {
    const q = cleanText(req.body && req.body.query);
    if (!q || q.length > 30) return res.status(400).json({ error: 'Enter your mobile number or unique ID.' });
    const phone = normalizePhone(q);
    const row = isPhone(phone)
      ? await one('SELECT * FROM friends WHERE phone=?', [phone])
      : await one('SELECT * FROM friends WHERE code=?', [q.toUpperCase()]);
    if (!row) return res.status(404).json({ error: 'No registration found. Please check the number or ID.' });
    res.json({ friend: publicView(row) });
  });

/* --- admin API --- */
app.post('/api/admin/login',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: 'Too many login attempts. Try again in a few minutes.' }),
  (req, res) => {
    const userOk = safeEqual(String((req.body && req.body.username) || '').trim(), ADMIN_USERNAME);
    const passOk = safeEqual(String((req.body && req.body.password) || ''), ADMIN_PASSWORD);
    if (!(userOk && passOk)) {
      return res.status(401).json({ error: 'Incorrect user ID or password.' });
    }
    const exp = String(Date.now() + SESSION_MS);
    const secure = req.secure ? '; Secure' : '';
    res.setHeader('Set-Cookie',
      `admin_session=${exp}.${sign(exp)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_MS / 1000}${secure}`);
    res.json({ ok: true });
  });

app.post('/api/admin/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'admin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/admin/session', (req, res) => res.json({ authenticated: isAdmin(req) }));

app.get('/api/admin/friends', requireAdmin, async (req, res) => {
  const rows = await all('SELECT * FROM friends ORDER BY created_at DESC, id DESC');
  const completed = rows.filter((r) => r.status === 'completed').length;
  res.json({
    friends: rows.map(adminView),
    stats: { total: rows.length, completed, pending: rows.length - completed },
  });
});

app.patch('/api/admin/friends/:id', requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const row = await one('SELECT * FROM friends WHERE id=?', [id]);
  if (!row) return res.status(404).json({ error: 'Record not found.' });

  const body = req.body || {};
  // Status-only update (the "Mark paid" button)
  if (Object.keys(body).length === 1 && 'paymentStatus' in body) {
    if (!['pending', 'completed'].includes(body.paymentStatus)) return res.status(400).json({ error: 'Invalid status.' });
    await run("UPDATE friends SET status=?, updated_at=datetime('now') WHERE id=?", [body.paymentStatus, id]);
    return res.json({ friend: adminView(await one('SELECT * FROM friends WHERE id=?', [id])) });
  }

  // Full edit
  const { error, value } = validateFriend(body, { requireCashConfirm: false });
  if (error) return res.status(400).json({ error });
  const status = body.paymentStatus === 'completed' ? 'completed' : 'pending';
  try {
    await run(`UPDATE friends SET name=?, panjabi_size=?, phone=?, method=?, sender_number=?, status=?,
               updated_at=datetime('now') WHERE id=?`,
      [value.name, value.size, value.phone, value.method, value.sender, status, id]);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'Another friend already uses this mobile number.' });
    throw e;
  }
  res.json({ friend: adminView(await one('SELECT * FROM friends WHERE id=?', [id])) });
});

app.delete('/api/admin/friends/:id', requireAdmin, async (req, res) => {
  const info = await run('DELETE FROM friends WHERE id=?', [Number(req.params.id)]);
  if (!info.rowsAffected) return res.status(404).json({ error: 'Record not found.' });
  res.json({ ok: true });
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong.' });
});

initDb()
  .then(() => app.listen(PORT, () => console.log(`Wedding manager running on http://localhost:${PORT}`)))
  .catch((e) => { console.error('Database setup failed:', e.message); process.exit(1); });
