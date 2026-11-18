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

/**
 * Text from a PDF with its paragraphs rebuilt from the layout, for writing such as a cover letter.
 * PDFs store each printed line separately, so plain extraction breaks sentences mid-line and loses the
 * gaps between paragraphs. Here a line that runs nearly the full width and is followed closely by the
 * next is a wrapped sentence and is joined; a larger gap starts a new paragraph; bullets and short lines
 * (a name, an address, "Sincerely,") stay on their own lines.
 */
export async function extractPdfParagraphs(buf: Buffer): Promise<string> {
  const { getDocumentProxy } = await import('unpdf');
  const doc = await getDocumentProxy(new Uint8Array(buf));
  const pages: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    type Line = { y: number; left: number; right: number; text: string };
    const lines: Line[] = [];
    for (const it of content.items as any[]) {
      if (typeof it.str !== 'string' || !it.transform) continue;
      const x = it.transform[4] as number, y = it.transform[5] as number;
      let line = lines.find((l) => Math.abs(l.y - y) < 2);
      if (!line) { line = { y, left: x, right: x, text: '' }; lines.push(line); }
      line.text += it.str;
      if (it.str.trim()) { line.left = Math.min(line.left, x); line.right = Math.max(line.right, x + (it.width ?? 0)); }
    }
    const rows = lines.map((l) => ({ ...l, text: l.text.replace(/\s+/g, ' ').trim() })).filter((l) => l.text).sort((a, b) => b.y - a.y);
    if (!rows.length) continue;
    const gaps = rows.slice(1).map((r, i) => rows[i]!.y - r.y).filter((g) => g > 0).sort((a, b) => a - b);
    // The normal gap between lines of one paragraph. A short letter has as many paragraph gaps as
    // line gaps, so this takes the tighter end of the gaps rather than the middle.
    const step = gaps[Math.floor(gaps.length / 4)] ?? 14;
    const widest = Math.max(...rows.map((r) => r.right));
    let out = rows[0]!.text;
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1]!, row = rows[i]!;
      const gap = prev.y - row.y;
      const bullet = /^[•\-*▪◦·–]\s/.test(row.text);
      if (gap > step * 1.35) out += `\n\n${row.text}`;
      else if (!bullet && prev.right >= widest * 0.8 && !/[:]$/.test(prev.text)) out += ` ${row.text}`;
      else out += `\n${row.text}`;
    }
    pages.push(out);
  }
  return pages.join('\n\n').trim();
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
    // A heading is short, starts with a capital and does not end a sentence. This keeps the wrapped
    // last word of a sentence ("training.") from being taken for a "Training" section.
    const short = line.length < 45 && !/^[a-z]/.test(line) && !/[.,;]$/.test(line) ? line.replace(/[:\-–|]+$/, '').trim() : '';
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

/** Detail lines inside an entry, such as "Technologies: Next.js" or "Live: example.com". */
const DETAIL_LABEL = /^(technolog(?:y|ies)|tech(?:nical)? stack|stack|tools|live|link|url|website|github|role|client|phone)\s*:/i;
const DATED = new RegExp(`${DATE}\\s*(?:(?:-|–|—|to|until)\\s*(?:present|current|now|to date|ongoing|${DATE}))?\\s*$`, 'i');

/**
 * The entries in a section such as Projects or Certifications, one per item, from their title
 * lines: "TourVista Tours | Tour Booking Platform  Apr 2026 - Jun 2026" gives
 * "TourVista Tours | Tour Booking Platform". A title line is not a bullet or a detail line, starts
 * with a capital or digit, and has a date or a "|" separator. Returns [] when a section has none,
 * so the caller can fall back to its plain lines.
 */
export function entryTitles(lines: string[]): string[] {
  return lines
    .filter((l) => !/^[•\-*▪◦·]/.test(l) && !DETAIL_LABEL.test(l) && /^[A-Z0-9"'(]/.test(l) && (DATED.test(l) || /\s\|\s/.test(l)))
    .map((l) => l.replace(DATED, '').replace(/[\s|,–—-]+$/, '').trim())
    .filter((l) => l.length > 2);
}

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
    certifications: (entryTitles(sec.certifications ?? []).length ? entryTitles(sec.certifications ?? []) : (sec.certifications ?? []).map(stripBullet).filter(Boolean)).slice(0, 12),
    qualifications: findQualifications(text),
    workHistory: history,
    // One line per project, so a long first project cannot push the rest (often on page 2) out.
    projects: (entryTitles(sec.projects ?? []).length ? entryTitles(sec.projects ?? []) : (sec.projects ?? []).map(stripBullet).filter((l) => l.length > 3 && l.length < 120)).slice(0, 8),
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
