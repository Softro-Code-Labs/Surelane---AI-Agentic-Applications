import { NextResponse } from 'next/server';
import { destroySession, guard } from '@/lib/auth';
import { q, tx } from '@/lib/db';

export async function POST(req: Request) {
  const blocked = await guard();
  if (blocked) return blocked;
  const { action } = await req.json().catch(() => ({}));
  if (action === 'clear_history') {
    // All or nothing: a failure part-way must not leave results pointing at deleted jobs.
    await tx(async (c) => {
      await c.query('DELETE FROM search_runs WHERE status <> $1', ['running']);
      await c.query('DELETE FROM jobs');
      await c.query('DELETE FROM notifications');
      await c.query('DELETE FROM ai_tasks');
    });
    return NextResponse.json({ ok: true });
  }
  if (action === 'delete_account') {
    await q('TRUNCATE jobs, search_runs, search_run_sources, search_requests, search_results, notifications, ai_tasks, cleanup_runs, applications, career_pages, cv, cover_letter, users, sessions, login_attempts CASCADE');
    await q(`UPDATE settings SET email_recipient = NULL, updated_at = now()`);
    await destroySession();
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
