import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth';
import { q } from '@/lib/db';

const patch = z.object({
  status: z.enum(['Saved', 'Interested', 'Applied', 'Interview', 'Shortlisted', 'Rejected', 'Offer Received']).optional(),
  notes: z.string().max(5000).optional(), cover_letter: z.string().max(10000).optional(),
}).strict();

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guard();
  if (blocked) return blocked;
  const parsed = patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'That change could not be saved.' }, { status: 400 });
  const { status, notes, cover_letter } = parsed.data;
  await q(`UPDATE applications SET status=COALESCE($2,status), notes=COALESCE($3,notes), cover_letter=COALESCE($4,cover_letter), updated_at=now() WHERE id=$1`,
    [(await params).id, status ?? null, notes ?? null, cover_letter ?? null]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guard();
  if (blocked) return blocked;
  await q('DELETE FROM applications WHERE id=$1', [(await params).id]);
  return NextResponse.json({ ok: true });
}
