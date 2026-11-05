import { beforeEach, describe, expect, it } from 'vitest';
import { cleanupDue, runCleanup, storageStats } from '@/lib/cleanup';
import { one, q } from '@/lib/db';
import { tick } from '@/worker/tick';
import { resetDb, withCv } from './helpers';

const NOW = new Date('2026-11-04T21:31:00Z'); // 03:01 Colombo
const ago = (days: number, hours = 0) => new Date(NOW.getTime() - days * 86_400_000 - hours * 3_600_000);
let n = 0;

async function job(lastSeen: Date, status = 'active') {
  n++;
  return (await one(`INSERT INTO jobs (fingerprint, source, source_label, url, title, company, market, status, first_seen_at, last_seen_at)
    VALUES ($1,'s','s','https://x.test','T','C','sri_lanka',$2,$3,$3) RETURNING id`, [`fp${n}`, status, lastSeen])).id as string;
}
async function run(when: Date) {
  const id = (await one(`INSERT INTO search_runs (trigger,status,started_at,finished_at) VALUES ('manual','completed',$1,$1) RETURNING id`, [when])).id;
  await q(`INSERT INTO search_run_sources (run_id, source, label, status, checked_at) VALUES ($1,'s','s','success',$2)`, [id, when]);
  return id;
}

beforeEach(resetDb);

