import { NextResponse } from 'next/server';
import { guard, rowId } from '@/lib/auth';
import { one } from '@/lib/db';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guard();
  if (blocked) return blocked;
  const id = rowId((await params).id);
  return NextResponse.json(id ? await one('SELECT id, status, engine, result, error, basis FROM ai_tasks WHERE id=$1', [id]) : null);
}
