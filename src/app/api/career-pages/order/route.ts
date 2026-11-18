import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard, rowId } from '@/lib/auth';
import { q } from '@/lib/db';
import { MAX_CAREER_PAGES } from '@/lib/sources/career';

const body = z.object({ ids: z.array(z.string()).min(1).max(MAX_CAREER_PAGES) }).strict();

/** Saves your order for one category's companies: the first id is shown first. */
export async function PUT(req: Request) {
  const blocked = await guard();
  if (blocked) return blocked;
  const parsed = body.safeParse(await req.json().catch(() => null));
  const ids = parsed.success ? parsed.data.ids.map(rowId) : [];
  if (!parsed.success || ids.some((id) => !id) || new Set(ids).size !== ids.length) {
    return NextResponse.json({ error: 'That order could not be saved.' }, { status: 400 });
  }
  // One statement, so the order is saved whole or not at all.
  await q(
    `UPDATE career_pages c SET sort_order = o.pos
       FROM unnest($1::bigint[]) WITH ORDINALITY AS o(id, pos)
      WHERE c.id = o.id`, [ids]);
  return NextResponse.json({ ok: true });
}
