import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createSession, ownerExists, sameOrigin } from '@/lib/auth';
import { hashPassword, safeEqual } from '@/lib/crypto';
import { one, q } from '@/lib/db';

const body = z.object({ name: z.string().trim().min(1).max(100), email: z.string().trim().email().max(200), password: z.string().min(10).max(200), code: z.string().max(200).optional() });

export async function POST(req: Request) {
  if (!(await sameOrigin())) return NextResponse.json({ error: 'Blocked a request from another site.' }, { status: 403 });
  if (await ownerExists()) return NextResponse.json({ error: 'An account already exists. Sign in instead.' }, { status: 409 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter your name, a valid email and a password of at least 10 characters.' }, { status: 400 });
  const need = process.env.SETUP_CODE;
  // Without a code, the first visitor to a deployed app could claim it.
  if (!need && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'SETUP_CODE is not set where this app is hosted. Add it, redeploy, then create your account. It stops a stranger claiming the app.' }, { status: 403 });
  }
  if (need && !safeEqual(parsed.data.code ?? '', need)) return NextResponse.json({ error: 'That setup code is wrong. It is the SETUP_CODE value you saved during deployment.' }, { status: 403 });
  // Only the request that actually created the account is signed in.
  const created = await one('INSERT INTO users (id, email, name, password_hash) VALUES (1,$1,$2,$3) ON CONFLICT DO NOTHING RETURNING id', [parsed.data.email, parsed.data.name, await hashPassword(parsed.data.password)]);
  if (!created) return NextResponse.json({ error: 'An account already exists. Sign in instead.' }, { status: 409 });
  await q(`UPDATE settings SET email_recipient = COALESCE(email_recipient, $1) WHERE id = 1`, [parsed.data.email]);
  await createSession();
  return NextResponse.json({ ok: true });
}
