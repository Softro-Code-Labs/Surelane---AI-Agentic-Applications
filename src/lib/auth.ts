import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { newToken, sha256, verifyPassword } from './crypto';
import { one, q } from './db';

const COOKIE = 'agent_session';
const SESSION_DAYS = 30;
const MAX_FAILURES = 5;
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

/** Result of a sign-in attempt. Locks after repeated failures. */
export async function attemptLogin(email: string, password: string): Promise<'ok' | 'bad' | 'locked'> {
  const key = 'owner';
  const state = await one<{ failures: number; locked_until: Date | null }>('SELECT failures, locked_until FROM login_attempts WHERE key=$1', [key]);
  if (state?.locked_until && new Date(state.locked_until) > new Date()) return 'locked';
  const user = await one<{ email: string; password_hash: string }>('SELECT email, password_hash FROM users WHERE id=1');
  const ok = Boolean(user) && user!.email.toLowerCase() === email.trim().toLowerCase() && (await verifyPassword(password, user!.password_hash));
  if (ok) {
    await q('DELETE FROM login_attempts WHERE key=$1', [key]);
    return 'ok';
  }
  const failures = (state?.failures ?? 0) + 1;
  await q(
    `INSERT INTO login_attempts (key, failures, locked_until, updated_at) VALUES ($1,$2,$3,now())
     ON CONFLICT (key) DO UPDATE SET failures=$2, locked_until=$3, updated_at=now()`,
    [key, failures >= MAX_FAILURES ? 0 : failures, failures >= MAX_FAILURES ? new Date(Date.now() + LOCK_MIN * 60_000) : null]);
  return 'bad';
}

/** Guards an API route: signed in, and the request came from this site. */
export async function guard(): Promise<NextResponse | null> {
  const h = await headers();
  const origin = h.get('origin');
  const host = h.get('x-forwarded-host') ?? h.get('host');
  if (origin && new URL(origin).host !== host) return NextResponse.json({ error: 'Blocked a request from another site.' }, { status: 403 });
  if (!(await isSignedIn())) return NextResponse.json({ error: 'Sign in again to continue.' }, { status: 401 });
  return null;
}
