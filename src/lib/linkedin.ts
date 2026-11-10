import type { CandidateProfile } from './cv/parse';
import { cvRoles, cvSkills } from './cv-terms';
import type { Settings } from './settings';

/*
 * LinkedIn has no public job-search API and its terms forbid automated reading,
 * so Surelane never opens it. Instead it builds LinkedIn searches from your CV,
 * which you open in your own browser. The filter codes below are the ones
 * LinkedIn's own search page puts in its address. They are not a published API,
 * so if LinkedIn renames one, that filter is ignored and the search still opens.
 */

export type Posted = 'day' | 'week' | 'month';
export type LinkedinQuery = { keywords: string; location: string; experience?: number[]; workType?: number[]; posted?: Posted };
export type LinkedinSearch = { scope: 'local' | 'global'; label: string; why: string; facts: string[]; url: string };

const POSTED: Record<Posted, string> = { day: 'r86400', week: 'r604800', month: 'r2592000' };
const POSTED_LABEL: Record<Posted, string> = { day: 'Past 24 hours', week: 'Past week', month: 'Past month' };
const EXPERIENCE_LABEL: Record<number, string> = { 1: 'Internship', 2: 'Entry level', 3: 'Associate', 4: 'Mid-Senior', 5: 'Director', 6: 'Executive' };
const WORK_LABEL: Record<number, string> = { 1: 'On-site', 2: 'Remote', 3: 'Hybrid' };

/** Your CV's level, as LinkedIn's experience filter (f_E) counts it. */
const LEVELS: Record<CandidateProfile['experienceLevel'], number[]> = {
  Internship: [1, 2], 'Entry level': [2, 3], 'Mid level': [3, 4], Senior: [4], Lead: [4, 5],
};

export function linkedinSearchUrl(q: LinkedinQuery): string {
  const p = new URLSearchParams({ keywords: q.keywords, location: q.location });
  if (q.experience?.length) p.set('f_E', q.experience.join(','));
  if (q.workType?.length) p.set('f_WT', q.workType.join(','));
  if (q.posted) p.set('f_TPR', POSTED[q.posted]);
  return `https://www.linkedin.com/jobs/search/?${p}`;
}

function facts(q: LinkedinQuery): string[] {
  return [
    q.location,
    q.experience?.length ? q.experience.map((n) => EXPERIENCE_LABEL[n]).join(' or ') : null,
    q.workType?.length ? q.workType.map((n) => WORK_LABEL[n]).join(' or ') : null,
    q.posted ? POSTED_LABEL[q.posted] : null,
  ].filter((f): f is string => Boolean(f));
}

const quote = (s: string) => `"${s.replace(/"/g, '')}"`;
const listOf = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} or ${xs.at(-1)}`);

/**
 * A short list of LinkedIn searches built from your CV and search settings, best first.
 * Local searches look in Sri Lanka and global ones abroad, each only when its switch is on.
 * With both on, global searches keep at least 3 of the places.
 */
export function linkedinSearches(p: CandidateProfile, s: Pick<Settings, 'extra_keywords' | 'preferred_locations' | 'preferred_countries' | 'remote_pref' | 'local_enabled' | 'global_enabled' | 'max_post_age_days'>, max = 8): LinkedinSearch[] {
  const roles = cvRoles(p, s);
  const skills = cvSkills(p);
  const place = s.preferred_locations[0]?.trim() || 'Sri Lanka';
  const experience = LEVELS[p.experienceLevel] ?? [];
  const workType = s.remote_pref === 'remote' ? [2] : s.remote_pref === 'hybrid' ? [3] : s.remote_pref === 'onsite' ? [1] : [];
  const posted: Posted = s.max_post_age_days <= 1 ? 'day' : s.max_post_age_days <= 7 ? 'week' : 'month';
  const level = p.experienceLevel.toLowerCase();

  const out = new Map<string, LinkedinSearch>();
  const add = (scope: LinkedinSearch['scope'], label: string, why: string, q: LinkedinQuery) => {
    const url = linkedinSearchUrl(q);
    if (!out.has(url)) out.set(url, { scope, label, why, facts: facts(q), url });
  };
  const [role, second] = roles;
  const remoteOk = s.remote_pref !== 'onsite';

  if (s.local_enabled) {
    const base = { location: place, experience, workType, posted };
    roles.forEach((r, i) => add('local', r, i === 0 && s.extra_keywords.length === 0 ? `Your CV points most strongly to this role, at ${level} level.` : `A role that fits your CV, at ${level} level.`, { ...base, keywords: r }));
    if (role) add('local', `${role}, posted today`, 'Only jobs from the last 24 hours, so you can apply early.', { ...base, keywords: role, posted: 'day' });
    if (skills.length >= 2) add('local', `Jobs asking for ${listOf(skills)}`, 'Your strongest skills, whatever the job is called.', { ...base, keywords: skills.map(quote).join(' OR ') });
    if (role && skills[0]) add('local', `${role} with ${skills[0]}`, 'Narrows the role to jobs that mention your top skill.', { ...base, keywords: `${role} ${quote(skills[0])}` });
    if (role && remoteOk) add('local', `Remote ${role} in ${place}`, `Remote jobs listed for ${place}.`, { ...base, keywords: role, workType: [2] });
  }
  if (s.global_enabled) {
    const base = { experience, workType, posted };
    const countries = s.preferred_countries.slice(0, 2);
    if (role) for (const country of countries) add('global', `${role} in ${country}`, 'One of the countries in your search settings.', { ...base, keywords: role, location: country });
    if (role && remoteOk) add('global', `Remote ${role}, worldwide`, 'Remote jobs with employers anywhere in the world.', { ...base, keywords: role, location: 'Worldwide', workType: [2] });
    if (role && !countries.length) add('global', `${role}, worldwide`, 'Jobs anywhere in the world. Add preferred countries in Search settings to narrow this.', { ...base, keywords: role, location: 'Worldwide' });
    if (skills.length >= 2 && remoteOk) add('global', `Remote jobs asking for ${listOf(skills)}`, 'Your strongest skills, in remote jobs worldwide.', { ...base, keywords: skills.map(quote).join(' OR '), location: 'Worldwide', workType: [2] });
    if (second && remoteOk) add('global', `Remote ${second}, worldwide`, 'Another role that fits your CV, in remote jobs worldwide.', { ...base, keywords: second, location: 'Worldwide', workType: [2] });
  }
  const all = [...out.values()];
  const local = all.filter((x) => x.scope === 'local'), global = all.filter((x) => x.scope === 'global');
  const localPlaces = global.length ? Math.min(local.length, max - Math.min(global.length, 3)) : max;
  return [...local.slice(0, localPlaces), ...global.slice(0, max - Math.min(local.length, localPlaces))];
}

/**
 * The job ID in a LinkedIn link: a job page, a tracking link from an email or
 * the app, or a search page with a job open in it (currentJobId).
 */
export function linkedinJobId(raw: string): string | null {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (!/(^|\.)linkedin\.com$/i.test(u.hostname)) return null;
  const view = u.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d{6,})\/?$/i);
  if (view) return view[1]!;
  const open = u.searchParams.get('currentJobId');
  return open && /^\d{6,}$/.test(open) ? open : null;
}

export const isLinkedinUrl = (raw: string) => {
  try { return /(^|\.)linkedin\.com$/i.test(new URL(raw.trim()).hostname); } catch { return false; }
};

/** The job's own page, without tracking, rebuilt from its ID. */
export const linkedinJobUrl = (id: string) => `https://www.linkedin.com/jobs/view/${id}/`;
