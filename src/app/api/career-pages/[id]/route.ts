import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth';
import { q } from '@/lib/db';

const patch = z.object({ enabled: z.boolean() }).strict();

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guard();
  if (blocked) return blocked;
  const parsed = patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'That change could not be saved.' }, { status: 400 });
  await q('UPDATE career_pages SET enabled=$2 WHERE id=$1', [(await params).id, parsed.data.enabled]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guard();
  if (blocked) return blocked;
  await q('DELETE FROM career_pages WHERE id=$1', [(await params).id]);
  return NextResponse.json({ ok: true });
}
