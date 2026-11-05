import type { CandidateProfile } from '../cv/parse';
import { ADJACENT, DEGREE_LEVELS, FAMILY_LABEL, SOFT_SKILLS, degreeLevel, familyOfTitle, findQualifications, findSkills } from './taxonomy';

export type Tier = 'Strong' | 'Good' | 'Potential';
export type MatchInput = { title: string; description: string; location?: string; workMode?: string; category?: string | null };
export type MatchPrefs = { remote_pref?: string; preferred_locations?: string[]; categories?: string[]; industries?: string[] };

export type MatchResult = {
  score: number;
  tier: Tier | null;
  relevant: boolean;
  matchingSkills: string[];
  missingSkills: string[];
  mandatoryMissing: string[];
  explanation: string;
  suitability: string;
  requirements: string[];
};

export const tierFor = (score: number): Tier | null => (score >= 75 ? 'Strong' : score >= 60 ? 'Good' : score >= 45 ? 'Potential' : null);

const REQ_HEAD = /(requirement|qualification|must have|what you('ll)? need|what we('re| are) looking for|you have|skills? required|essential|who you are|about you)/i;
const NICE_HEAD = /(nice to have|preferred|bonus|desirable|good to have|plus\b|advantage)/i;
const OTHER_HEAD = /^(responsibilit|what you('ll)? do|the role|about (us|the company)|benefits|what we offer|perks|duties|your role)/i;

export function requirementLines(description: string): { required: string[]; nice: string[] } {
  const required: string[] = [], nice: string[] = [];
  let mode: 'none' | 'req' | 'nice' = 'none';
  for (const raw of description.split('\n')) {
    const l = raw.trim();
    if (!l) continue;
    const heading = l.length < 70 && !/^[•\-*]/.test(l);
    if (heading && NICE_HEAD.test(l)) { mode = 'nice'; continue; }
    if (heading && REQ_HEAD.test(l)) { mode = 'req'; continue; }
    if (heading && OTHER_HEAD.test(l)) { mode = 'none'; continue; }
    const body = l.replace(/^[•\-*]\s*/, '');
    if (mode === 'req') required.push(body);
    if (mode === 'nice') nice.push(body);
  }
  return { required: required.slice(0, 20), nice: nice.slice(0, 10) };
}

export function requiredYears(text: string): number | null {
  const m = [...text.matchAll(/(\d{1,2})\s*(?:\+|plus)?\s*(?:-|–|to)?\s*\d{0,2}\s*\+?\s*(?:years?|yrs?)(?:'|’)?\s*(?:of\s+)?(?:\w+\s+){0,3}?(?:experience|exp\b)/gi)];
  const values = m.map((x) => Number(x[1])).filter((n) => n <= 20);
  return values.length ? Math.min(...values) : null;
}

function seniorityGap(title: string, p: CandidateProfile): number {
  const t = title.toLowerCase();
  if (/\b(chief|head of|vice president|vp|director|principal)\b/.test(t)) return p.yearsExperience >= 10 ? 0 : 2;
  if (/\b(senior|sr\.?|lead|manager|architect|staff)\b/.test(t)) return p.yearsExperience >= 5 ? 0 : p.yearsExperience >= 3 ? 1 : 2;
  if (/\b(intern|internship|trainee|graduate|junior|jr\.?|associate)\b/.test(t)) return p.yearsExperience > 6 ? 1 : 0;
  return 0;
}

export function scoreJob(job: MatchInput, p: CandidateProfile, prefs: MatchPrefs = {}): MatchResult {
  const text = `${job.title}\n${job.description}`;
  const { required, nice } = requirementLines(job.description);
  const reqText = required.join('\n');
  const jobSkills = findSkills(text);
  const reqSkills = new Set(required.length ? findSkills(reqText) : jobSkills);
  const titleSkills = new Set(findSkills(job.title));

  const mine = new Set(p.skills);
  const weight = (s: string) => (SOFT_SKILLS.has(s) ? 0.4 : titleSkills.has(s) ? 3 : reqSkills.has(s) ? 2 : 1);
  let have = 0, want = 0;
  for (const s of jobSkills) { want += weight(s); if (mine.has(s)) have += weight(s); }
  const skillFit = want ? have / want : 0;

  const jobFamily = familyOfTitle(job.title);
  const primary = p.families[0];
  const familyFit = !jobFamily ? 0.35
    : p.families.includes(jobFamily) ? (jobFamily === primary ? 1 : 0.85)
    : primary && ADJACENT[primary]?.includes(jobFamily) ? 0.6 : 0.05;

  const titleWords = new Set(job.title.toLowerCase().split(/[^a-z+#.]+/).filter((w) => w.length > 2));
  const titleFit = Math.max(0, ...p.targetTitles.map((t) => {
    const words = t.toLowerCase().split(/[^a-z+#.]+/).filter((w) => w.length > 2);
    return words.length ? words.filter((w) => titleWords.has(w)).length / words.length : 0;
  }));

  const needYears = requiredYears(reqText || job.description);
  const gap = seniorityGap(job.title, p);
  let expFit = 1;
  if (needYears !== null && p.yearsExperience < needYears) expFit = Math.max(0, 1 - (needYears - p.yearsExperience) / Math.max(needYears, 2));
  expFit = Math.max(0, expFit - gap * 0.35);

  const needQuals = findQualifications(reqText || job.description);
  const myQuals = new Set(p.qualifications);
  const missingQuals = needQuals.filter((q) => !myQuals.has(q));
  const needDegree = required.length ? degreeLevel(reqText) : 0;
  const mandatoryMissing = [...missingQuals];
  if (needDegree > p.degreeLevel && p.degreeLevel >= 0) {
    mandatoryMissing.push(DEGREE_LEVELS.find((d) => d.level === needDegree)?.label ?? 'Required education');
  }
  if (needYears !== null && p.yearsExperience + 1 < needYears) mandatoryMissing.push(`${needYears}+ years of experience`);

  const qualFit = mandatoryMissing.length === 0 ? 1 : Math.max(0, 1 - 0.34 * mandatoryMissing.length);

  let raw = (want ? 0.42 * skillFit : 0.2 * familyFit) + 0.24 * familyFit + 0.1 * titleFit + 0.14 * expFit + 0.1 * qualFit + (want ? 0 : 0.1 * titleFit);

  const hay = `${job.title} ${job.category ?? ''} ${job.description}`.toLowerCase();
  if (prefs.categories?.some((c) => c && hay.includes(c.toLowerCase()))) raw += 0.04;
  if (prefs.industries?.some((c) => c && hay.includes(c.toLowerCase()))) raw += 0.03;
  if (prefs.preferred_locations?.some((c) => c && (job.location ?? '').toLowerCase().includes(c.toLowerCase()))) raw += 0.03;

  const score = Math.round(Math.max(0, Math.min(1, raw)) * 100);
  const matchingSkills = jobSkills.filter((s) => mine.has(s));
  const missingSkills = jobSkills.filter((s) => !mine.has(s)).sort((a, b) => weight(b) - weight(a));
  const coreMatches = matchingSkills.filter((s) => !SOFT_SKILLS.has(s)).length;

  // Relevance gate: a job must connect to this person's actual background.
  const relevant = jobFamily
    ? familyFit >= 0.6 || (coreMatches >= 3 && skillFit >= 0.4)
    : coreMatches >= 2 && skillFit >= 0.3;

  const tier = relevant ? tierFor(score) : null;
  const familyName = jobFamily ? FAMILY_LABEL[jobFamily] : 'this field';
  const parts: string[] = [];
  if (jobFamily && p.families.includes(jobFamily)) parts.push(`Your background is in ${familyName.toLowerCase()}.`);
  else if (familyFit >= 0.6) parts.push(`This is an adjacent move into ${familyName.toLowerCase()}.`);
  if (matchingSkills.length) parts.push(`You match ${matchingSkills.length} of ${jobSkills.length} skills it mentions, including ${matchingSkills.slice(0, 3).join(', ')}.`);
  if (missingSkills.length) parts.push(`Skills to address: ${missingSkills.slice(0, 3).join(', ')}.`);
  if (mandatoryMissing.length) parts.push(`Check before applying: it asks for ${mandatoryMissing.join(', ')}.`);
  if (gap >= 2) parts.push('The role looks more senior than your experience so far.');

  const suitability = mandatoryMissing.length
    ? 'Apply only if you can address the missing requirements in your application.'
    : tier === 'Strong' ? 'A strong fit. Worth applying soon.'
    : tier === 'Good' ? 'A realistic application. Tailor your CV to the skills listed.'
    : tier === 'Potential' ? 'A stretch, but possible if the role interests you.'
    : 'Not a realistic match for your current profile.';

  return {
    score, tier, relevant, matchingSkills, missingSkills: missingSkills.slice(0, 12), mandatoryMissing,
    explanation: parts.join(' ') || 'Limited detail in this listing, so the match is approximate.',
    suitability, requirements: [...required, ...nice].slice(0, 14),
  };
}
