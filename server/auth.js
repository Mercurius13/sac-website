/* Auth: the single admin password (a bcrypt hash in the env) and the signed,
time-limited session cookie that login hands out. */
import bcrypt from 'bcryptjs';

// the session cookie's name and how long it stays valid (12 hours)
export const SESSION_COOKIE = 'sac_admin_session';
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

// read a required env var, or fail loudly at boot if it's missing
export function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

// only send cookies over https once deployed (plain http is fine locally)
export function cookiesAreSecure() {
  return process.env.NODE_ENV === 'production';
}

// the bcrypt hash of the admin password, set as an env var (never committed)
export function getPasswordHash() {
  return process.env.ADMIN_PASSWORD_HASH;
}

// true only if the entered password matches the stored hash
export async function verifyPassword(password, hash) {
  if (typeof password !== 'string' || !password || typeof hash !== 'string' || !hash) return false;
  return bcrypt.compare(password, hash);
}

// hand out a signed session cookie stamped with the current time
export function issueSession(res) {
  res.cookie(SESSION_COOKIE, String(Date.now()), {
    signed: true,
    httpOnly: true,
    secure: cookiesAreSecure(),
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE_MS,
    path: '/',
  });
}

// drop the session cookie (logout)
export function clearSession(res) {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: cookiesAreSecure(), sameSite: 'lax', path: '/' });
}

// a session is valid if the signed cookie is present and younger than the max age
export function hasValidSession(req) {
  const raw = req.signedCookies?.[SESSION_COOKIE];
  if (!raw) return false;

  const issuedAt = Number(raw);
  if (!Number.isFinite(issuedAt)) return false;

  return Date.now() - issuedAt < SESSION_MAX_AGE_MS;
}

// middleware: block the request with a 401 unless it carries a valid session
export function requireSession(req, res, next) {
  if (!hasValidSession(req)) return res.status(401).json({ error: 'Not authenticated' });
  next();
}
