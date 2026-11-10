import { NextResponse } from 'next/server';
import { attemptLogin, clientAddress, createSession, sameOrigin } from '@/lib/auth';

export async function POST(req: Request) {
  if (!(await sameOrigin())) return NextResponse.json({ error: 'Blocked a request from another site.' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const r = await attemptLogin(String(b?.email ?? ''), String(b?.password ?? ''), await clientAddress());
  if (r === 'locked') return NextResponse.json({ error: 'Too many attempts. Try again in 15 minutes.' }, { status: 429 });
  if (r === 'bad') return NextResponse.json({ error: 'That email or password is wrong.' }, { status: 401 });
  await createSession();
  return NextResponse.json({ ok: true });
}
