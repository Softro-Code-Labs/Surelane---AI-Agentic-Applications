import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard, rowId } from '@/lib/auth';
import { resolveCategory } from '@/lib/career-categories';
import { q } from '@/lib/db';
import { existingCategories } from '@/lib/sources/registry';

const patch = z.union([
  z.object({ enabled: z.boolean() }).strict(),
  z.object({ category: z.string().max(200).nullable() }).strict(),
]);

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guard();
  if (blocked) return blocked;
  const parsed = patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'That change could not be saved.' }, { status: 400 });
  const id = rowId((await params).id);
  if ('enabled' in parsed.data) await q('UPDATE career_pages SET enabled=$2 WHERE id=$1', [id, parsed.data.enabled]);
  else await q('UPDATE career_pages SET category=$2 WHERE id=$1', [id, resolveCategory(parsed.data.category, await existingCategories())]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guard();
  if (blocked) return blocked;
  await q('DELETE FROM career_pages WHERE id=$1', [rowId((await params).id)]);
  return NextResponse.json({ ok: true });
}
