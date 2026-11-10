import { q } from './db';
import { colomboDate, formatColombo } from './schedule';
import { RECOMMENDABLE, scopeSql, type Settings } from './settings';

export type JobRow = {
  id: string; title: string; company: string; location: string; country: string | null; market: 'sri_lanka' | 'remote_lk' | 'international';
  work_mode: 'remote' | 'hybrid' | 'onsite' | 'unknown'; sl_eligibility: 'yes' | 'no' | 'unknown'; employment_type: string | null; salary: string | null;
  category: string | null; posted_at: Date | null; deadline: Date | null; first_seen_at: Date; score: number; tier: 'Strong' | 'Good' | 'Potential';
  scored_by: string; explanation: string | null; suitability: string | null; matching_skills: string[]; missing_skills: string[]; mandatory_missing: string[];
  requirements: string[]; description: string; company_info: string | null; url: string; source_label: string; sources: { source: string; url: string }[];
  status: string; status_reason: string | null; verified_at: Date | null; verify_method: string | null; application_id?: string | null;
};

export type JobFilters = { tier?: string; market?: string; sector?: string; mode?: string; type?: string; recent?: string };

/*
 * Lists show a card per job, not the whole advert. Leaving the description out
 * keeps a page of 60 jobs to a few kilobytes from the database, not megabytes.
 */
const LIST_COLUMNS = `j.id, j.title, j.company, j.location, j.country, j.market, j.work_mode, j.sl_eligibility, j.employment_type, j.salary,
  j.category, j.posted_at, j.deadline, j.first_seen_at, j.score, j.tier, j.scored_by, j.explanation, j.suitability, j.matching_skills,
  j.missing_skills, j.mandatory_missing, j.requirements, j.url, j.source_label, j.sources, j.status, j.status_reason, j.verified_at,
  j.verify_method, '' AS description, NULL AS company_info`;

export async function recommended(s: Settings, f: JobFilters = {}, limit = 60): Promise<JobRow[]> {
  const where = [RECOMMENDABLE, 'j.score >= $1'];
  const params: unknown[] = [s.min_score];
  const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
  if (['Strong', 'Good', 'Potential'].includes(f.tier ?? '')) add('j.tier = ?', f.tier);
  if (f.market === 'local') where.push(`j.market = 'sri_lanka'`);
  if (f.market === 'global') where.push(`j.market <> 'sri_lanka'`);
  if (f.sector === 'government') where.push(`j.category = 'Government'`);
  if (f.sector === 'private') where.push(`j.category IS DISTINCT FROM 'Government'`);
  if (f.mode === 'remote') where.push(`j.work_mode = 'remote'`);
  if (f.type === 'full') where.push(`j.employment_type ILIKE 'full%'`);
  if (f.type === 'part') where.push(`j.employment_type ILIKE 'part%'`);
  if (f.recent === '1') where.push(`COALESCE(j.posted_at, j.first_seen_at) > now() - interval '7 days'`);
  params.push(limit);
  return q<JobRow>(
    `SELECT ${LIST_COLUMNS}, a.id application_id FROM jobs j LEFT JOIN applications a ON a.job_id = j.id
     WHERE ${where.join(' AND ')} ${scopeSql(s)} ORDER BY j.score DESC, j.first_seen_at DESC LIMIT $${params.length}`, params);
}

export const MARKET_LABEL = { sri_lanka: 'Sri Lanka', remote_lk: 'Remote, open to Sri Lanka', international: 'International' } as const;
export const MODE_LABEL = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site', unknown: 'Work mode not stated' } as const;
export const VERIFY_LABEL: Record<string, string> = {
  employer_board: 'Open on the employer\'s job board', source_status: 'Confirmed open by the source', page_check: 'Listing page checked and open',
  feed_listing: 'Listed in the source\'s live feed', added_by_you: 'Added by you, not re-checked',
};

const daysBetween = (a: Date, b: Date) => Math.round((new Date(colomboDate(a)).getTime() - new Date(colomboDate(b)).getTime()) / 86_400_000);

/** Plain words for the safety check, so "still open" is visible before a job is opened. */
export function checkedLabel(j: Pick<JobRow, 'verify_method' | 'verified_at'>, now = new Date()): { text: string; checked: boolean } {
  if (j.verify_method === 'added_by_you') return { text: 'Added by you, not checked', checked: false };
  if (!j.verified_at) return { text: 'Not checked yet', checked: false };
  const days = daysBetween(now, new Date(j.verified_at));
  const when = days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
  return { text: `Checked ${when}: still open`, checked: true };
}

/** Counts days down when a deadline is close, and gives the date when it is not. */
export function deadlineLabel(deadline: Date | string, now = new Date()): { text: string; soon: boolean; passed: boolean } {
  const d = new Date(deadline);
  const days = daysBetween(d, now);
  if (d < now) return { text: 'Closed', soon: false, passed: true };
  if (days === 0) return { text: 'Closes today', soon: true, passed: false };
  if (days === 1) return { text: 'Closes tomorrow', soon: true, passed: false };
  if (days <= 7) return { text: `Closes in ${days} days`, soon: true, passed: false };
  return { text: `Apply by ${formatColombo(d, 'date')}`, soon: false, passed: false };
}