describe('30-day rolling retention', () => {
  it('deletes only what is older than exactly 30 days', async () => {
    const keep = await job(ago(29, 23));
    const border = await job(ago(30, -1));
    const old = await job(ago(30, 1));
    const r = await runCleanup(NOW);
    expect(r.status).toBe('completed');
    const left = (await q(`SELECT id FROM jobs ORDER BY id`)).map((x) => x.id);
    expect(left).toEqual([keep, border]);
    expect(left).not.toContain(old);
  });

  it('day 31 removes day 1, and the window keeps rolling every day', async () => {
    const start = new Date('2026-10-01T04:00:00Z');
    for (let d = 0; d < 35; d++) await job(new Date(start.getTime() + d * 86_400_000));
    for (let day = 30; day < 35; day++) {
      const now = new Date(start.getTime() + day * 86_400_000 + 3_600_000);
      await runCleanup(now);
      const oldest = (await one(`SELECT min(last_seen_at) m FROM jobs`)).m;
      expect((now.getTime() - new Date(oldest).getTime()) / 86_400_000).toBeLessThanOrEqual(30);
    }
    expect((await one(`SELECT count(*)::int c FROM jobs`)).c).toBe(30);
  });

  it('cleans every class of history you listed', async () => {
    const oldJob = await job(ago(40), 'expired');
    const oldRun = await run(ago(40));
    await q(`INSERT INTO search_results (run_id, job_id, created_at) VALUES ($1,$2,$3)`, [oldRun, oldJob, ago(40)]);
    await q(`INSERT INTO notifications (kind, recipient, subject, status, created_at) VALUES ('matches','a','b','sent',$1)`, [ago(40)]);
    await q(`INSERT INTO ai_tasks (kind, created_at) VALUES ('career_recs',$1)`, [ago(40)]);
    await q(`INSERT INTO search_requests (requested_at) VALUES ($1)`, [ago(40)]);
    await q(`INSERT INTO cleanup_runs (status, started_at) VALUES ('completed',$1)`, [ago(40)]);
    const fresh = await run(ago(1));
    await runCleanup(NOW);
    for (const t of ['jobs', 'search_results', 'notifications', 'ai_tasks', 'search_requests']) {
      expect((await one(`SELECT count(*)::int c FROM ${t}`)).c, t).toBe(0);
    }
    expect((await q(`SELECT id FROM search_runs`)).map((r) => r.id)).toEqual([fresh]);
    expect((await one(`SELECT count(*)::int c FROM search_run_sources`)).c).toBe(1);
    expect((await one(`SELECT count(*)::int c FROM cleanup_runs WHERE started_at < $1`, [ago(30)])).c).toBe(0);
  });

  it('never touches your CV, profile, account, settings or tracker, however old', async () => {
    await withCv();
    await q(`UPDATE cv SET uploaded_at=$1`, [ago(400)]);
    await q(`INSERT INTO users (email, password_hash, created_at) VALUES ('a@b.c','x',$1)`, [ago(400)]);
    await q(`UPDATE settings SET updated_at=$1, min_score=70`, [ago(400)]);
    const j = await job(ago(40));
    await q(`INSERT INTO applications (job_id, title, company, url, status, notes, created_at, updated_at) VALUES ($1,'Dev','Acme','https://x.test','Applied','Called them',$2,$2)`, [j, ago(400)]);
    await runCleanup(NOW);
    expect((await one(`SELECT count(*)::int c FROM cv`)).c).toBe(1);
    expect((await one(`SELECT profile FROM cv`)).profile.name).toBe('Nimali Perera');
    expect((await one(`SELECT count(*)::int c FROM users`)).c).toBe(1);
    expect((await one(`SELECT min_score FROM settings`)).min_score).toBe(70);
    expect((await one(`SELECT count(*)::int c FROM jobs`)).c).toBe(0);
    const app = await one(`SELECT * FROM applications`);
    expect(app).toMatchObject({ title: 'Dev', company: 'Acme', status: 'Applied', notes: 'Called them', job_id: null, url: 'https://x.test' });
  });

  it('does not interrupt an active search, and retries afterwards', async () => {
    await job(ago(40));
    await q(`INSERT INTO search_runs (trigger,status) VALUES ('manual','running')`);
    expect((await runCleanup(NOW)).status).toBe('skipped');
    expect((await one(`SELECT count(*)::int c FROM jobs`)).c).toBe(1);
    expect(await cleanupDue(NOW)).toBe(true);
    await q(`UPDATE search_runs SET status='completed'`);
    expect((await runCleanup(NOW)).status).toBe('completed');
    expect(await cleanupDue(NOW)).toBe(false);
  });

  it('runs once per day from the 03:00 mark, automatically', async () => {
    expect(await cleanupDue(NOW)).toBe(true);
    await runCleanup(NOW);
    expect(await cleanupDue(new Date(NOW.getTime() + 3_600_000))).toBe(false);
    expect(await cleanupDue(new Date(NOW.getTime() + 25 * 3_600_000))).toBe(true);
  });

  it('runs even while the agent is switched off', async () => {
    await q(`UPDATE settings SET agent_enabled=false`);
    await job(ago(40));
    await tick({ provider: null, now: () => NOW, log: () => {}, env: {} });
    expect((await one(`SELECT count(*)::int c FROM jobs`)).c).toBe(0);
  });

  it('deletes large volumes in batches and keeps lifetime counts', async () => {
    await q(`INSERT INTO jobs (fingerprint, source, source_label, url, title, company, market, last_seen_at)
             SELECT 'bulk'||g,'s','s','https://x.test','T','C','sri_lanka',$1 FROM generate_series(1,5500) g`, [ago(40)]);
    await job(ago(1));
    const r = await runCleanup(NOW);
    expect(r.deleted.jobs).toBe(5500);
    await job(ago(40));
    await runCleanup(new Date(NOW.getTime() + 86_400_000));
    const s = await storageStats();
    expect(s.lifetimeDeleted).toBe(5501);
    expect(Number(s.counts.jobs)).toBe(1);
    expect(s.bytes).toBeGreaterThan(0);
    expect(s.last?.total_deleted).toBe(1);
  });

  it('uses indexes for its age queries', async () => {
    const idx = await q(`SELECT indexname FROM pg_indexes WHERE schemaname='public'`);
    const names = idx.map((i) => i.indexname);
    for (const n of ['jobs_last_seen_idx', 'search_runs_started_idx', 'run_sources_checked_idx', 'search_results_time_idx', 'notifications_time_idx', 'ai_tasks_time_idx', 'cleanup_runs_time_idx', 'search_requests_time_idx']) {
      expect(names).toContain(n);
    }
  });

  it('rejects a duplicate job record at database level', async () => {
    await q(`INSERT INTO jobs (fingerprint, source, source_label, url, title, company, market) VALUES ('same','s','s','u','t','c','sri_lanka')`);
    await expect(q(`INSERT INTO jobs (fingerprint, source, source_label, url, title, company, market) VALUES ('same','s','s','u','t','c','sri_lanka')`)).rejects.toThrow(/duplicate/);
  });
});
