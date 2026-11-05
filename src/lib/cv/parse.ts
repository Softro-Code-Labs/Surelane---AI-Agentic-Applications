import mammoth from 'mammoth';
import { degreeLevel, familyOfTitle, findQualifications, findSkills, skillFamily, FAMILY_TITLES, type Family } from '../match/taxonomy';

export const MAX_CV_BYTES = 4 * 1024 * 1024; // Vercel's request limit is 4.5 MB

export type CandidateProfile = {
  name: string | null;
  email: string | null;
  phone: string | null;
  headline: string;
  summary: string;
  yearsExperience: number;
  experienceLevel: 'Internship' | 'Entry level' | 'Mid level' | 'Senior' | 'Lead';
  education: string[];
  degreeLevel: number;
  certifications: string[];
  qualifications: string[];
  workHistory: { title: string; company: string; period: string }[];
  projects: string[];
  achievements: string[];
  skills: string[];
  languages: string[];
  strengths: string[];
  industries: string[];
  families: Family[];
  targetTitles: string[];
  interests: string[];
  keywords: string[];
};

export function sniffType(buf: Buffer): 'application/pdf' | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' | null {
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buf[0] === 0x50 && buf[1] === 0x4b && buf.includes('word/')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  return null;
}

export async function extractText(buf: Buffer, mime: string): Promise<string> {
  if (mime === 'application/pdf') {
    const { extractText: pdf, getDocumentProxy } = await import('unpdf');
    const doc = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await pdf(doc, { mergePages: false });
    return (text as string[]).join('\n').trim();
  }
  return (await mammoth.extractRawText({ buffer: buf })).value.trim();
}

const MONTHS = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const DATE = `(?:(${MONTHS})[a-z]*\\.?,?\\s+)?((?:19|20)\\d{2})`;
const RANGE = new RegExp(`${DATE}\\s*(?:-|–|—|to|until)\\s*(?:(present|current|now|to date|ongoing)|${DATE})`, 'gi');

const HEADINGS: [string, RegExp][] = [
  ['summary', /^(professional |career |personal )?(summary|profile|objective|about me)\b/i],
  ['experience', /^(work |professional |employment |career )?(experience|history)\b|^employment\b/i],
  ['education', /^(education|academic|educational)\b/i],
  ['skills', /^(technical |key |core |professional )?(skills|competenc|expertise|technologies)/i],
  ['projects', /^(key |selected |academic )?projects\b/i],
  ['certifications', /^(certifications?|certificates?|licen[cs]es|training|courses|professional qualifications?)\b/i],
  ['achievements', /^(achievements?|awards?|honou?rs|accomplishments)\b/i],
  ['languages', /^languages?\b/i],
  ['interests', /^(interests|hobbies|extra.?curricular|activities)\b/i],
  ['references', /^(references|referees)\b/i],
];

function sections(text: string): Record<string, string[]> {
  const out: Record<string, string[]> = { header: [] };
  let cur = 'header';
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const short = line.length < 45 ? line.replace(/[:\-–|]+$/, '').trim() : '';
    const hit = short ? HEADINGS.find(([, re]) => re.test(short)) : undefined;
    if (hit) { cur = hit[0]; out[cur] ??= []; continue; }
    (out[cur] ??= []).push(line);
  }
  return out;
}

function monthIndex(m?: string): number {
  if (!m) return 0;
  return 'janfebmaraprmayjunjulaugsepoctnovdec'.indexOf(m.slice(0, 3).toLowerCase()) / 3;
}

/** Sums employment periods, counting overlapping jobs only once. */
export function yearsFromRanges(lines: string[], now = new Date()): number {
  const spans: [number, number][] = [];
  for (const line of lines) {
    for (const m of line.matchAll(RANGE)) {
      const start = Number(m[2]) * 12 + monthIndex(m[1]);
      const end = m[3] ? now.getFullYear() * 12 + now.getMonth() : Number(m[5]) * 12 + monthIndex(m[4]) + (m[4] ? 0 : 11);
      if (end >= start) spans.push([start, end]);
    }
  }
  spans.sort((a, b) => a[0] - b[0]);
  let months = 0, until = -Infinity;
  for (const [s, e] of spans) {
    if (e <= until) continue;
    months += e - Math.max(s, until);
    until = e;
  }
  return Math.round((months / 12) * 10) / 10;
}

const TITLE_WORDS = Object.values(FAMILY_TITLES).flat().concat(['engineer', 'manager', 'executive', 'officer', 'assistant', 'consultant', 'analyst', 'lead', 'specialist', 'coordinator', 'intern', 'trainee', 'supervisor', 'director', 'associate']);

function looksLikeTitle(s: string): boolean {
  const l = s.toLowerCase();
  return s.length < 70 && TITLE_WORDS.some((w) => l.includes(w));
}

