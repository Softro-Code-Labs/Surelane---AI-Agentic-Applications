import { XMLParser } from 'fast-xml-parser';
import { htmlToText, parseDate, parseDeadline, safeUrl } from '../text';
import { getJson, httpGet, robotsAllow } from './http';
import { SourceError, type RawJob, type SourceAdapter, type SourceContext, type VerifyState } from './types';

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
  const res = await httpGet(ctx, url);
  if (!res.ok) throw new SourceError(`${label}: HTTP ${res.status}`);
  return parseRss(await res.text(), id, label);
}

const itpro: SourceAdapter = {
  id: 'itpro', label: 'ITPro.lk', region: 'Sri Lanka', scope: 'local',
  note: 'Sri Lankan IT and technology jobs, read from the public RSS feed that ITPro.lk publishes.',
  search: async (ctx) => (await fetchFeed(ctx, 'https://itpro.lk/rss/all/', 'itpro', 'ITPro.lk')).map((j) => ({ ...j, country: 'Sri Lanka' })),
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
  id: 'himalayas', label: 'Himalayas', region: 'Remote', scope: 'local',
  note: 'Remote jobs, including those open to Sri Lanka. Rate limit is shared unless you add a free key.',
  search: async (ctx) => {
    const headers: Record<string, string> = ctx.env.HIMALAYAS_API_KEY ? { Authorization: `Bearer ${ctx.env.HIMALAYAS_API_KEY}` } : {};
    const seen = new Map<string, RawJob>();
    const countries = ctx.settings.global_enabled ? ['Sri Lanka', ''] : ['Sri Lanka'];
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
  id: 'jobicy', label: 'Jobicy', region: 'Remote', scope: 'local',
  note: 'Remote jobs from the last 7 days. Jobicy asks for one sync an hour at most, which this schedule respects.',
  search: async (ctx) => {
    const data = await getJson(ctx, 'https://jobicy.com/api/jobs?count=100&geo=apac');
    const global = ctx.settings.global_enabled ? await getJson(ctx, 'https://jobicy.com/api/jobs?count=100') : { jobs: [] };
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
  id: 'remotive', label: 'Remotive', region: 'Remote', scope: 'local', maxPerDay: 4,
  note: 'Remote jobs, shown 24 hours after publication. Remotive asks for no more than 4 requests a day, so extra manual searches skip it.',
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
  note: 'International remote jobs. Each listing links back to Remote OK, as its terms require.',
  search: async (ctx) => {
    const data = await getJson<any[]>(ctx, 'https://remoteok.com/api');
    return Array.isArray(data) ? data.flatMap(remoteOkJob) : [];
  },
};

// ── Jooble (needs a free key) ───────────────────────────────────────────────
const jooble: SourceAdapter = {
  id: 'jooble', label: 'Jooble', region: 'Sri Lanka', scope: 'local',
  note: 'Aggregated listings. Needs a free key from Jooble, emailed after a short form. Descriptions are excerpts.',
  missingConfig: (ctx) => (ctx.env.JOOBLE_API_KEY ? null : 'Add JOOBLE_API_KEY to turn this on.'),
  search: async (ctx) => {
    const out = new Map<string, RawJob>();
    const locations = ctx.settings.global_enabled ? ['Sri Lanka', ''] : ['Sri Lanka'];
    for (const location of locations) {
      for (const keywords of ctx.keywords.slice(0, 3)) {
        const res = await httpGet(ctx, `https://jooble.org/api/${ctx.env.JOOBLE_API_KEY}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keywords, location }),
        });
        if (!res.ok) throw new SourceError(`Jooble: HTTP ${res.status}`);
        for (const j of ((await res.json()) as any).jobs ?? []) {
          for (const job of withUrl({
            source: 'jooble', sourceLabel: 'Jooble', sourceJobId: String(j.id ?? j.link), url: j.link,
            title: htmlToText(j.title), company: j.company || 'Not stated', location: j.location || location, workMode: modeFrom(`${j.title} ${j.location}`),
            employmentType: j.type, salary: j.salary || null, postedAt: parseDate(j.updated), description: htmlToText(j.snippet),
          })) out.set(job.url, job);
        }
        await ctx.sleep(500);
      }
    }
    return [...out.values()];
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
  const country = ctx.settings.global_enabled ? '' : '&country=lk';
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
  return [itpro, himalayas, jobicy, remotive, remoteok, jooble];
}

export function feedSource(url: string): SourceAdapter {
  const id = `feed:${new URL(url).host}`;
  const label = new URL(url).host.replace(/^www\./, '');
  return {
    id, label, region: 'Your feed', scope: 'local',
    note: 'An RSS feed you added. It is read only if the site\'s robots.txt allows it.',
    search: (ctx) => fetchFeed(ctx, url, id, label),
  };
}

/** Sites people expect to see that this app must not, or cannot, search. */
export const UNAVAILABLE_SOURCES: { label: string; reason: string; searchUrl: (q: string) => string }[] = [
  { label: 'LinkedIn Jobs', reason: 'No public job-search API, and its terms forbid automated collection.', searchUrl: (q) => `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(q)}&location=Sri%20Lanka` },
  { label: 'TopJobs.lk', reason: 'Its robots rules block automated access, and it publishes no feed or API.', searchUrl: () => 'https://www.topjobs.lk/' },
  { label: 'Rooster Jobs', reason: 'Its terms ban scraping without written permission. Ask Rooster if you want this approved.', searchUrl: () => 'https://rooster.jobs/' },
  { label: 'XpressJobs', reason: 'No public feed or API found, and pages need a full browser to load.', searchUrl: () => 'https://xpress.jobs/' },
  { label: 'JobMasters.lk', reason: 'Permitted access could not be confirmed, so it is not searched.', searchUrl: () => 'https://jobmasters.lk/' },
  { label: 'Finders.lk', reason: 'Permitted access could not be confirmed, so it is not searched.', searchUrl: () => 'https://finders.lk/' },
  { label: 'Indeed', reason: 'Its public job-search API was withdrawn, and remaining APIs do not read listings.', searchUrl: (q) => `https://www.indeed.com/jobs?q=${encodeURIComponent(q)}&l=Sri+Lanka` },
  { label: 'Glassdoor', reason: 'No public job-search API is available.', searchUrl: (q) => `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${encodeURIComponent(q)}` },
];
