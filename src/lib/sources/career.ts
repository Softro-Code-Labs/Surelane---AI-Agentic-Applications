import { lookup } from 'node:dns/promises';
import * as cheerio from 'cheerio';
import { familyOfTitle } from '../match/taxonomy';
import { htmlToText, parseDate, parseDeadline, safeUrl, truncate } from '../text';
import { BOARDS, slugName } from './adapters';
import { USER_AGENT, robotsAllow } from './http';
import { SourceError, SourceSkip, type RawJob, type SourceAdapter, type SourceContext } from './types';

export const MAX_CAREER_PAGES = 100;
export const DETAILS_PER_PAGE = 12;
export const DETAILS_PER_RUN = 150;

export type CareerPage = { id: string; company: string; url: string; default_location: string };
export type CareerStatus = 'ok' | 'no_jobs' | 'needs_browser' | 'not_allowed' | 'error';
export type Outcome = { status: CareerStatus; message: string; jobs: RawJob[] };

// ── Working out what a pasted link is ───────────────────────────────────────
const ATS_LINKS: [RegExp, string][] = [
  [/^https?:\/\/jobs(?:\.eu)?\.lever\.co\/([\w.-]+)/i, 'lever'],
  [/^https?:\/\/(?:job-)?boards(?:\.eu)?\.greenhouse\.io\/(?:embed\/job_board\?for=)?([\w.-]+)/i, 'greenhouse'],
  [/^https?:\/\/jobs\.ashbyhq\.com\/([\w.-]+)/i, 'ashby'],
  [/^https?:\/\/(?:jobs|careers)\.smartrecruiters\.com\/([\w.-]+)/i, 'smartrecruiters'],
  [/^https?:\/\/apply\.workable\.com\/([\w.-]+)/i, 'workable'],
  [/^https?:\/\/([\w-]+)\.recruitee\.com/i, 'recruitee'],
];
const NOT_A_SLUG = new Set(['api', 'embed', 'j', 'careers', 'www', 'jobs']);

export function detectAts(url: string): { provider: string; slug: string } | null {
  for (const [re, provider] of ATS_LINKS) {
    const slug = url.match(re)?.[1];
    if (slug && /^[a-z0-9]/i.test(slug) && !NOT_A_SLUG.has(slug.toLowerCase())) return { provider, slug };
  }
  return null;
}

const SHORTHAND: Record<string, (s: string) => string> = {
  lever: (s) => `https://jobs.lever.co/${s}`, greenhouse: (s) => `https://boards.greenhouse.io/${s}`,
  ashby: (s) => `https://jobs.ashbyhq.com/${s}`, smartrecruiters: (s) => `https://jobs.smartrecruiters.com/${s}`,
  workable: (s) => `https://apply.workable.com/${s}`, recruitee: (s) => `https://${s}.recruitee.com`,
};

