import { one, pool, q } from './db';
import { RETENTION_DAYS, lastCleanupMark, retentionCutoff } from './schedule';

const BATCH = 2000;

/**
 * table → the timestamp that ages it. Tables holding your CV, profile, account,
 * settings and application tracker are deliberately absent, so no code path here
 * can touch them.
 *
 * jobs ages by last_seen_at: a vacancy still being listed is current data, and
 * dropping it would make it look new and email you about it a second time.
 */
export const RETENTION_TARGETS = [
  { table: 'search_results', key: '(run_id, job_id)', column: 'created_at', label: 'Search results' },
  { table: 'search_run_sources', key: 'id', column: 'checked_at', label: 'Source check logs' },
  { table: 'search_requests', key: 'id', column: 'requested_at', label: 'Manual search requests' },
  { table: 'notifications', key: 'id', column: 'created_at', label: 'Notification history' },
  { table: 'ai_tasks', key: 'id', column: 'created_at', label: 'Temporary AI data' },
  { table: 'search_runs', key: 'id', column: 'started_at', label: 'Search execution logs' },
  { table: 'jobs', key: 'id', column: 'last_seen_at', label: 'Job listings' },
  { table: 'cleanup_runs', key: 'id', column: 'started_at', label: 'Old cleanup logs' },
] as const;

async function deleteBatched(table: string, key: string, column: string, cutoff: Date): Promise<number> {
  let total = 0;
  for (;;) {
    // Small transactions keep locks brief, so a search can start alongside this.
    const res = await pool().query(
      `DELETE FROM ${table} WHERE ${key} IN (SELECT ${key.replace(/[()]/g, '')} FROM ${table} WHERE ${column} < $1 LIMIT ${BATCH})`, [cutoff]);
    total += res.rowCount ?? 0;
    if ((res.rowCount ?? 0) < BATCH) return total;
  }
}

export async function cleanupDue(now: Date): Promise<boolean> {
  const last = await one<{ started_at: Date }>(`SELECT started_at FROM cleanup_runs WHERE status = 'completed' ORDER BY started_at DESC LIMIT 1`);
  return !last || new Date(last.started_at) < lastCleanupMark(now);
}

export type CleanupResult = { status: 'completed' | 'skipped' | 'failed'; total: number; deleted: Record<string, number>; note?: string };

export async function runCleanup(now: Date = new Date()): Promise<CleanupResult> {
  const active = await one(`SELECT id FROM search_runs WHERE status = 'running' LIMIT 1`);
  if (active) {
    // Not recorded as completed, so the next trigger tries again.
    await q(`INSERT INTO cleanup_runs (status, started_at, finished_at, note) VALUES ('skipped', $1, $1, 'A search was running')`, [now]);
    return { status: 'skipped', total: 0, deleted: {}, note: 'A search was running' };
  }
  const run = (await one<{ id: string }>(`INSERT INTO cleanup_runs (status, started_at) VALUES ('running', $1) RETURNING id`, [now]))!;
  const cutoff = retentionCutoff(now);
  const deleted: Record<string, number> = {};
  try {
    for (const t of RETENTION_TARGETS) deleted[t.table] = await deleteBatched(t.table, t.key, t.column, cutoff);
    const counted = (await pool().query(`DELETE FROM sessions WHERE expires_at < $1`, [now])).rowCount ?? 0;
    await pool().query(`DELETE FROM login_attempts WHERE updated_at < $1`, [new Date(now.getTime() - 86_400_000)]);
    const total = Object.values(deleted).reduce((a, b) => a + b, 0);
    await q(`UPDATE app_state SET value = to_jsonb((value::text)::bigint + $1) WHERE key = 'records_deleted_lifetime'`, [total]);
    await q(`UPDATE cleanup_runs SET status='completed', finished_at=$2, deleted=$3::jsonb, total_deleted=$4, note=$5 WHERE id=$1`,
      [run.id, new Date(), JSON.stringify(deleted), total, `Retention ${RETENTION_DAYS} days. ${counted} expired sign-ins removed.`]);
    if (total > 0) {
      // Space is reused by Postgres after this, so the database stops growing.
      for (const t of ['jobs', 'search_results', 'search_runs', 'search_run_sources', 'ai_tasks', 'notifications']) {
        await pool().query(`VACUUM (ANALYZE) ${t}`).catch(() => {});
      }
    }
    return { status: 'completed', total, deleted };
  } catch (e) {
    const note = e instanceof Error ? e.message : String(e);
    await q(`UPDATE cleanup_runs SET status='failed', finished_at=$2, deleted=$3::jsonb, note=$4 WHERE id=$1`, [run.id, new Date(), JSON.stringify(deleted), note]);
    return { status: 'failed', total: 0, deleted, note };
  }
}

export async function storageStats() {
  const size = await one<{ bytes: string }>(`SELECT pg_database_size(current_database()) bytes`);
  const counts = await one<Record<string, string>>(
    `SELECT (SELECT count(*) FROM jobs) jobs, (SELECT count(*) FROM jobs WHERE status <> 'active') inactive_jobs,
            (SELECT count(*) FROM search_runs) runs, (SELECT count(*) FROM search_results) results,
            (SELECT count(*) FROM notifications) notifications, (SELECT count(*) FROM ai_tasks) ai_tasks,
            (SELECT count(*) FROM applications) applications,
            (SELECT min(last_seen_at) FROM jobs)::text oldest`);
  const last = await one<{ started_at: Date; finished_at: Date; total_deleted: number; deleted: Record<string, number> }>(
    `SELECT started_at, finished_at, total_deleted, deleted FROM cleanup_runs WHERE status = 'completed' ORDER BY started_at DESC LIMIT 1`);
  const lifetime = await one<{ value: number }>(`SELECT value FROM app_state WHERE key = 'records_deleted_lifetime'`);
  const lastAttempt = await one<{ status: string; note: string | null; started_at: Date }>(
    `SELECT status, note, started_at FROM cleanup_runs ORDER BY started_at DESC LIMIT 1`);
  return { bytes: Number(size?.bytes ?? 0), counts: counts ?? {}, last, lifetimeDeleted: Number(lifetime?.value ?? 0), lastAttempt };
}
