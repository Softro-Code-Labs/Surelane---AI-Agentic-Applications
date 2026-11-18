import * as cheerio from 'cheerio';
import { XMLParser } from 'fast-xml-parser';
import { htmlToText, parseDate, parseDeadline, safeUrl } from '../text';
import { GLOBAL_SITES, GOVERNMENT_SITES, SRI_LANKA_SITES, siteSearchUrl } from '../sites';
import { getJson, httpGet, robotsAllow } from './http';
import { SourceError, SourceSkip, type RawJob, type SourceAdapter, type SourceContext, type VerifyState } from './types';

/**
 * A feed that answers 401 or 403 has refused this server. Some sites block cloud
 * servers such as GitHub's while allowing home connections. That is respected:
 * the source is skipped with the reason, never retried another way, and not
 * counted as a failed search.
 */
export function feedError(label: string, status: number): SourceError {
  if (status === 401 || status === 403) {
    return new SourceSkip(`${label}: the site refused access from this server (HTTP ${status}), so it was not read. Some sites block cloud servers such as GitHub's but allow home connections.`);
  }
  return new SourceError(`${label}: HTTP ${status}`);
}

function withUrl(job: Omit<RawJob, 'url'> & { url: string | null | undefined }): RawJob[] {
  const url = safeUrl(job.url);
  return url && job.title ? [{ ...job, url }] : [];
}

function modeFrom(text: string | null | undefined): RawJob['workMode'] {
  const t = (text ?? '').toLowerCase();
  if (/\bhybrid\b/.test(t)) return 'hybrid';
  if (/\b(remote|work from home|wfh)\b/.test(t)) return 'remote';
  if (/\b(on-?site|in[- ]office)\b/.test(t)) return 'onsite';
  return 'unknown';
}

// ── RSS (ITPro.lk and any feed you add) ─────────────────────────────────────
const xml = new XMLParser({ ignoreAttributes: true, trimValues: true, processEntities: false });

