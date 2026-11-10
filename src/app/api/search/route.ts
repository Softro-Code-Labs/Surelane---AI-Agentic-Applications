import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { one, q } from '@/lib/db';
import { triggerWorker } from '@/lib/dispatch';
import { SCOPE_OFF, getCv, getSettings, searchesOff } from '@/lib/settings';

export async function POST() {
  const blocked = await guard();
  if (blocked) return blocked;
  const s = await getSettings();
  if (!s.agent_enabled) return NextResponse.json({ error: 'The agent is off. Turn it on to search.' }, { status: 409 });
  if (searchesOff(s)) return NextResponse.json({ error: SCOPE_OFF }, { status: 409 });
  if (!(await getCv())) return NextResponse.json({ error: 'Upload your CV first, so there is something to match against.' }, { status: 409 });
  if (await one(`SELECT id FROM search_requests WHERE status='pending' LIMIT 1`)) return NextResponse.json({ ok: true, queued: true, started: false });
  await q('INSERT INTO search_requests DEFAULT VALUES');
  return NextResponse.json({ ok: true, queued: true, started: await triggerWorker() });
}

export async function GET() {
  const blocked = await guard();
  if (blocked) return blocked;
  const running = await one(`SELECT id, started_at FROM search_runs WHERE status='running' LIMIT 1`);
  const pending = await one(`SELECT id FROM search_requests WHERE status='pending' LIMIT 1`);
  const last = await one(`SELECT id, status, summary, finished_at, trigger FROM search_runs WHERE status NOT IN ('running','missed') ORDER BY started_at DESC LIMIT 1`);
  return NextResponse.json({ running: Boolean(running), pending: Boolean(pending), last });
}
