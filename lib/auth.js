/* Carton-Pro — admin authentication.
 *
 * A single Carton-Pro password. Node's crypto does all of it, so
 * there is no dependency to keep patched. The password itself is never
 * stored: ADMIN_PASSWORD_HASH holds a scrypt digest, and the session is a
 * signed cookie rather than server state, so a restart does not sign
 * everyone out mid-article.
 */

const crypto = require('crypto');

const SESSION_COOKIE = process.env.NODE_ENV === 'production' ? '__Host-cp_admin' : 'cp_admin';
const SESSION_HOURS = 12;

/* ------------------------------------------------------------- password */

/* 32MB of memory per attempt. A GPU rig can try a fast hash billions of
   times a second; scrypt at this cost makes each guess expensive in RAM,
   which is exactly what such hardware is short of. */
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 96 * 1024 * 1024 };

function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString('hex');
  const key = crypto.scryptSync(String(password), s, 64, SCRYPT);
  return `scrypt$${s}$${key.toString('hex')}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  const parts = String(stored).split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const expected = Buffer.from(parts[2], 'hex');
  let actual;
  try {
    actual = crypto.scryptSync(String(password), parts[1], 64, SCRYPT);
  } catch (err) {
    return false;
  }
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

/* -------------------------------------------------------------- session */

function secret() {
  /* Without an explicit secret the sessions are still signed, but only for
     the life of this process. Set SESSION_SECRET in production. */
  if (!secret._value) {
    secret._value = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
  }
  return secret._value;
}

function sign(value) {
  return crypto.createHmac('sha256', secret()).update(value).digest('base64url');
}

function issueSession() {
  const expires = Date.now() + SESSION_HOURS * 3600 * 1000;
  const body = `${expires}.${crypto.randomBytes(12).toString('base64url')}`;
  return `${body}.${sign(body)}`;
}

function readSession(token) {
  if (!token) return null;
  const idx = token.lastIndexOf('.');
  if (idx < 0) return null;
  const body = token.slice(0, idx);
  const mac = token.slice(idx + 1);
  const want = Buffer.from(sign(body));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  const expires = Number(body.split('.')[0]);
  if (!Number.isFinite(expires) || Date.now() > expires) return null;
  return { expires };
}

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i < 0) return;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

module.exports = {
  SESSION_COOKIE,
  SESSION_HOURS,
  hashPassword,
  verifyPassword,
  issueSession,
  readSession,
  parseCookies
};
