import type { CandidateProfile } from '../cv/parse';
import { ADJACENT, FAMILY_LABEL, FAMILY_ROLES, skillFamily, type Family } from '../match/taxonomy';
import { truncate } from '../text';

export type DraftJob = {
  title: string; company: string; description: string; score: number | null;
  matching_skills: string[]; missing_skills: string[]; mandatory_missing: string[]; requirements: string[]; suitability: string | null;
};

// Instant, offline versions. They need no AI service, so these features always work.

export function coverLetterDraft(p: CandidateProfile, j: DraftJob): string {
  const skills = j.matching_skills.slice(0, 4);
  const recent = p.workHistory[0];
  const lines = [
    `Dear Hiring Manager,`,
    ``,
    `I am writing to apply for the ${j.title} position at ${j.company}. ${p.headline ? `As a ${p.headline} with ${p.yearsExperience} years of experience` : `With ${p.yearsExperience} years of experience`}, I would welcome the chance to contribute to your team.`,
    ``,
    recent ? `In my recent role as ${recent.title}${recent.company ? ` at ${recent.company}` : ''}, I built practical experience that fits this position.${skills.length ? ` My background covers ${skills.join(', ')}, all of which your listing highlights.` : ''}` : skills.length ? `My background covers ${skills.join(', ')}, all of which your listing highlights.` : `I am keen to apply my skills to the work your listing describes.`,
    ``,
    p.achievements[0] ? `One result I am proud of: ${p.achievements[0].replace(/\.$/, '')}.` : ``,
    p.education[0] ? `I also hold ${p.education[0].replace(/\.$/, '')}.` : ``,
    ``,
    `I would be glad to discuss how I can support ${j.company}. Thank you for considering my application.`,
    ``,
    `Yours sincerely,`,
    p.name ?? '',
  ];
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);

