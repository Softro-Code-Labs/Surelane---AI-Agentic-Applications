import { readFileSync } from 'node:fs';
import { analyseCv } from '../src/lib/cv/parse';
import { pool, q } from '../src/lib/db';
import { storeCv } from '../src/lib/ai/tasks';
import type { SourceAdapter } from '../src/lib/sources/types';

const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
export const cvText = readFileSync(new URL('./fixtures/sample-cv.txt', import.meta.url), 'utf8');
export const profile = () => analyseCv(cvText, new Date('2026-11-04T00:00:00Z'));

export async function resetDb() {
  await pool().query(schema);
  await pool().query(`TRUNCATE users, settings, cv, applications, career_pages, jobs, search_runs, search_run_sources, search_requests,
    search_results, notifications, ai_tasks, cleanup_runs, sessions, login_attempts RESTART IDENTITY CASCADE`);
  await q(`INSERT INTO settings (id, schedule_changed_at) VALUES (1, '2026-01-01')`);
  await q(`UPDATE app_state SET value='0' WHERE key='records_deleted_lifetime'`);
}

export async function withCv() {
  return storeCv(Buffer.from('%PDF-fake'), 'application/pdf', 'cv.pdf', cvText, profile());
}

export function jobDescription(extra = '') {
  return `We are hiring.\n\nRequirements\n• 3+ years of experience with React and TypeScript\n• Node.js and PostgreSQL\n• Docker and AWS\n${extra}`;
}

export function source(id: string, jobs: any[], over: Partial<SourceAdapter> = {}): SourceAdapter {
  return {
    id, label: id, region: 'Sri Lanka', scope: 'local', note: '',
    search: async () => jobs.map((j, i) => ({
      source: id, sourceLabel: id, sourceJobId: String(i), url: `https://example.org/${id}/${i}`, title: 'Software Engineer', company: 'Acme',
      location: 'Colombo', country: 'Sri Lanka', workMode: 'onsite', description: jobDescription(), postedAt: new Date('2026-11-03T00:00:00Z'), ...j,
    })),
    verify: async (rows) => new Map(rows.map((r) => [r.id, 'active' as const])),
    ...over,
  };
}
