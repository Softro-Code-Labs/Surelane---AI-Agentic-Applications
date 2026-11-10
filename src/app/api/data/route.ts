import { NextResponse } from 'next/server';
import { destroySession, guard } from '@/lib/auth';
import { q } from '@/lib/db';

export async function POST(req: Request) {
  const blocked = await guard();
  if (blocked) return blocked;
  const { action } = await req.json().catch(() => ({}));
  if (action === 'clear_history') {
    await q('DELETE FROM search_runs WHERE status <> $1', ['running']);
    await q('DELETE FROM jobs');
    await q('DELETE FROM notifications');
    await q('DELETE FROM ai_tasks');
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