export function parseRss(body: string, source: string, label: string): RawJob[] {
  const doc = xml.parse(body);
  const channel = doc?.rss?.channel;
  if (!channel) throw new SourceError(`${label}: the response was not an RSS feed`);
  const items = channel.item ? (Array.isArray(channel.item) ? channel.item : [channel.item]) : [];
  return items.flatMap((it: any) => {
    const html = String(it['content:encoded'] ?? it.description ?? '');
    const text = htmlToText(html);
    const field = (name: string) => text.match(new RegExp(`${name}:\\s*(.+)`, 'i'))?.[1]?.trim() ?? null;
    const rawTitle = htmlToText(String(it.title ?? ''));
    const creator = it['dc:creator'] ? String(it['dc:creator']) : null;
    const company = creator ?? field('Company') ?? rawTitle.match(/\bat (.+)$/)?.[1] ?? 'Not stated';
    const title = rawTitle.replace(new RegExp(`\\s+at\\s+${company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), '');
    const location = field('Location') ?? '';
    return withUrl({
      source, sourceLabel: label, sourceJobId: String(it.guid ?? it.link ?? ''), url: String(it.link ?? ''),
      title, company, location, workMode: modeFrom(`${location}`),
      employmentType: field('Job Type'), postedAt: parseDate(it.pubDate), deadline: parseDeadline(field('(?:Closing Date|Deadline)')),
      description: text,
    });
  });
}

async function fetchFeed(ctx: SourceContext, url: string, id: string, label: string): Promise<RawJob[]> {
  if (!(await robotsAllow(ctx, url))) throw new SourceError(`${label}: robots.txt does not allow this feed`);
  const res = await httpGet(ctx, url, { untrusted: true });
  if (!res.ok) throw feedError(label, res.status);
  return parseRss(await res.text(), id, label);
}

const itpro: SourceAdapter = {
  id: 'itpro', label: 'ITPro.lk', region: 'Sri Lanka', scope: 'local',
  note: 'Sri Lankan IT and technology jobs, read from the public RSS feed that ITPro.lk publishes.',
  search: async (ctx) => (await fetchFeed(ctx, 'https://itpro.lk/rss/all/', 'itpro', 'ITPro.lk')).map((j) => ({ ...j, country: 'Sri Lanka' })),
};

// ── Jobpal.lk (WP Job Manager job feed) ─────────────────────────────────────
/** Jobpal's feed carries the company and job type in its own fields. Its location field is broken (it reads "Array"), so it is ignored. */
export function parseJobpal(body: string): RawJob[] {
  const doc = xml.parse(body);
  const channel = doc?.rss?.channel;
  if (!channel) throw new SourceError('Jobpal.lk: the response was not an RSS feed');
  const items = channel.item ? (Array.isArray(channel.item) ? channel.item : [channel.item]) : [];
  return items.flatMap((it: any) => {
    const title = htmlToText(String(it.title ?? ''));
    const place = htmlToText(String(it['job_listing:location'] ?? '')).replace(/^Array\b|[—–-]\s*$/g, '').trim();
    const location = place || 'Sri Lanka';
    return withUrl({
      source: 'jobpal', sourceLabel: 'Jobpal.lk', sourceJobId: String(it.guid ?? it.link ?? ''), url: String(it.link ?? ''),
      title, company: htmlToText(String(it['job_listing:company'] ?? '')) || 'Not stated',
      location, country: 'Sri Lanka', workMode: modeFrom(`${title} ${place}`),
      employmentType: htmlToText(String(it['job_listing:job_type'] ?? '')).replace(/-/g, ' ') || null,
      postedAt: parseDate(it.pubDate), description: htmlToText(String(it['content:encoded'] ?? it.description ?? '')),
    });
  });
}

const jobpal: SourceAdapter = {
  id: 'jobpal', label: 'Jobpal.lk', region: 'Sri Lanka', scope: 'local',
  note: 'Sri Lankan jobs in every field, read from the job feed Jobpal.lk publishes: the newest jobs, plus a search for each of your top keywords.',
  search: async (ctx) => {
    const base = 'https://jobpal.lk/?feed=job_feed';
    if (!(await robotsAllow(ctx, base))) throw new SourceError('Jobpal.lk: robots.txt does not allow its job feed');
    const seen = new Map<string, RawJob>();
    for (const term of ['', ...ctx.keywords.slice(0, 3)]) {
      const res = await httpGet(ctx, term ? `${base}&search_keywords=${encodeURIComponent(term)}` : base);
      if (!res.ok) throw feedError('Jobpal.lk', res.status);
      for (const job of parseJobpal(await res.text())) seen.set(job.url, job);
      await ctx.sleep(1000);
    }
    return [...seen.values()];
  },
};

// ── Government vacancies: Govjobs.lk and Govdoc Jobs (RSS) ───────────────────
function feedItems(body: string, label: string): any[] {
  const channel = xml.parse(body)?.rss?.channel;
  if (!channel) throw new SourceError(`${label}: the response was not an RSS feed`);
  return channel.item ? (Array.isArray(channel.item) ? channel.item : [channel.item]) : [];
}

/** "Pharmacist – State Pharmaceuticals Corporation of Sri Lanka Job Vacancies 2026", with "Employer … Job Title … Closing Date 2026 – 11 – 21" in the text. */
export function parseGovjobs(body: string): RawJob[] {
  return feedItems(body, 'Govjobs.lk').flatMap((it: any) => {
    // The feed also carries exam calendars and news, which are not vacancies.
    if (![it.category].flat().some((c) => /vacanc/i.test(String(c ?? '')))) return [];
    const heading = htmlToText(String(it.title ?? '')).replace(/\s*[-–(]?\s*(?:job\s+)?vacancies(?:\s+\d{4})?\)?\s*$/i, '').replace(/\s+\d{4}$/, '').trim();
    const text = htmlToText(String(it['content:encoded'] || it.description || '')).replace(/^Read more please go to this link:.*$/m, '').trim();
    const flat = text.replace(/\s+/g, ' ');
    const employer = flat.match(/\bEmployer\s+(.+?)\s+Job Title\b/i)?.[1]?.trim();
    const role = flat.match(/\bJob Title\s+(.+?)\s+(?:Exam Date|Closing Date|Sinhala|English|Tamil)\b/i)?.[1]?.trim();
    const close = flat.match(/\bClosing Date\s*(\d{4})\s*[-–—/.]\s*(\d{1,2})\s*[-–—/.]\s*(\d{1,2})/i);
    const [left, ...right] = heading.split(/\s+[–-]\s+/);
    return withUrl({
      source: 'govjobs', sourceLabel: 'Govjobs.lk', sourceJobId: String(it.guid ?? it.link ?? ''), url: String(it.link ?? ''),
      title: role || left || heading, company: employer || right.join(' – ') || 'Government of Sri Lanka',
      location: 'Sri Lanka', country: 'Sri Lanka', workMode: 'onsite', category: 'Government',
      postedAt: parseDate(it.pubDate), deadline: close ? parseDeadline(`${close[1]}-${close[2]!.padStart(2, '0')}-${close[3]!.padStart(2, '0')}`) : null,
      description: `${heading}\n${text}`.trim(),
    });
  });
}

/** "Assistant Quantity Surveyor, Technical Officer jobs at Land Reclamation & Development Company Limited". */
export function parseGovdoc(body: string): RawJob[] {
  return feedItems(body, 'Govdoc Jobs').flatMap((it: any) => {
    const heading = htmlToText(String(it.title ?? ''));
    const m = heading.match(/^(.+?)\s+jobs?\s+at\s+(.+)$/i);
    return withUrl({
      source: 'govdoc', sourceLabel: 'Govdoc Jobs', sourceJobId: String(it.guid ?? it.link ?? ''), url: String(it.link ?? ''),
      title: m?.[1] ?? heading, company: m?.[2] ?? 'Government of Sri Lanka',
      location: 'Sri Lanka', country: 'Sri Lanka', workMode: 'onsite', category: 'Government',
      postedAt: parseDate(it.pubDate), description: `${heading}\n${htmlToText(String(it.description ?? ''))}`.trim(),
    });
  });
}

function governmentFeed(id: string, label: string, url: string, parse: (body: string) => RawJob[], note: string): SourceAdapter {
  return {
    id, label, region: 'Government', scope: 'local', note,
    search: async (ctx) => {
      if (!(await robotsAllow(ctx, url))) throw new SourceError(`${label}: robots.txt does not allow its feed`);
      const res = await httpGet(ctx, url);
      if (!res.ok) throw feedError(label, res.status);
      return parse(await res.text());
    },
  };
}

const govjobs = governmentFeed('govjobs', 'Govjobs.lk', 'https://www.govjobs.lk/feed/', parseGovjobs,
  'Government vacancies, read from the feed Govjobs.lk publishes: its newest posts, usually with the closing date.');
const govdoc = governmentFeed('govdoc', 'Govdoc Jobs', 'https://job.govdoc.lk/feed', parseGovdoc,
  'Government vacancies, read from the feed job.govdoc.lk publishes: its newest posts. Closing dates are on the linked page.');

// ── Gazette.lk and NearJobs.lk (WordPress vacancy feeds) ────────────────────
/**
 * "Designer – National Design Centre Vacancies 2026" or "Driver Job Vacancies – Plantation
 * Human Development Trust", with "Closing Date: 2026-11-27" in the text. News and exam
 * posts in the same feed carry no vacancy category and are skipped.
 */
export function parseVacancyFeed(body: string, source: string, label: string): RawJob[] {
  return feedItems(body, label).flatMap((it: any) => {
    const cats = [it.category].flat().map((c) => String(c ?? ''));
    if (!cats.some((c) => /vacanc/i.test(c))) return [];
    const heading = htmlToText(String(it.title ?? '')).replace(/\s*\(?\b(?:job\s+)?vacanc(?:y|ies)\b(?:\s+\d{4})?\)?\s*$/i, '').replace(/\s+\d{4}$/, '').trim();
    const text = htmlToText(String(it['content:encoded'] || it.description || '')).replace(/^Read more please go to this link:\s*/i, '').trim();
    const close = text.match(/Closing Date\s*:?\s*(\d{4})\s*[-–—/.]\s*(\d{1,2})\s*[-–—/.]\s*(\d{1,2})/i);
    const [left, ...right] = heading.split(/\s+[–—-]\s+/);
    const roles = (left ?? heading).replace(/\s*\b(?:job\s+)?vacanc(?:y|ies)\b\s*$/i, '').trim();
    const employer = right.join(' – ').replace(/\s*\b(?:job\s+)?vacanc(?:y|ies)\b.*$/i, '').trim();
    const government = cats.some((c) => /government/i.test(c));
    return withUrl({
      source, sourceLabel: label, sourceJobId: String(it.guid ?? it.link ?? ''), url: String(it.link ?? ''),
      title: roles || heading, company: employer || (right.length ? 'Not stated' : roles || heading),
      location: 'Sri Lanka', country: 'Sri Lanka', workMode: 'onsite', category: government ? 'Government' : null,
      postedAt: parseDate(it.pubDate),
      deadline: close ? parseDeadline(`${close[1]}-${close[2]!.padStart(2, '0')}-${close[3]!.padStart(2, '0')}`) : null,
      description: `${htmlToText(String(it.title ?? ''))}\n${text}`.trim(),
    });
  });
}

/** Reads the first two pages of a WordPress feed, which covers a day or more of posts between searches. */
function vacancyFeed(id: string, label: string, base: string, note: string): SourceAdapter {
  return {
    id, label, region: 'Government', scope: 'local', note,
    search: async (ctx) => {
      if (!(await robotsAllow(ctx, base))) throw new SourceError(`${label}: robots.txt does not allow its feed`);
      const seen = new Map<string, RawJob>();
      for (const page of [1, 2]) {
        const res = await httpGet(ctx, page === 1 ? base : `${base}?paged=${page}`);
        if (!res.ok) { if (page > 1) break; throw feedError(label, res.status); }
        for (const job of parseVacancyFeed(await res.text(), id, label)) seen.set(job.url, job);
        await ctx.sleep(1000);
      }
      return [...seen.values()];
    },
  };
}

// Checked in November 2026: robots.txt allows both feeds, and neither site's terms forbid automated reading.
const gazettelk = vacancyFeed('gazettelk', 'Gazette.lk', 'https://www.gazette.lk/feed/',
  'Government vacancies from the Gazette and state bodies, read from the feed Gazette.lk publishes: its newest posts, usually with the closing date.');
const nearjobs = vacancyFeed('nearjobs', 'NearJobs.lk', 'https://nearjobs.lk/feed/',
  'Government and state-sector vacancies, read from the feed NearJobs.lk publishes: its newest posts.');

/*
 * Sites read from their own public pages. Checked in November 2026: each one's
 * robots.txt allows these pages (GovHub has none, which places no limits), and
 * none publishes terms that forbid automated reading. Each is read like a
 * career page: robots rules are checked first, and a refusal is respected.
 */
async function pageText(ctx: SourceContext, url: string, label: string): Promise<string> {
  if (!(await robotsAllow(ctx, url))) throw new SourceError(`${label}: robots.txt does not allow this page`);
  const res = await httpGet(ctx, url, { timeoutMs: 30_000 });
  if (!res.ok) throw feedError(label, res.status);
  return res.text();
}

// ── Observer Jobs (job data embedded in its vacancy pages) ──────────────────
/** The page's data travels in the data-page attribute that its Inertia front end reads. */
export function parseObserver(html: string): RawJob[] {
  const raw = cheerio.load(html)('[data-page]').attr('data-page');
  if (!raw) throw new SourceError('Observer Jobs: the page did not include its vacancy data');
  let results: any;
  try { results = JSON.parse(raw)?.props?.results; } catch { throw new SourceError('Observer Jobs: the vacancy data could not be read'); }
  const items: any[] = Array.isArray(results) ? results : results?.data ?? [];
  return items.flatMap((v) => {
    const categories = (v.categories ?? []).map((c: any) => htmlToText(c.name)).filter(Boolean);
    const company = v.company?.is_name_withheld ? 'Not stated' : htmlToText(v.company?.name) || 'Not stated';
    const location = [v.location, v.location_more].map((s) => htmlToText(s)).filter(Boolean).join(', ') || 'Sri Lanka';
    const salary = v.salary && v.salary !== '0' ? String(v.salary) : v.negotiable ? 'Negotiable' : null;
    // Contact names, emails and phone numbers are left out on purpose.
    const facts = [
      categories.length ? `Category: ${categories.join(', ')}` : '', v.company?.industry ? `Industry: ${htmlToText(v.company.industry)}` : '',
      v.years_experience ? `Experience: ${v.years_experience}` : '', v.minimum_qualification ? `Minimum qualification: ${v.minimum_qualification}` : '',
      v.type ? `Job type: ${v.type}` : '', v.has_notice ? 'The full advert is a notice on the Observer Jobs page.' : '',
    ].filter(Boolean).join('\n');
    return withUrl({
      source: 'observerjobs', sourceLabel: 'Observer Jobs', sourceJobId: String(v.id ?? ''),
      url: v.id && v.slug ? `https://observerjobs.lk/vacancy/${v.id}/${encodeURIComponent(v.slug)}` : null,
      title: htmlToText(v.title), company, location, country: 'Sri Lanka', workMode: modeFrom(`${v.title} ${location}`),
      employmentType: v.type || null, category: categories[0] ?? null, salary,
      postedAt: parseDate(v.created_at), deadline: parseDeadline(v.deadline),
      description: [htmlToText(v.description), facts].filter(Boolean).join('\n\n'),
    });
  });
}