function workHistory(lines: string[]): CandidateProfile['workHistory'] {
  const out: CandidateProfile['workHistory'] = [];
  lines.forEach((line, i) => {
    const m = [...line.matchAll(RANGE)][0];
    if (!m) return;
    const period = m[0];
    const rest = line.replace(period, '').replace(/[|()•,–—-]+\s*$/, '').replace(/^\s*[|()•,–—-]+/, '').trim();
    const nearby = [rest, lines[i - 1], lines[i - 2], lines[i + 1]].filter((x): x is string => Boolean(x) && !RANGE.test(x!) && !/^[•\-*]/.test(x!));
    RANGE.lastIndex = 0;
    const joined = nearby.flatMap((x) => x.split(/\s+(?:at|@|\||–|—|-)\s+|,\s+/)).map((x) => x.trim()).filter(Boolean);
    const title = joined.find(looksLikeTitle) ?? rest;
    const company = joined.find((x) => x !== title && !looksLikeTitle(x)) ?? '';
    if (title) out.push({ title, company, period });
  });
  return out.slice(0, 12);
}

// Everyday words that are only skills when you list them as skills, not when
// they appear in an employer's name or a sentence about a client.
const AMBIGUOUS = new Set(['Logistics', 'Sales', 'Accounting', 'Banquet', 'Teaching', 'Filing', 'Typing', 'Nursing', 'Pharmacy', 'Leasing', 'Procurement', 'Branding', 'Statistics', 'Scheduling', 'Mentoring', 'Litigation', 'Recruitment', 'Housekeeping', 'Costing', 'Merchandising']);

const stripBullet = (s: string) => s.replace(/^[•\-*▪◦·•]\s*/, '').trim();

export function analyseCv(text: string, now = new Date()): CandidateProfile {
  const sec = sections(text);
  const header = sec.header ?? [];
  const email = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ?? null;
  const phone = text.match(/(?:\+?94|0)[\s-]?\d{2}[\s-]?\d{3}[\s-]?\d{4}|\+\d[\d\s()-]{8,}\d/)?.[0] ?? null;
  const name = header.find((l) => /^[A-Za-z][A-Za-z .'-]{2,50}$/.test(l) && l.split(/\s+/).length <= 6 && !looksLikeTitle(l)) ?? null;

  const experience = sec.experience ?? [];
  const history = workHistory(experience.length ? experience : text.split('\n'));
  const years = yearsFromRanges(experience.length ? experience : text.split('\n'), now);

  const listed = sec.skills?.join('\n');
  const skills = findSkills(text).filter((s) => !listed || !AMBIGUOUS.has(s) || findSkills(listed).includes(s));
  const educationLines = (sec.education ?? []).map(stripBullet).filter((l) => l.length > 4);
  const education = educationLines.filter((l) => degreeLevel(l) > 0 || /universit|institute|college|school/i.test(l)).slice(0, 8);

  const titles = [...new Set([...history.map((h) => h.title), ...header.filter(looksLikeTitle)])];
  const familyVotes = new Map<Family, number>();
  titles.forEach((t, i) => {
    const f = familyOfTitle(t);
    if (f) familyVotes.set(f, (familyVotes.get(f) ?? 0) + (i === 0 ? 5 : 3));
  });
  for (const s of skills) {
    const f = skillFamily(s);
    if (f) familyVotes.set(f, (familyVotes.get(f) ?? 0) + 1);
  }
  const families = [...familyVotes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([f]) => f);

  const level: CandidateProfile['experienceLevel'] =
    years >= 10 ? 'Lead' : years >= 5 ? 'Senior' : years >= 2 ? 'Mid level' : years > 0 ? 'Entry level' : /intern|undergraduate|student/i.test(text) ? 'Internship' : 'Entry level';

  const summary = (sec.summary ?? []).join(' ').slice(0, 800);
  const languages = (sec.languages ?? []).flatMap((l) => l.split(/[,|•]/)).map((l) => stripBullet(l).replace(/\(.*\)|[:\-–].*$/g, '').trim()).filter((l) => l && l.length < 25);
  const known = text.match(/\b(English|Sinhala|Tamil|Hindi|French|German|Japanese|Korean|Mandarin|Arabic)\b/g) ?? [];

  return {
    name, email, phone,
    headline: titles[0] ?? header.find(looksLikeTitle) ?? '',
    summary,
    yearsExperience: years,
    experienceLevel: level,
    education,
    degreeLevel: degreeLevel((sec.education ?? []).join('\n') || text),
    certifications: (sec.certifications ?? []).map(stripBullet).filter(Boolean).slice(0, 12),
    qualifications: findQualifications(text),
    workHistory: history,
    projects: (sec.projects ?? []).map(stripBullet).filter((l) => l.length > 3 && l.length < 120).slice(0, 8),
    achievements: [...(sec.achievements ?? []), ...experience.filter((l) => /^[•\-*▪]/.test(l) && /\d/.test(l))].map(stripBullet).slice(0, 8),
    skills,
    languages: [...new Set([...languages, ...known])].slice(0, 6),
    strengths: skills.filter((s) => !skillFamily(s)).slice(0, 6),
    industries: [...new Set(families)],
    families,
    targetTitles: titles.slice(0, 5),
    interests: (sec.interests ?? []).map(stripBullet).slice(0, 6),
    keywords: [...titles.slice(0, 3), ...skills.filter((s) => skillFamily(s)).slice(0, 8)],
  };
}