/** Fills the blanks that cover letter templates leave, such as [Company Name] or [Position]. */
export function fillPlaceholders(letter: string, j: Pick<DraftJob, 'title' | 'company'>): string {
  return letter
    .replace(/[[{<]\s*(?:company(?:'s)?(?:\s+name)?|organi[sz]ation(?:\s+name)?|employer(?:\s+name)?|hiring company)\s*[\]}>]/gi, j.company)
    .replace(/[[{<]\s*(?:position|role|job(?:\s+title)?|position title|vacancy)(?:\s+name)?\s*[\]}>]/gi, j.title);
}

const GREETING = /^(dear|hello|hi|to whom it may concern|good (morning|afternoon))\b/i;
const SIGN_OFF = /^(yours (sincerely|faithfully|truly)|kind regards|best regards|warm regards|regards|sincerely|best wishes|with thanks|thank you,?$|respectfully)/i;
const OPENER = /\b(apply|applying|application|interest(ed)? in|express)\b[^.]*\b(position|role|vacancy|post|opportunity|opening)\b/i;

/**
 * Your own letter, tailored to one job without an AI model. Your words stay:
 * template blanks are filled, the opening line names this job, and one
 * sentence links what the job asks for to the skills you share. Your greeting,
 * body and sign-off are kept as you wrote them.
 */
export function tailoredLetterDraft(letter: string, j: DraftJob): string {
  const paras = fillPlaceholders(letter, j).split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
  const greeting = paras[0] && GREETING.test(paras[0]) && paras[0].length < 90 ? paras.shift()! : 'Dear Hiring Manager,';
  const signAt = paras.findIndex((x, i) => i > 0 && SIGN_OFF.test(x) && x.length < 160);
  const closing = signAt >= 0 ? paras.splice(signAt) : [];
  const body = paras;

  // Your old opening named another role, so its first sentence makes way for this one. The rest of it stays.
  let rest = '';
  if (body[0] && OPENER.test(body[0].split(/(?<=[.!?])\s+/)[0] ?? '')) {
    rest = body.shift()!.split(/(?<=[.!?])\s+/).slice(1).join(' ');
  }
  const opening = `I am writing to apply for the ${j.title} position at ${j.company}.${rest ? ` ${rest}` : ''}`;
  const shared = j.matching_skills.slice(0, 4);
  const fit = shared.length
    ? `Your listing asks for ${list(shared)}, and ${shared.length === 1 ? 'this is' : 'these are'} central to the experience I describe below.`
    : '';
  return [greeting, fit ? `${opening} ${fit}` : opening, ...body, ...closing].join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

export function jobSummaryDraft(j: DraftJob): string {
  // The opening describes the role. Requirements are listed separately below.
  const lines = j.description.split('\n');
  const stop = lines.findIndex((l) => /^(requirements?|qualifications?|must have|what you('ll)? need|what we('re| are) looking for|skills? required)\b/i.test(l.trim()));
  const intro = (stop > 0 ? lines.slice(0, stop) : lines).join(' ').replace(/\s+/g, ' ').trim();
  const sentences = intro.match(/.+?(?:[.!?](?=\s|$)|$)/g) ?? [intro];
  const gist = truncate(sentences.slice(0, 3).join(' ').trim(), 420);
  const asks = j.requirements.slice(0, 4).map((r) => `• ${truncate(r, 110)}`).join('\n');
  return [
    gist,
    asks ? `\nWhat they ask for:\n${asks}` : '',
    `\nIs it worth applying? ${j.suitability ?? 'Compare the listing with your CV before applying.'}`,
    j.mandatory_missing.length ? `\nCheck first: ${j.mandatory_missing.join(', ')}.` : '',
  ].filter(Boolean).join('\n');
}

export type GapItem = { skill: string; jobs: number; resources: { label: string; url: string }[] };

function resourcesFor(skill: string): GapItem['resources'] {
  const q = encodeURIComponent(skill);
  const family = skillFamily(skill);
  const out: GapItem['resources'] = [];
  if (family && ['software', 'data', 'qa', 'devops'].includes(family)) out.push({ label: 'freeCodeCamp', url: `https://www.freecodecamp.org/news/search/?query=${q}` });
  if (family && ['devops', 'it_support', 'data'].includes(family)) out.push({ label: 'Microsoft Learn', url: `https://learn.microsoft.com/en-us/search/?terms=${q}` });
  if (family === 'marketing') out.push({ label: 'Google Skillshop', url: 'https://skillshop.withgoogle.com/' });
  out.push({ label: 'Alison free courses', url: `https://alison.com/courses?query=${q}` });
  out.push({ label: 'YouTube tutorials', url: `https://www.youtube.com/results?search_query=${q}+full+course` });
  return out.slice(0, 3);
}

/** Skills most often requested by your current matches that your CV lacks. */
export function skillGaps(jobs: { missing_skills: string[] }[], limit = 10): GapItem[] {
  const counts = new Map<string, number>();
  for (const j of jobs) for (const s of j.missing_skills) counts.set(s, (counts.get(s) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit)
    .map(([skill, n]) => ({ skill, jobs: n, resources: resourcesFor(skill) }));
}

export function careerPaths(p: CandidateProfile): { family: string; fit: string; roles: string[] }[] {
  const seen = new Set<Family>();
  const out: { family: string; fit: string; roles: string[] }[] = [];
  for (const f of p.families.slice(0, 2)) {
    if (!seen.has(f)) { seen.add(f); out.push({ family: FAMILY_LABEL[f], fit: 'Your main background', roles: FAMILY_ROLES[f] }); }
  }
  for (const f of p.families.slice(0, 2).flatMap((x) => ADJACENT[x])) {
    if (seen.has(f) || out.length >= 5) continue;
    seen.add(f);
    out.push({ family: FAMILY_LABEL[f], fit: 'A realistic next step from your current skills', roles: FAMILY_ROLES[f] });
  }
  return out;
}

export function cvImprovements(p: CandidateProfile, gaps: GapItem[]): string[] {
  const tips: string[] = [];
  if (gaps.length) tips.push(`If you have used them, add ${gaps.slice(0, 4).map((g) => g.skill).join(', ')}. These are the skills your matching jobs ask for most, and your CV doesn't mention them.`);
  if (!p.summary) tips.push('Add a three-line professional summary at the top, naming your target role and strongest skills.');
  if (p.achievements.length < 2) tips.push('Add measurable results to your work history, such as percentages, revenue, team size or time saved.');
  if (!p.workHistory.length) tips.push('List each job with its title, company and dates. Your work history could not be read, and employers\' screening software may fail too.');
  if (p.skills.length < 8) tips.push('Add a clear skills section. Few recognisable skills were found on your CV.');
  if (!p.phone || !p.email) tips.push('Check that your email address and phone number are in plain text at the top of your CV.');
  if (!p.certifications.length) tips.push('List any certificates or short courses. Free ones count, and they show that you keep learning.');
  return tips.slice(0, 6);
}

export function careerText(p: CandidateProfile): string {
  return careerPaths(p).map((c) => `${c.family}: ${c.roles.join(', ')}`).join('\n');
}
