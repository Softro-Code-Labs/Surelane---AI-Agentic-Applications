import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { hashPassword, newToken, sha256, verifyPassword } from './crypto';
import { one, q } from './db';

const COOKIE = 'agent_session';
const SESSION_DAYS = 30;
const MAX_FAILURES = 5;           // per client address
const GLOBAL_MAX_FAILURES = 50;   // across every address
const LOCK_MIN = 15;

export async function ownerExists() {
  return Boolean(await one('SELECT 1 x FROM users WHERE id = 1'));
}

export async function createSession() {
  const token = newToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await q('INSERT INTO sessions (token_hash, expires_at) VALUES ($1,$2)', [sha256(token), expires]);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIES !== '1', path: '/', expires,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await q('DELETE FROM sessions WHERE token_hash=$1', [sha256(token)]);
  jar.delete(COOKIE);
}

export async function isSignedIn(): Promise<boolean> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return false;
  return Boolean(await one('SELECT 1 x FROM sessions WHERE token_hash=$1 AND expires_at > now()', [sha256(token)]));
}

/*
 * Sign-in throttling. Each attempt is counted before the password is checked, in
 * one statement, so parallel guesses cannot slip past the limit. The limit is per
 * client address, so a stranger guessing passwords cannot lock the owner out.
 * A much higher limit across all addresses still slows a distributed attack.
 */
async function countAttempt(key: string, max: number, now: Date): Promise<boolean> {
  const windowStart = new Date(now.getTime() - LOCK_MIN * 60_000);
  const row = (await one<{ failures: number; locked_until: Date | null }>(
    `INSERT INTO login_attempts AS a (key, failures, locked_until, updated_at) VALUES ($1, 1, NULL, $2)
     ON CONFLICT (key) DO UPDATE SET
       failures = CASE WHEN a.locked_until > $2 THEN a.failures
                       WHEN a.locked_until IS NOT NULL OR a.updated_at < $3 THEN 1 ELSE a.failures + 1 END,
       locked_until = CASE WHEN a.locked_until > $2 THEN a.locked_until ELSE NULL END,
       updated_at = $2
     RETURNING failures, locked_until`, [key, now, windowStart]))!;
  if (row.locked_until && new Date(row.locked_until) > now) return false;
  if (row.failures > max) {
    await q('UPDATE login_attempts SET locked_until = $2 WHERE key = $1', [key, new Date(now.getTime() + LOCK_MIN * 60_000)]);
    return false;
  }
  return true;
}

// A real hash of a random password, so a wrong email takes as long as a wrong password.
let decoy: Promise<string> | null = null;

/** Result of a sign-in attempt. Locks after repeated failures. */
export async function attemptLogin(email: string, password: string, client = 'unknown', now = new Date()): Promise<'ok' | 'bad' | 'locked'> {
  const keys = [`ip:${sha256(client).slice(0, 32)}`, 'owner'];
  const allowed = [await countAttempt(keys[0]!, MAX_FAILURES, now), await countAttempt(keys[1]!, GLOBAL_MAX_FAILURES, now)];
  if (allowed.includes(false)) return 'locked';
  const user = await one<{ email: string; password_hash: string }>('SELECT email, password_hash FROM users WHERE id=1');
  decoy ??= hashPassword(newToken());
  const rightPassword = await verifyPassword(password.slice(0, 1000), user?.password_hash ?? (await decoy));
  if (user && rightPassword && user.email.toLowerCase() === email.trim().toLowerCase()) {
    await q('DELETE FROM login_attempts WHERE key = ANY($1::text[])', [keys]);
    return 'ok';
  }
  return 'bad';
}

/** The address a request came from, as reported by the host's proxy. */
export async function clientAddress(): Promise<string> {
  const h = await headers();
  return (h.get('x-forwarded-for')?.split(',')[0] ?? h.get('x-real-ip') ?? 'unknown').trim().slice(0, 64) || 'unknown';
}

/** False when a browser says the request was sent by a page on another site. */
export async function sameOrigin(): Promise<boolean> {
  const h = await headers();
  const origin = h.get('origin');
  if (!origin) return true;
  const host = h.get('x-forwarded-host') ?? h.get('host');
  try {
    return new URL(origin).host === host;
  } catch {
    return false; // "null", sent by sandboxed pages, is another site
  }
}

/** Guards an API route: signed in, and the request came from this site. */
export async function guard(): Promise<NextResponse | null> {
  if (!(await sameOrigin())) return NextResponse.json({ error: 'Blocked a request from another site.' }, { status: 403 });
  if (!(await isSignedIn())) return NextResponse.json({ error: 'Sign in again to continue.' }, { status: 401 });
  return null;
}

/** A database id from a link. Anything else is treated as "not found", not as a server error. */
export function rowId(raw: unknown): string | null {
  const s = String(raw ?? '');
  return /^[1-9]\d{0,17}$/.test(s) ? s : null;
}