/** Accepts "https://…", "Company, https://…" or "lever:company". */
export function parseEntry(line: string): { company: string; url: string } | null {
  const text = line.trim();
  const short = text.match(/^(lever|greenhouse|ashby|smartrecruiters|workable|recruitee):([a-z0-9][a-z0-9._-]{0,80})$/i);
  if (short) return { company: slugName(short[2]!), url: SHORTHAND[short[1]!.toLowerCase()]!(short[2]!) };
  const m = text.match(/^(?:(.+?)\s*[,|]\s*)?((?:https?:\/\/)?[^\s,]+\.[^\s,]+)$/i);
  if (!m) return null;
  const url = safeUrl(/^https?:\/\//i.test(m[2]!) ? m[2]! : `https://${m[2]}`);
  if (!url) return null;
  const ats = detectAts(url);
  const host = new URL(url).hostname.replace(/^(www|careers|jobs)\./, '').split('.')[0]!;
  return { company: truncate(m[1]?.trim() || (ats ? slugName(ats.slug) : slugName(host)), 120), url };
}

// ── Safety: this fetches links that someone typed in ────────────────────────
const PRIVATE = /^(0\.|10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|::1$|::$|f[cd]|fe80|::ffff:(10\.|127\.|192\.168\.))/i;

export async function assertPublic(url: string, ctx: Pick<SourceContext, 'resolveHost'>) {
  const u = new URL(url);
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new SourceError('Only web links can be read.');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new SourceError('Private network addresses cannot be read.');
  const resolve = ctx.resolveHost ?? (async (h: string) => (await lookup(h, { all: true })).map((a) => a.address));
  const ips = await resolve(host).catch(() => { throw new SourceError(`The website ${host} could not be found.`); });
  if (!ips.length || ips.some((ip) => PRIVATE.test(ip))) throw new SourceError('Private network addresses cannot be read.');
}

class NotAllowed extends Error {}

const BOT_WALL = /(just a moment|attention required|captcha|are you (?:a )?human|verify you are (?:a )?human|access denied|request blocked|unusual traffic)/i;

/** One page read: permission first, every redirect re-checked, nothing bypassed. */
async function readPage(ctx: SourceContext, company: string, start: string): Promise<{ html: string; url: string }> {
  let url = start;
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(url, ctx);
    if (!(await robotsAllow(ctx, url))) throw new NotAllowed(`${company} does not allow automated search of this page. Its robots.txt rules say no, so the agent will not read it.`);
    let res: Response;
    try {
      res = await ctx.fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(20_000), headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' } });
    } catch (e) {
      throw new SourceError(`The website could not be reached: ${e instanceof Error ? e.message : e}`);
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { url = new URL(res.headers.get('location')!, url).toString(); continue; }
    if (res.status === 401 || res.status === 403) throw new NotAllowed(`${company} does not allow automated search. Its website refused access (HTTP ${res.status}), and the agent does not try to get around that.`);
    if (res.status === 404 || res.status === 410) throw new SourceError('This link no longer exists. Check the address.');
    if (res.status === 429) throw new SourceError('The website asked for fewer requests. The agent will try again at the next search.');
    if (!res.ok && res.status !== 503) throw new SourceError(`The website returned HTTP ${res.status}.`);
    const type = res.headers.get('content-type') ?? 'text/html';
    if (!/html|xml/i.test(type)) throw new SourceError('This link is not a web page. Add the page that lists the jobs.');
    const html = (await res.text()).slice(0, 1_500_000);
    if (BOT_WALL.test(html.slice(0, 4000)) && html.length < 60_000) throw new NotAllowed(`${company} does not allow automated search. Its website uses an anti-bot check, and the agent does not bypass these.`);
    if (!res.ok) throw new SourceError('The website is temporarily unavailable.');
    return { html, url };
  }
  throw new SourceError('This link redirects too many times.');
}

// ── Structured job data (schema.org JobPosting) ─────────────────────────────
function walk(node: any, out: any[]) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach((n) => walk(n, out));
  const type = node['@type'];
  if (type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'))) out.push(node);
  for (const key of ['@graph', 'itemListElement', 'item', 'mainEntity']) walk(node[key], out);
}

export function jsonLdPostings(html: string): any[] {
  const $ = cheerio.load(html);
  const out: any[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try { walk(JSON.parse($(el).text()), out); } catch { /* one bad block must not hide the rest */ }
  });
  return out;
}

const list = (v: any) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
const countryName = (c: any) => {
  const name = typeof c === 'string' ? c : c?.name;
  return name && /^lk$/i.test(name) ? 'Sri Lanka' : name;
};

