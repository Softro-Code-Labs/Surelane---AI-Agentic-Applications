import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { one } from '@/lib/db';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guard();
  return blocked ?? NextResponse.json(await one('SELECT id, status, engine, result, error FROM ai_tasks WHERE id=$1', [(await params).id]));
}