const observerjobs: SourceAdapter = {
  id: 'observerjobs', label: 'Observer Jobs', region: 'Sri Lanka', scope: 'local',
  note: 'Sri Lankan jobs in every field, read from Observer Jobs\' public vacancy pages: the newest jobs, plus a search for each of your top keywords. Many adverts are notices, so details are short.',
  search: async (ctx) => {
    const seen = new Map<string, RawJob>();
    for (const term of ['', ...ctx.keywords.slice(0, 3)]) {
      const url = `https://observerjobs.lk/vacancies${term ? `?keyword=${encodeURIComponent(term)}` : ''}`;
      for (const job of parseObserver(await pageText(ctx, url, 'Observer Jobs'))) seen.set(job.url, job);
      await ctx.sleep(1000);
    }
    return [...seen.values()];
  },
};

// ── GovHub Jobs (one page lists every vacancy) ──────────────────────────────
export function parseGovhub(html: string): RawJob[] {
  const $ = cheerio.load(html);
  const base = 'https://jobs.govhub.lk';
  // Vacancy links look like /government-companies/draftsman-2787, under one path per kind of employer.
  return $('h3 a').toArray().flatMap((a) => {
    const link = $(a);
    if (!/^\/[a-z0-9-]+\/[^/?#]+-\d+$/i.test(link.attr('href') ?? '')) return [];
    let card = link.closest('h3').parent();
    while (card.length && !card.find('a[href*="institute-jobs.php"]').length && !/Closing:/.test(card.text())) card = card.parent();
    if (!card.length) return [];
    const href = link.attr('href') ?? '';
    const id = href.match(/-(\d+)(?:[?#]|$)/)?.[1] ?? href;
    const title = link.text().trim();
    const local = card.find('h4 a').first().text().trim();
    const company = card.find('a[href*="institute-jobs.php"]').first().text().trim() || 'Government of Sri Lanka';
    const text = card.text().replace(/\s+/g, ' ');
    const closing = text.match(/Closing:\s*(\d{4}-\d{2}-\d{2})/)?.[1];
    const origin = text.match(/Source:\s*(\S+)/)?.[1];
    const kind = card.find('span').first().text().trim();
    return withUrl({
      source: 'govhub', sourceLabel: 'GovHub Jobs', sourceJobId: id, url: `${base}${href.startsWith('/') ? '' : '/'}${href.split('?')[0]}?lang=en`,
      title, company, location: 'Sri Lanka', country: 'Sri Lanka', workMode: 'onsite', category: 'Government',
      deadline: closing ? parseDeadline(closing) : null,
      description: [title, local, `Employer: ${company}`, kind ? `Type: ${kind}` : '', origin ? `Original advert: ${origin}` : '', closing ? `Closing date: ${closing}` : ''].filter(Boolean).join('\n'),
    });
  });
}

const govhub: SourceAdapter = {
  id: 'govhub', label: 'GovHub Jobs', region: 'Government', scope: 'local', completeListing: true, emptyMeansClosed: false,
  note: 'Government and state company vacancies, read from the page where jobs.govhub.lk lists every one, with closing dates. A vacancy that leaves the list is marked closed.',
  search: async (ctx) => {
    const jobs = parseGovhub(await pageText(ctx, 'https://jobs.govhub.lk/all-jobs.php', 'GovHub Jobs'));
    const seen = new Map(jobs.map((j) => [j.url, j]));
    return [...seen.values()];
  },
};

// ── Jobify.lk (remote jobs open to Sri Lanka) ───────────────────────────────
const JOB_TYPE = /^(full[- ]time|part[- ]time|contract|internship|freelance|temporary|volunteer)$/i;

/** "Posted 13 Nov" has no year: it is the latest such date that is not in the future. */
function postedOn(text: string, now: Date): Date | null {
  const m = text.match(/Posted\s+(\d{1,2})\s+([A-Za-z]{3,})/);
  if (!m) return null;
  for (const year of [now.getUTCFullYear(), now.getUTCFullYear() - 1]) {
    const d = parseDate(`${m[1]} ${m[2]} ${year}`);
    if (d && d.getTime() <= now.getTime() + 86_400_000) return d;
  }
  return null;
}

export function parseJobify(html: string, now: Date): RawJob[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  return $('.card').toArray().flatMap((el) => {
    const card = $(el);
    // The title is the job link with text; the card's other links are Apply and Tailor my CV.
    const link = card.find('a[href^="/jobs/r/"]').filter((_, a) => !/^apply$/i.test($(a).text().trim()) && $(a).text().trim() !== '').first();
    const href = link.attr('href');
    if (!href || seen.has(href) || card.find('.card').length) return [];
    seen.add(href);
    const title = link.text().trim();
    const company = card.find('p').first().text().trim() || 'Not stated';
    const tags = [...new Set(card.find('span').toArray().map((s) => $(s).clone().children().remove().end().text().trim()).filter((t) => t.length > 1))];
    const posted = tags.find((t) => /^Posted\b/.test(t)) ?? '';
    const type = tags.find((t) => JOB_TYPE.test(t)) ?? null;
    const salary = tags.find((t) => /\d/.test(t) && /(\/|per)\s*(hour|day|week|month|year)|^(USD|LKR|Rs\.?|EUR|GBP)\b/i.test(t)) ?? null;
    const rest = tags.filter((t) => t !== posted && t !== type && t !== salary);
    const region = rest[0] ?? 'Remote';
    const category = rest[1] ?? null;
    return withUrl({
      source: 'jobify', sourceLabel: 'Jobify.lk', sourceJobId: href.split('/').pop() ?? href, url: `https://jobify.lk${href}`,
      title, company, location: `Remote (${region})`, workMode: 'remote', slEligibility: 'yes',
      employmentType: type, category, salary, postedAt: postedOn(posted, now),
      description: [title, `Company: ${company}`, `Open to: ${region}, including Sri Lanka`, type ? `Job type: ${type}` : '', category ? `Category: ${category}` : '', salary ? `Pay: ${salary}` : ''].filter(Boolean).join('\n'),
    });
  });
}

const jobify: SourceAdapter = {
  id: 'jobify', label: 'Jobify.lk', region: 'Remote', scope: 'global',
  note: 'Remote jobs that people in Sri Lanka can apply for, read from Jobify.lk\'s public remote job pages, searched with Global on. Listings are short; the full advert is on Jobify. Jobs posted on Jobify itself are not read, because its robots rules close that data to tools.',
  search: async (ctx) => {
    const seen = new Map<string, RawJob>();
    for (const term of ['', ...ctx.keywords.slice(0, 3)]) {
      const url = `https://jobify.lk/remote${term ? `?q=${encodeURIComponent(term)}` : ''}`;
      for (const job of parseJobify(await pageText(ctx, url, 'Jobify.lk'), ctx.now)) seen.set(job.url, job);
      await ctx.sleep(1000);
    }
    return [...seen.values()];
  },
};

// ── Himalayas ───────────────────────────────────────────────────────────────
function himalayasJob(j: any): RawJob[] {
  const restrictions: any[] = j.locationRestrictions ?? [];
  const names = restrictions.map((r) => (typeof r === 'string' ? r : r.name)).filter(Boolean);
  const open = names.length === 0 || names.some((n) => /sri lanka/i.test(n));
  const pay = j.minSalary && j.maxSalary ? `${j.currency ?? ''} ${j.minSalary}-${j.maxSalary}`.trim() : null;
  return withUrl({
    source: 'himalayas', sourceLabel: 'Himalayas', sourceJobId: j.guid, url: j.applicationLink ?? j.guid,
    title: j.title, company: j.companyName ?? 'Not stated',
    location: names.length ? names.join(', ') : 'Remote, worldwide', workMode: 'remote', slEligibility: open ? 'yes' : 'no',
    employmentType: j.employmentType, category: (j.categories ?? [])[0] ?? null, salary: pay,
    postedAt: parseDate(j.pubDate), deadline: parseDate(j.expiryDate), description: htmlToText(j.description ?? j.excerpt),
  });
}

const himalayas: SourceAdapter = {
  id: 'himalayas', label: 'Himalayas', region: 'Remote', scope: 'both',
  note: 'Remote jobs. With Local on it searches jobs for Sri Lanka, and with Global on it searches worldwide. Rate limit is shared unless you add a free key.',
  search: async (ctx) => {
    const headers: Record<string, string> = ctx.env.HIMALAYAS_API_KEY ? { Authorization: `Bearer ${ctx.env.HIMALAYAS_API_KEY}` } : {};
    const seen = new Map<string, RawJob>();
    const countries = [...(ctx.settings.local_enabled ? ['Sri Lanka'] : []), ...(ctx.settings.global_enabled ? [''] : [])];
    for (const country of countries) {
      for (const term of ctx.keywords.slice(0, 3)) {
        const params = new URLSearchParams({ q: term, sort: 'recent' });
        if (country) params.set('country', country);
        const data = await getJson(ctx, `https://himalayas.app/jobs/api/search?${params}`, { headers });
        for (const j of data.jobs ?? []) for (const job of himalayasJob(j)) seen.set(job.url, job);
        await ctx.sleep(1000);
      }
    }
    return [...seen.values()];
  },
  verify: async (jobs, ctx) => {
    const out = new Map<number, VerifyState>();
    for (const j of jobs.slice(0, 15)) {
      const m = (j.sourceJobId ?? j.url).match(/companies\/([^/]+)\/jobs\/([^/?#]+)/);
      if (!m) { out.set(j.id, 'unknown'); continue; }
      const res = await httpGet(ctx, `https://himalayas.app/jobs/api/companies/${m[1]}/jobs/${m[2]}`, { retries: 1 }).catch(() => null);
      out.set(j.id, !res ? 'unknown' : res.status === 410 || res.status === 404 ? 'closed' : res.ok ? 'active' : 'unknown');
      await ctx.sleep(1100);
    }
    return out;
  },
};

// ── We Work Remotely (public RSS feed) ──────────────────────────────────────
/*
 * Checked in November 2026: its feed page says anyone may use the public feed
 * if listings are attributed, and robots.txt allows it. Each job links back to
 * its WWR page. The feed holds the 100 newest jobs, and each states the region
 * that may apply ("Anywhere in the World", "Asia Only", "USA Only" and so on).
 */
const OPEN_TO_SRI_LANKA = /anywhere|worldwide|asia|apac|sri lanka/i;

export function parseWwr(body: string): RawJob[] {
  return feedItems(body, 'We Work Remotely').flatMap((it: any) => {
    const heading = htmlToText(String(it.title ?? ''));
    const split = heading.indexOf(': ');
    const company = split > 0 ? heading.slice(0, split).trim() : 'Not stated';
    const title = split > 0 ? heading.slice(split + 2).trim() : heading;
    const region = htmlToText(String(it.region ?? '')) || 'Not stated';
    const country = htmlToText(String(it.country ?? ''));
    const skills = htmlToText(String(it.skills ?? ''));
    return withUrl({
      source: 'wwr', sourceLabel: 'We Work Remotely', sourceJobId: String(it.guid ?? it.link ?? ''), url: String(it.link ?? ''),
      title, company, location: `Remote (${[region, country].filter(Boolean).join(', ')})`, workMode: 'remote',
      slEligibility: OPEN_TO_SRI_LANKA.test(region) ? 'yes' : 'no',
      employmentType: htmlToText(String(it.type ?? '')) || null, category: htmlToText(String(it.category ?? '')) || null,
      postedAt: parseDate(it.pubDate), deadline: parseDate(it.expires_at),
      description: [htmlToText(String(it.description ?? '')), skills ? `Skills: ${skills}` : ''].filter(Boolean).join('\n\n'),
    });
  });
}

const wwr: SourceAdapter = {
  id: 'wwr', label: 'We Work Remotely', region: 'Remote', scope: 'global',
  note: 'Remote jobs from the public feed We Work Remotely publishes, searched with Global on. Each job says which regions may apply; only "Anywhere in the World" and "Asia" jobs count as open to Sri Lanka.',
  search: async (ctx) => {
    const url = 'https://weworkremotely.com/remote-jobs.rss';
    if (!(await robotsAllow(ctx, url))) throw new SourceError('We Work Remotely: robots.txt does not allow its feed');
    const res = await httpGet(ctx, url, { timeoutMs: 30_000 });
    if (!res.ok) throw feedError('We Work Remotely', res.status);
    return parseWwr(await res.text());
  },
};

// ── ReliefWeb (NGO, UN and humanitarian jobs) ───────────────────────────────
/*
 * ReliefWeb's public API (v2) needs an app name that ReliefWeb approves; requests
 * without one are refused (HTTP 403). The source stays off until RELIEFWEB_APPNAME
 * is set. Like the other providers' APIs, it is called as documented rather than
 * crawled, so the API host's robots.txt (which turns crawlers away) does not apply.
 * Each job links back to its ReliefWeb page.
 */
const RELIEFWEB_FIELDS = ['title', 'url_alias', 'url', 'date.created', 'date.closing', 'source.name', 'country.name', 'city.name', 'body', 'career_categories.name', 'type.name', 'experience.name'];

export function parseReliefweb(data: any): RawJob[] {
  return (data?.data ?? []).flatMap((item: any) => {
    const f = item?.fields ?? {};
    const names = (v: any) => [v].flat().map((x: any) => x?.name).filter(Boolean) as string[];
    const countries = names(f.country);
    const cities = names(f.city);
    const sriLanka = countries.some((c) => /sri lanka/i.test(c));
    const facts = [
      names(f.career_categories).length ? `Category: ${names(f.career_categories).join(', ')}` : '',
      names(f.experience).length ? `Experience: ${names(f.experience).join(', ')}` : '',
      names(f.type).length ? `Type: ${names(f.type).join(', ')}` : '',
    ].filter(Boolean).join('\n');
    return withUrl({
      source: 'reliefweb', sourceLabel: 'ReliefWeb', sourceJobId: String(item?.id ?? f.url ?? ''), url: f.url_alias || f.url,
      title: htmlToText(f.title), company: names(f.source).join(', ') || 'Not stated',
      location: [...cities, ...countries].join(', ') || 'Not stated', country: countries[0] ?? null,
      workMode: modeFrom(`${f.title} ${cities.join(' ')}`), slEligibility: sriLanka ? 'yes' : undefined,
      employmentType: names(f.type)[0] ?? null, category: names(f.career_categories)[0] ?? null,
      postedAt: parseDate(f.date?.created), deadline: parseDeadline(String(f.date?.closing ?? '').slice(0, 10) || null),
      description: [htmlToText(f.body), facts].filter(Boolean).join('\n\n'),
    });
  });
}

const reliefweb: SourceAdapter = {
  id: 'reliefweb', label: 'ReliefWeb', region: 'Remote', scope: 'both',
  note: 'NGO, UN and humanitarian jobs from ReliefWeb\'s API: all current jobs in Sri Lanka with Local on, and a worldwide search for your top keywords with Global on. Needs an app name approved by ReliefWeb.',
  missingConfig: (ctx) => (ctx.env.RELIEFWEB_APPNAME ? null : 'Add RELIEFWEB_APPNAME, the app name ReliefWeb approved for you, to turn this on.'),
  search: async (ctx) => {
    const endpoint = `https://api.reliefweb.int/v2/jobs?appname=${encodeURIComponent(ctx.env.RELIEFWEB_APPNAME!)}`;
    const ask = async (body: object) => {
      const res = await httpGet(ctx, endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, fields: { include: RELIEFWEB_FIELDS }, sort: ['date.created:desc'] }) });
      if (res.status === 403) throw new SourceSkip('ReliefWeb: the app name was refused. Check that RELIEFWEB_APPNAME is the exact name ReliefWeb approved.');
      if (!res.ok) throw feedError('ReliefWeb', res.status);
      return parseReliefweb(await res.json());
    };
    const seen = new Map<string, RawJob>();
    if (ctx.settings.local_enabled) {
      for (const job of await ask({ filter: { field: 'country.name', value: 'Sri Lanka' }, limit: 50 })) seen.set(job.url, job);
    }
    if (ctx.settings.global_enabled) {
      for (const term of ctx.keywords.slice(0, 3)) {
        await ctx.sleep(1000);
        for (const job of await ask({ query: { value: term, fields: ['title'] }, limit: 20 })) seen.set(job.url, job);
      }
    }
    return [...seen.values()];
  },
};

// ── Jobicy ──────────────────────────────────────────────────────────────────
function jobicyJob(j: any): RawJob[] {
  const geo = String(j.jobGeo ?? '');
  const open = /anywhere|worldwide|apac|asia|sri lanka/i.test(geo);
  const type = Array.isArray(j.jobType) ? j.jobType.join(', ') : j.jobType;
  const pay = j.salaryMin && j.salaryMax ? `${j.salaryCurrency ?? ''} ${j.salaryMin}-${j.salaryMax}${j.salaryPeriod ? ` per ${j.salaryPeriod}` : ''}`.trim() : null;
  return withUrl({
    source: 'jobicy', sourceLabel: 'Jobicy', sourceJobId: String(j.id), url: j.url,
    title: j.jobTitle, company: j.companyName ?? 'Not stated', location: geo || 'Remote', workMode: 'remote',
    slEligibility: open ? (/anywhere|worldwide|sri lanka/i.test(geo) ? 'yes' : 'unknown') : 'no',
    employmentType: type, category: Array.isArray(j.jobIndustry) ? j.jobIndustry[0] : j.jobIndustry, salary: pay,
    postedAt: parseDate(j.pubDate), description: htmlToText(j.jobDescription ?? j.jobExcerpt),
  });
}

const jobicy: SourceAdapter = {
  id: 'jobicy', label: 'Jobicy', region: 'Remote', scope: 'global',
  note: 'International remote jobs from the last 7 days, searched with Global on. Jobicy asks for one sync an hour at most, which this schedule respects.',
  search: async (ctx) => {
    const data = await getJson(ctx, 'https://jobicy.com/api/jobs?count=100&geo=apac');
    const global = await getJson(ctx, 'https://jobicy.com/api/jobs?count=100');
    return [...(data.jobs ?? []), ...(global.jobs ?? [])].flatMap(jobicyJob);
  },
  verify: async (jobs, ctx) => {
    const ids = jobs.map((j) => j.sourceJobId).filter((x): x is string => /^\d+$/.test(x ?? '')).slice(0, 100);
    const out = new Map<number, VerifyState>();
    if (!ids.length) return out;
    const data = await getJson(ctx, `https://jobicy.com/api/jobs/status?ids=${ids.join(',')}`);
    const state = new Map<string, VerifyState>((data.jobs ?? []).map((r: any) => [String(r.id), r.status]));
    for (const j of jobs) {
      const s = state.get(j.sourceJobId ?? '');
      out.set(j.id, s === 'active' || s === 'closed' ? s : 'unknown');
    }
    return out;
  },
};

// ── Remotive ────────────────────────────────────────────────────────────────
function remotiveJob(j: any): RawJob[] {
  const where = String(j.candidate_required_location ?? '');
  const eligible = /worldwide|anywhere|sri lanka/i.test(where) ? 'yes' : /asia|apac/i.test(where) ? 'unknown' : 'no';
  return withUrl({
    source: 'remotive', sourceLabel: 'Remotive', sourceJobId: String(j.id), url: j.url,
    title: j.title, company: j.company_name ?? 'Not stated', location: where || 'Remote', workMode: 'remote', slEligibility: eligible,
    employmentType: j.job_type?.replace(/_/g, ' '), category: j.category, salary: j.salary || null,
    postedAt: parseDate(j.publication_date), description: htmlToText(j.description),
  });
}

const remotive: SourceAdapter = {
  id: 'remotive', label: 'Remotive', region: 'Remote', scope: 'global', maxPerDay: 4,
  note: 'International remote jobs, searched with Global on, and shown 24 hours after publication. Remotive asks for no more than 4 requests a day, so extra manual searches skip it.',
  search: async (ctx) => (await getJson(ctx, 'https://remotive.com/api/remote-jobs?limit=200')).jobs?.flatMap(remotiveJob) ?? [],
};

// ── Remote OK ───────────────────────────────────────────────────────────────
function remoteOkJob(j: any): RawJob[] {
  if (!j.position) return [];
  const where = String(j.location ?? '');
  return withUrl({
    source: 'remoteok', sourceLabel: 'Remote OK', sourceJobId: String(j.id), url: j.url,
    title: j.position, company: j.company ?? 'Not stated', location: where || 'Remote', workMode: 'remote',
    slEligibility: !where || /worldwide|anywhere|sri lanka/i.test(where) ? 'yes' : 'unknown',
    salary: j.salary_min && j.salary_max ? `USD ${j.salary_min}-${j.salary_max}` : null,
    postedAt: parseDate(j.date), description: htmlToText(j.description),
  });
}

const remoteok: SourceAdapter = {
  id: 'remoteok', label: 'Remote OK', region: 'Remote', scope: 'global',
  note: 'International remote jobs, searched with Global on. Each listing links back to Remote OK, as its terms require.',
  search: async (ctx) => {
    const data = await getJson<any[]>(ctx, 'https://remoteok.com/api');
    return Array.isArray(data) ? data.flatMap(remoteOkJob) : [];
  },
};

// ── Company career boards ───────────────────────────────────────────────────
type BoardFetch = (slug: string, ctx: SourceContext, id: string, label: string) => Promise<RawJob[]>;

const lever: BoardFetch = async (slug, ctx, id, label) => {
  const data = await getJson<any[]>(ctx, `https://api.lever.co/v0/postings/${slug}?mode=json`);
  return (Array.isArray(data) ? data : []).flatMap((j) => withUrl({
    source: id, sourceLabel: label, sourceJobId: j.id, url: j.hostedUrl, title: j.text, company: slugName(slug),
    location: j.categories?.location ?? (j.categories?.allLocations ?? []).join(', ') ?? '',
    workMode: j.workplaceType === 'remote' ? 'remote' : j.workplaceType === 'hybrid' ? 'hybrid' : j.workplaceType === 'on-site' || j.workplaceType === 'onsite' ? 'onsite' : 'unknown',
    employmentType: j.categories?.commitment, category: j.categories?.team, postedAt: parseDate(j.createdAt),
    description: j.descriptionPlain || htmlToText(j.description) + '\n' + (j.lists ?? []).map((l: any) => `${l.text}\n${htmlToText(l.content)}`).join('\n'),
  }));
};

const greenhouse: BoardFetch = async (slug, ctx, id, label) => {
  const data = await getJson(ctx, `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`);
  return (data.jobs ?? []).flatMap((j: any) => withUrl({
    source: id, sourceLabel: label, sourceJobId: String(j.id), url: j.absolute_url, title: j.title, company: j.company_name ?? slugName(slug),
    location: j.location?.name ?? '', workMode: modeFrom(j.location?.name), postedAt: parseDate(j.first_published ?? j.updated_at),
    description: htmlToText(j.content),
  }));
};

const ashby: BoardFetch = async (slug, ctx, id, label) => {
  const data = await getJson(ctx, `https://api.ashbyhq.com/posting-api/job-board/${slug}?includeCompensation=true`);
  return (data.jobs ?? []).flatMap((j: any) => withUrl({
    source: id, sourceLabel: label, sourceJobId: j.id, url: j.jobUrl, title: j.title, company: slugName(slug),
    location: j.location ?? '', workMode: j.isRemote ? 'remote' : String(j.workplaceType ?? '').toLowerCase() === 'hybrid' ? 'hybrid' : 'onsite',
    employmentType: j.employmentType, category: j.department, salary: j.compensation?.compensationTierSummary ?? null,
    postedAt: parseDate(j.publishedAt), description: j.descriptionPlain || htmlToText(j.descriptionHtml),
  }));
};

const smartrecruiters: BoardFetch = async (slug, ctx, id, label) => {
  const country = ctx.settings.global_enabled ? '' : '&country=lk'; // With Global off, Local must be on.
  const data = await getJson(ctx, `https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=100${country}`);
  return (data.content ?? []).flatMap((j: any) => withUrl({
    source: id, sourceLabel: label, sourceJobId: j.id, url: `https://jobs.smartrecruiters.com/${slug}/${j.id}`, title: j.name,
    company: j.company?.name ?? slugName(slug),
    location: [j.location?.city, j.location?.region, j.location?.country?.toUpperCase() === 'LK' ? 'Sri Lanka' : j.location?.country].filter(Boolean).join(', '),
    workMode: j.location?.remote ? 'remote' : j.location?.hybrid ? 'hybrid' : 'onsite',
    employmentType: j.typeOfEmployment?.label, category: j.function?.label, postedAt: parseDate(j.releasedDate),
    description: `${j.name} at ${j.company?.name ?? slugName(slug)}. ${j.experienceLevel?.label ?? ''} ${j.department?.label ?? ''}`.trim(),
  }));
};

// Workable and Recruitee: public but less formally documented than the four above.
const workable: BoardFetch = async (slug, ctx, id, label) => {
  const data = await getJson(ctx, `https://apply.workable.com/api/v1/widget/accounts/${slug}?details=true`);
  return (data.jobs ?? []).flatMap((j: any) => {
    const place = j.locations?.[0] ?? j.location ?? {};
    const location = j.location?.location_str ?? [place.city, place.country_name ?? place.country].filter(Boolean).join(', ');
    return withUrl({
      source: id, sourceLabel: label, sourceJobId: j.shortcode ?? String(j.id ?? j.url), url: j.url ?? j.shortlink, title: j.title, company: data.name ?? slugName(slug),
      location, country: place.country_name ?? null, workMode: place.telecommuting || j.telecommuting ? 'remote' : modeFrom(place.workplace_type ?? j.workplace_type),
      postedAt: parseDate(j.published_on ?? j.created_at), description: htmlToText(j.full_description ?? j.description),
    });
  });
};

const recruitee: BoardFetch = async (slug, ctx, id, label) => {
  const data = await getJson(ctx, `https://${slug}.recruitee.com/api/offers`);
  return (data.offers ?? []).flatMap((j: any) => withUrl({
    source: id, sourceLabel: label, sourceJobId: String(j.id ?? j.careers_url), url: j.careers_url ?? j.careers_apply_url, title: j.title, company: j.company_name ?? slugName(slug),
    location: j.location ?? [j.city, j.country].filter(Boolean).join(', '), country: j.country ?? null,
    workMode: j.remote ? 'remote' : j.hybrid ? 'hybrid' : j.on_site ? 'onsite' : 'unknown', category: j.department,
    salary: j.salary?.min && j.salary?.max ? `${j.salary.currency ?? ''} ${j.salary.min}-${j.salary.max}`.trim() : null,
    postedAt: parseDate(j.published_at), deadline: parseDate(j.close_at), description: htmlToText(j.description),
  }));
};

export const BOARDS: Record<string, { label: string; fetch: BoardFetch }> = {
  lever: { label: 'Lever', fetch: lever }, greenhouse: { label: 'Greenhouse', fetch: greenhouse },
  ashby: { label: 'Ashby', fetch: ashby }, smartrecruiters: { label: 'SmartRecruiters', fetch: smartrecruiters },
  workable: { label: 'Workable', fetch: workable }, recruitee: { label: 'Recruitee', fetch: recruitee },
};

export function slugName(slug: string) {
  return slug.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function fixedSources(): SourceAdapter[] {
  return [itpro, jobpal, observerjobs, govjobs, govdoc, govhub, gazettelk, nearjobs, himalayas, reliefweb, jobify, wwr, jobicy, remotive, remoteok];
}

export function feedSource(url: string): SourceAdapter {
  const id = `feed:${new URL(url).host}`;
  const label = new URL(url).host.replace(/^www\./, '');
  return {
    id, label, region: 'Your feed', scope: 'both',
    note: 'An RSS feed you added. It is read only if the site\'s robots.txt allows it.',
    search: (ctx) => fetchFeed(ctx, url, id, label),
  };
}

/** Sites people expect to see that this app must not, or cannot, search. */
export const UNAVAILABLE_SOURCES: { label: string; reason: string; government?: boolean; searchUrl: (q: string) => string }[] = [
  { label: 'LinkedIn Jobs', reason: 'No public job-search API, and its terms forbid automated collection. Jobs has LinkedIn searches built from your CV.', searchUrl: (q) => `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(q)}&location=Sri%20Lanka` },
  ...SRI_LANKA_SITES.filter((site) => !site.automatic).map((site) => ({ label: site.label, reason: site.reason, searchUrl: (q: string) => siteSearchUrl(site, q) })),
  ...GLOBAL_SITES.filter((site) => !site.automatic).map((site) => ({ label: site.label, reason: site.reason, searchUrl: (q: string) => siteSearchUrl(site, q) })),
  ...GOVERNMENT_SITES.filter((site) => !site.automatic).map((site) => ({ label: site.label, reason: site.reason, government: true, searchUrl: (q: string) => siteSearchUrl(site, q) })),
];