function fromPosting(p: any, page: CareerPage, base: Omit<RawJob, 'url' | 'title' | 'description' | 'location'>, pageUrl: string): RawJob | null {
  const title = htmlToText(p.title ?? p.name);
  if (!title) return null;
  let url: string | null = null;
  try { url = safeUrl(new URL(p.url ?? p.sameAs ?? pageUrl, pageUrl).toString()); } catch { url = safeUrl(pageUrl); }
  if (!url) return null;
  const addresses = list(p.jobLocation).map((l: any) => l?.address ?? l);
  const places = addresses.map((a: any) => (typeof a === 'string' ? a : [a?.addressLocality, a?.addressRegion, countryName(a?.addressCountry)].filter(Boolean).join(', '))).filter(Boolean);
  const remote = list(p.jobLocationType).includes('TELECOMMUTE');
  const allowed = list(p.applicantLocationRequirements).map((r: any) => countryName(r)).filter(Boolean);
  const pay = p.baseSalary?.value;
  return {
    ...base, url, title,
    location: places.join('; ') || (remote ? (allowed.join(', ') || 'Remote') : `${page.default_location} (assumed)`),
    country: countryName(addresses[0]?.addressCountry) ?? (places.length || remote ? null : assumedCountry(page)),
    workMode: remote ? 'remote' : 'unknown',
    slEligibility: remote ? (allowed.length === 0 ? 'unknown' : allowed.some((a: string) => /sri lanka/i.test(a)) ? 'yes' : 'no') : undefined,
    employmentType: list(p.employmentType).join(', ').replace(/_/g, ' ').toLowerCase() || null,
    salary: pay?.minValue && pay?.maxValue ? `${p.baseSalary.currency ?? ''} ${pay.minValue}-${pay.maxValue}`.trim() : null,
    postedAt: parseDate(p.datePosted), deadline: parseDeadline(p.validThrough),
    description: htmlToText(p.description),
    sourceJobId: String(p.identifier?.value ?? p.identifier ?? url),
  };
}

const assumedCountry = (page: CareerPage) => (/sri lanka/i.test(page.default_location) ? 'Sri Lanka' : null);

// ── Hiring systems embedded in a company's own page ─────────────────────────
export function embeddedAts(html: string): { provider: string; slug: string } | null {
  const $ = cheerio.load(html);
  const urls = $('a[href],iframe[src],script[src]').map((_, el) => $(el).attr('href') ?? $(el).attr('src')).get();
  for (const u of urls) {
    if (!/^https?:/i.test(u)) continue;
    const hit = detectAts(u);
    if (hit) return hit;
  }
  return null;
}

// ── Plain web pages ─────────────────────────────────────────────────────────
const ROLE = /\b(engineer|developer|manager|executive|officer|assistant|analyst|consultant|specialist|coordinator|intern|internship|trainee|supervisor|designer|accountant|technician|representative|associate|administrator|lecturer|teacher|nurse|driver|lead)\b/i;
const NOT_ROLE = /^(our|meet|about|why|how|what|join|life|view|see|all|the|careers?|jobs|vacancies|news|blog|contact|home)\b/i;
const GENERIC = /^(apply( now)?|view( details| job| more)?|read more|details|learn more|more|see more|find out more)$/i;
const CAREERISH = /(job|career|vacanc|position|opening|opportunit|recruit|join-us|work-with-us)/i;

function titleLike(t: string) {
  return t.length >= 4 && t.length <= 90 && !NOT_ROLE.test(t) && (ROLE.test(t) || familyOfTitle(t) !== null);
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

export function jobLinks(html: string, pageUrl: string): { links: { url: string; title: string }[]; pdfs: number } {
  const $ = cheerio.load(html);
  const base = new URL(pageUrl);
  const root = base.hostname.replace(/^www\./, '');
  const seen = new Map<string, string>();
  let pdfs = 0;
  $('a[href]').each((_, el) => {
    const a = $(el);
    if (a.closest('nav,footer,header').length) return;
    const href = a.attr('href') ?? '';
    if (/^(mailto|tel|javascript):|^#/i.test(href)) return;
    let abs: URL;
    try { abs = new URL(href, pageUrl); } catch { return; }
    if (!abs.hostname.replace(/^www\./, '').endsWith(root) && !root.endsWith(abs.hostname.replace(/^www\./, ''))) return;
    if (/\.(pdf|docx?)$/i.test(abs.pathname)) { pdfs++; return; }
    let title = clean(a.text());
    if (GENERIC.test(title) || !title) {
      if (!CAREERISH.test(abs.pathname)) return;
      title = clean(a.closest('li,article,tr,div').find('h1,h2,h3,h4,h5,strong').first().text());
    }
    if (!titleLike(title)) return;
    abs.hash = '';
    const url = safeUrl(abs.toString());
    if (url && url !== safeUrl(pageUrl) && !seen.has(url)) seen.set(url, title);
  });
  return { links: [...seen].map(([url, title]) => ({ url, title })), pdfs };
}

/** Pages that list every vacancy in one place, with no link for each. */
export function inlineJobs(html: string, pageUrl: string): { title: string; description: string }[] {
  const $ = cheerio.load(html);
  if (!CAREERISH.test(pageUrl) && !/vacanc|apply|openings/i.test($('body').text())) return [];
  const out: { title: string; description: string }[] = [];
  $('main h2,main h3,main h4,article h2,article h3,article h4,body h2,body h3,body h4').each((_, el) => {
    const h = $(el);
    if (h.closest('nav,footer,header').length) return;
    const title = clean(h.text());
    if (!titleLike(title) || out.some((o) => o.title === title)) return;
    out.push({ title, description: h.nextUntil('h1,h2,h3,h4').map((_, n) => $(n).text()).get().join('\n').trim() });
  });
  return out.slice(0, 20);
}

function pageText(html: string) {
  const $ = cheerio.load(html);
  $('script,style,noscript,nav,header,footer,svg').remove();
  const main = $('main').first().html() ?? $('article').first().html() ?? $('body').html() ?? '';
  return { text: htmlToText(main), h1: clean($('h1').first().text()) };
}

function deadlineIn(text: string): Date | null {
  const m = text.match(/(?:closing date|deadline|apply before|applications? close[s]?(?: on)?|last date)\s*[:\-]?\s*([0-9]{1,2}(?:st|nd|rd|th)?[\s/.-][A-Za-z0-9]{1,9}[\s/.-][0-9]{2,4}|[A-Za-z]{3,9} [0-9]{1,2},? [0-9]{4}|[0-9]{4}-[0-9]{2}-[0-9]{2})/i);
  return m ? parseDeadline(m[1]!.replace(/(\d)(st|nd|rd|th)/, '$1')) : null;
}

function looksScripted(html: string, text: string) {
  return text.length < 300 || (/<div[^>]+id=["'](root|app|__next)["'][^>]*>\s*<\/div>/i.test(html) && text.length < 800);
}

const toRaw = (j: any): Partial<RawJob> => ({
  title: j.title, description: j.description, location: j.location, deadline: j.deadline, postedAt: j.posted_at, employmentType: j.employment_type, salary: j.salary, country: j.country, workMode: j.work_mode,
});

async function readWebPage(page: CareerPage, ctx: SourceContext, base: Omit<RawJob, 'url' | 'title' | 'description' | 'location'>, detailLimit: number): Promise<Outcome> {
  const { html, url: finalUrl } = await readPage(ctx, page.company, page.url);

  const ats = embeddedAts(html);
  if (ats) return fromBoard(page, ctx, base, ats);

  const structured = jsonLdPostings(html).map((p) => fromPosting(p, page, base, finalUrl)).filter((j): j is RawJob => Boolean(j));
  if (structured.length) return { status: 'ok', message: `Found ${structured.length} vacancies in the page's job data.`, jobs: structured };

  const { links, pdfs } = jobLinks(html, finalUrl);
  const assumed = { country: assumedCountry(page), location: `${page.default_location} (assumed)` };
  if (links.length) {
    const jobs: RawJob[] = [];
    let opened = 0;
    for (const link of links) {
      const known = ctx.knownJobs?.get(link.url);
      if (known) { jobs.push({ ...base, url: link.url, sourceJobId: link.url, ...assumed, ...toRaw(known) } as RawJob); continue; }
      const budget = ctx.detailBudget;
      if (opened >= detailLimit || (budget && budget.left <= 0)) { jobs.push({ ...base, ...assumed, url: link.url, sourceJobId: link.url, title: link.title, description: '' }); continue; }
      opened++;
      if (budget) budget.left--;
      await ctx.sleep(1000);
      try {
        const detail = await readPage(ctx, page.company, link.url);
        const posting = jsonLdPostings(detail.html).map((p) => fromPosting(p, page, base, detail.url)).find(Boolean);
        if (posting) { jobs.push({ ...posting, url: safeUrl(detail.url) ?? link.url }); continue; }
        const { text } = pageText(detail.html);
        jobs.push({ ...base, ...assumed, url: link.url, sourceJobId: link.url, title: link.title, description: text.slice(0, 20_000), deadline: deadlineIn(text) });
      } catch {
        jobs.push({ ...base, ...assumed, url: link.url, sourceJobId: link.url, title: link.title, description: '' });
      }
    }
    return { status: 'ok', message: `Found ${jobs.length} vacancies on this page.`, jobs };
  }

  const inline = inlineJobs(html, finalUrl);
  if (inline.length) {
    const jobs = inline.map((j) => ({ ...base, ...assumed, url: safeUrl(finalUrl)!, sourceJobId: j.title, title: j.title, description: j.description, deadline: deadlineIn(j.description) }));
    return { status: 'ok', message: `Found ${jobs.length} vacancies on this page.`, jobs };
  }

  const { text } = pageText(html);
  if (/type=["']password["']/i.test(html) && text.length < 2500) {
    return { status: 'not_allowed', message: `${page.company} requires a sign-in to see this page. The agent does not sign in to company websites.`, jobs: [] };
  }
  if (pdfs) return { status: 'needs_browser', message: `Vacancies here are posted as PDF files, which the agent cannot read yet. Check this page yourself.`, jobs: [] };
  if (looksScripted(html, text)) return { status: 'needs_browser', message: 'This page loads its jobs with scripts the agent cannot read. If the company uses a hiring system such as Lever or Workable, add that link instead.', jobs: [] };
  return { status: 'no_jobs', message: 'The page was read, but no open vacancies were recognised.', jobs: [] };
}

async function fromBoard(page: CareerPage, ctx: SourceContext, base: Omit<RawJob, 'url' | 'title' | 'description' | 'location'>, ats: { provider: string; slug: string }): Promise<Outcome> {
  const provider = BOARDS[ats.provider]!;
  const raws = await provider.fetch(ats.slug, ctx, base.source, base.sourceLabel);
  const jobs = raws.map((j) => ({ ...j, company: page.company, location: j.location || `${page.default_location} (assumed)`, country: j.country ?? (j.location ? null : assumedCountry(page)) }));
  return { status: jobs.length ? 'ok' : 'no_jobs', message: jobs.length ? `Found ${jobs.length} vacancies through ${provider.label}.` : `${provider.label} shows no open vacancies for ${page.company}.`, jobs };
}

/** Reads one career page. Always returns an outcome, so the caller can show it. */
export async function inspectCareerPage(page: CareerPage, ctx: SourceContext, detailLimit = DETAILS_PER_PAGE): Promise<Outcome> {
  const base = { source: `page:${page.id}`, sourceLabel: `${page.company} careers`, company: page.company };
  try {
    const ats = detectAts(page.url);
    return await (ats ? fromBoard(page, ctx, base, ats) : readWebPage(page, ctx, base, detailLimit));
  } catch (e) {
    if (e instanceof NotAllowed) return { status: 'not_allowed', message: e.message, jobs: [] };
    return { status: 'error', message: e instanceof Error ? e.message : String(e), jobs: [] };
  }
}

export function careerPageSource(page: CareerPage): SourceAdapter {
  const adapter: SourceAdapter = {
    id: `page:${page.id}`, label: `${page.company} careers`, region: 'Company board', scope: 'both', completeListing: true, careerPageId: page.id,
    note: 'A company career page on your list.',
    search: async (ctx) => {
      const outcome = await inspectCareerPage(page, ctx);
      adapter.outcome = outcome;
      if (outcome.status === 'not_allowed') throw new SourceSkip(outcome.message);
      if (outcome.status === 'error') throw new SourceError(outcome.message);
      adapter.emptyMeansClosed = Boolean(detectAts(page.url)) && outcome.status === 'no_jobs';
      return outcome.jobs;
    },
  };
  return adapter;
}
