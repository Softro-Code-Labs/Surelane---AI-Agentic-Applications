import { describe, expect, it } from 'vitest';
import { UNAVAILABLE_SOURCES, parseRss } from '@/lib/sources/adapters';
import { careerPageSource, detectAts, parseEntry } from '@/lib/sources/career';
import { buildSources } from '@/lib/sources/registry';
import { checkPage, robotsAllow } from '@/lib/sources/http';
import type { SourceContext } from '@/lib/sources/types';
import { classify, rejectReason } from '@/lib/search/classify';

// Shapes below follow each provider's published docs and, for ITPro.lk, its live feed.
const ITPRO = `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel>
<title>ITPro.lk - Latest IT Jobs</title><link>https://itpro.lk/</link><ttl>30</ttl>
<item><title>Software Engineer – Associate / Intern at Alphintra</title><link>https://itpro.lk/job/15684/software-engineer-associate-intern-at-alphintra/</link>
<guid>https://itpro.lk/job/15684/software-engineer-associate-intern-at-alphintra/</guid><description>Location: Colombo</description>
<content:encoded><![CDATA[<strong>Company:</strong> Alphintra<br> <strong>Location:</strong> Colombo<br> <strong>Job Type:</strong> Full-time<br><br><p>Build React apps.</p>]]></content:encoded>
<pubDate>Wed, 04 Nov 2026 23:27:04 +0530</pubDate><dc:creator>Alphintra</dc:creator></item>
<item><title>Bad at Evil</title><link>javascript:alert(1)</link><guid>x</guid><description>x</description></item>
</channel></rss>`;

function ctx(routes: Record<string, (init?: RequestInit) => Response>, over: Partial<SourceContext> = {}): SourceContext {
  return {
    fetch: (async (url: string, init?: RequestInit) => {
      for (const [k, v] of Object.entries(routes)) if (String(url).startsWith(k)) return v(init);
      return new Response('', { status: 404 });
    }) as typeof fetch,
    sleep: async () => {}, now: new Date('2026-11-05T00:00:00Z'), keywords: ['software engineer'],
    settings: { local_enabled: true, global_enabled: false, custom_feeds: [] }, env: {}, robotsCache: new Map(), ...over,
  };
}
const json = (d: unknown, status = 200) => () => new Response(JSON.stringify(d), { status });
const by = (id: string) => buildSources({ custom_feeds: [] }).find((s) => s.id === id)!;

describe('source adapters', () => {
  it('reads the ITPro.lk feed and refuses javascript: links', () => {
    const jobs = parseRss(ITPRO, 'itpro', 'ITPro.lk');
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ title: 'Software Engineer – Associate / Intern', company: 'Alphintra', location: 'Colombo', employmentType: 'Full-time' });
    expect(jobs[0]!.postedAt?.toISOString()).toBe('2026-11-04T17:57:04.000Z');
    expect(jobs[0]!.description).toContain('Build React apps');
  });
  it('fetches ITPro.lk only when robots.txt allows it', async () => {
    const feed = { 'https://itpro.lk/rss': () => new Response(ITPRO) };
    expect(await by('itpro').search(ctx({ ...feed, 'https://itpro.lk/robots.txt': () => new Response('User-agent: *\nAllow: /') }))).toHaveLength(1);
    await expect(by('itpro').search(ctx({ ...feed, 'https://itpro.lk/robots.txt': () => new Response('User-agent: *\nDisallow: /rss/') }))).rejects.toThrow(/robots/);
  });
  it('reads Himalayas, including expiry and Sri Lanka eligibility', async () => {
    const exp = 1798000000;
    const c = ctx({ 'https://himalayas.app/jobs/api/search': json({ jobs: [
      { title: 'Backend Engineer', companyName: 'Example', minSalary: 100, maxSalary: 200, currency: 'USD', locationRestrictions: [{ alpha2: 'LK', name: 'Sri Lanka', slug: 'sri-lanka' }], description: '<p>Hi</p>', pubDate: 1797000000, expiryDate: exp, applicationLink: 'https://himalayas.app/companies/example/jobs/backend', guid: 'https://himalayas.app/companies/example/jobs/backend' },
      { title: 'US Only', companyName: 'Example', locationRestrictions: [{ alpha2: 'US', name: 'United States', slug: 'us' }], description: 'x', applicationLink: 'https://himalayas.app/companies/example/jobs/us', guid: 'https://himalayas.app/companies/example/jobs/us' },
    ] }) });
    const jobs = await by('himalayas').search(c);
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({ slEligibility: 'yes', workMode: 'remote', salary: 'USD 100-200' });
    expect(jobs[0]!.deadline?.getTime()).toBe(exp * 1000);
    expect(jobs[1]!.slEligibility).toBe('no');
  });
  it('uses Himalayas\' closed signal (410)', async () => {
    const c = ctx({ 'https://himalayas.app/jobs/api/companies/a/jobs/open': json({}), 'https://himalayas.app/jobs/api/companies/a/jobs/gone': json({}, 410) });
    const r = await by('himalayas').verify!([
      { id: 1, sourceJobId: 'https://himalayas.app/companies/a/jobs/open', url: '' },
      { id: 2, sourceJobId: 'https://himalayas.app/companies/a/jobs/gone', url: '' },
    ], c);
    expect(r.get(1)).toBe('active');
    expect(r.get(2)).toBe('closed');
  });
  it('reads Jobicy and treats unknown status as unconfirmed, not closed', async () => {
    const c = ctx({
      'https://jobicy.com/api/jobs/status': json({ jobs: [{ id: 1, status: 'active' }, { id: 2, status: 'closed' }, { id: 3, status: 'unknown' }] }),
      'https://jobicy.com/api/jobs': json({ jobs: [{ id: 1, url: 'https://jobicy.com/jobs/1', jobTitle: 'QA', companyName: 'X', jobGeo: 'Anywhere', jobType: ['full-time'], jobDescription: '<b>d</b>', pubDate: '2026-11-01T00:00:00+00:00' }] }),
    });
    expect((await by('jobicy').search(c))[0]).toMatchObject({ slEligibility: 'yes', employmentType: 'full-time' });
    const r = await by('jobicy').verify!([1, 2, 3].map((n) => ({ id: n, sourceJobId: String(n), url: '' })), c);
    expect([r.get(1), r.get(2), r.get(3)]).toEqual(['active', 'closed', 'unknown']);
  });
  it('reads Remotive and Remote OK, skipping Remote OK\'s legal notice row', async () => {
    const c = ctx({
      'https://remotive.com/api': json({ jobs: [{ id: 9, url: 'https://remotive.com/remote-jobs/9', title: 'Dev', company_name: 'R', job_type: 'full_time', publication_date: '2026-11-01T10:00:00', candidate_required_location: 'Worldwide', description: '<p>x</p>' }] }),
      'https://remoteok.com/api': json([{ legal: 'link back' }, { id: 3, position: 'Dev', company: 'O', location: 'USA', url: 'https://remoteok.com/remote-jobs/3', date: '2026-11-01T00:00:00+00:00', description: 'x' }]),
    });
    expect((await by('remotive').search(c))[0]).toMatchObject({ slEligibility: 'yes', employmentType: 'full time' });
    const ok = await by('remoteok').search(c);
    expect(ok).toHaveLength(1);
    expect(ok[0]!.slEligibility).toBe('unknown');
  });
  it('reads company boards from all six hiring systems', async () => {
    const pages = ['lever:aleph', 'greenhouse:acme', 'ashby:acme', 'smartrecruiters:Acme', 'workable:acme', 'recruitee:acme'].map((e, i) => ({ id: String(i), default_location: 'Sri Lanka', ...parseEntry(e)! }));
    const c = ctx({
      'https://api.lever.co/v0/postings/aleph': json([{ id: 'l1', text: 'Client Solutions Manager', categories: { location: 'Colombo, Sri Lanka', commitment: 'Full-time', team: 'Sales' }, workplaceType: 'on-site', hostedUrl: 'https://jobs.lever.co/aleph/l1', createdAt: 1797000000000, descriptionPlain: 'Desc' }]),
      'https://boards-api.greenhouse.io/v1/boards/acme': json({ jobs: [{ id: 5, title: 'Dev', location: { name: 'Remote' }, absolute_url: 'https://boards.greenhouse.io/acme/5', first_published: '2026-11-01T00:00:00-04:00', content: '&lt;p&gt;Hello &amp;amp; welcome&lt;/p&gt;' }] }),
      'https://api.ashbyhq.com/posting-api/job-board/acme': json({ jobs: [{ id: 'a', title: 'Dev', location: 'Colombo', isRemote: false, workplaceType: 'Hybrid', employmentType: 'FullTime', publishedAt: '2026-11-01T00:00:00Z', jobUrl: 'https://jobs.ashbyhq.com/acme/a', descriptionPlain: 'x' }] }),
      'https://api.smartrecruiters.com/v1/companies/Acme/postings': json({ content: [{ id: 's', name: 'Dev', company: { name: 'Acme' }, location: { city: 'Colombo', country: 'lk' }, releasedDate: '2026-11-01T00:00:00Z' }] }),
      'https://apply.workable.com/api/v1/widget/accounts/acme': json({ name: 'Acme', jobs: [{ title: 'Dev', shortcode: 'W1', url: 'https://apply.workable.com/j/W1', location: { location_str: 'Colombo, Sri Lanka', telecommuting: false }, published_on: '2026-11-01', full_description: '<p>x</p>' }] }),
      'https://acme.recruitee.com/api/offers': json({ offers: [{ id: 7, title: 'Dev', careers_url: 'https://acme.recruitee.com/o/dev', location: 'Colombo', hybrid: true, close_at: '2026-12-01T00:00:00Z', description: '<p>x</p>' }] }),
    });
    const run = (i: number) => careerPageSource(pages[i]!).search(c);
    expect((await run(0))[0]).toMatchObject({ company: 'Aleph', location: 'Colombo, Sri Lanka', workMode: 'onsite' });
    expect((await run(1))[0]!.description).toBe('Hello & welcome');
    expect((await run(2))[0]!.workMode).toBe('hybrid');
    expect((await run(3))[0]!.location).toBe('Colombo, Sri Lanka');
    expect((await run(4))[0]!.url).toBe('https://apply.workable.com/j/W1');
    expect((await run(5))[0]!.deadline?.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(detectAts('https://jobs.lever.co/../etc')).toBeNull();
    expect(parseEntry('lever:../../etc')).toBeNull();
  });
  it('needs a key before calling Jooble', () => {
    expect(by('jooble').missingConfig!(ctx({}))).toMatch(/JOOBLE_API_KEY/);
    expect(by('jooble').missingConfig!(ctx({}, { env: { JOOBLE_API_KEY: 'k' } }))).toBeNull();
  });
  it('never configures an adapter for the unavailable platforms', () => {
    const ids = buildSources({ custom_feeds: [] }).map((s) => s.label.toLowerCase());
    for (const u of UNAVAILABLE_SOURCES) expect(ids.join()).not.toContain(u.label.toLowerCase().replace(/ jobs$/, ''));
    expect(UNAVAILABLE_SOURCES.map((u) => u.label)).toEqual(expect.arrayContaining(['LinkedIn Jobs', 'TopJobs.lk', 'Rooster Jobs', 'JobMasters.lk', 'Finders.lk', 'Indeed', 'Glassdoor']));
  });
});

describe('page checks and robots', () => {
  it('treats 404, 410 and closing wording as closed', async () => {
    const c = ctx({
      'https://a.test/robots.txt': () => new Response('', { status: 404 }),
      'https://a.test/gone': () => new Response('', { status: 410 }),
      'https://a.test/closed': () => new Response('<h1>Applications are now closed</h1>'),
      'https://a.test/open': () => new Response('<h1>Apply now</h1>'),
    });
    expect(await checkPage(c, 'https://a.test/gone')).toBe('closed');
    expect(await checkPage(c, 'https://a.test/closed')).toBe('closed');
    expect(await checkPage(c, 'https://a.test/open')).toBe('active');
  });
  it('does not fetch pages that robots.txt disallows, and reports unknown', async () => {
    let hit = false;
    const c = ctx({ 'https://b.test/robots.txt': () => new Response('User-agent: *\nDisallow: /'), 'https://b.test/job': () => { hit = true; return new Response('x'); } });
    expect(await checkPage(c, 'https://b.test/job')).toBe('unknown');
    expect(hit).toBe(false);
  });
  it('fetches nothing when robots.txt cannot be read, and reports that truthfully', async () => {
    await expect(robotsAllow(ctx({ 'https://c.test/robots.txt': () => new Response('', { status: 503 }) }), 'https://c.test/x')).rejects.toThrow(/could not be read/);
    const down = ctx({}, { fetch: (async () => { throw new Error('network down'); }) as any });
    await expect(by('itpro').search(down)).rejects.toThrow(/could not be read/);
    expect(await checkPage(down, 'https://c.test/x')).toBe('unknown');
  });
});

describe('expired and scope filtering', () => {
  const now = new Date('2026-11-05T00:00:00Z');
  const base = { source: 's', sourceLabel: 's', url: 'https://x.test', title: 'Dev', company: 'A', location: 'Colombo', description: 'Good job', postedAt: new Date('2026-11-01') };
  const s = { local_enabled: true, global_enabled: false, max_post_age_days: 30, remote_pref: 'any', preferred_countries: [] };
  const reject = (j: any, settings = s) => { const c = classify({ ...base, ...j }); return rejectReason({ ...base, ...j }, c.market, c.workMode, c.slEligibility, settings, now); };

  it('accepts a live local job', () => expect(reject({})).toBeNull());
  it('excludes passed deadlines', () => expect(reject({ deadline: new Date('2026-11-04') })?.kind).toBe('expired'));
  it('excludes closed wording', () => expect(reject({ description: 'This position has been filled.' })?.kind).toBe('closed'));
  it('excludes outdated listings', () => expect(reject({ postedAt: new Date('2026-09-01') })?.kind).toBe('outdated'));
  it('keeps an old post whose deadline is still ahead', () => expect(reject({ postedAt: new Date('2026-09-01'), deadline: new Date('2026-12-01') })).toBeNull());
  it('Local and Global each let in only their own jobs', () => {
    const local = {}, berlin = { location: 'Berlin, Germany' }, remote = { location: 'Worldwide', workMode: 'remote', slEligibility: 'yes' };
    const kinds = (settings: typeof s) => [local, berlin, remote].map((j) => reject(j, settings)?.kind ?? 'kept');
    expect(kinds({ ...s, local_enabled: true, global_enabled: false })).toEqual(['kept', 'scope', 'scope']);
    expect(kinds({ ...s, local_enabled: false, global_enabled: true })).toEqual(['scope', 'kept', 'kept']);
    expect(kinds({ ...s, local_enabled: true, global_enabled: true })).toEqual(['kept', 'kept', 'kept']);
    expect(kinds({ ...s, local_enabled: false, global_enabled: false })).toEqual(['scope', 'scope', 'scope']);
    expect(reject({ location: 'Remote, USA', workMode: 'remote', slEligibility: 'no' })?.reason).toMatch(/Global job opportunities are off/);
  });
  it('Global ON allows and labels international jobs', () => {
    expect(reject({ location: 'Berlin, Germany' }, { ...s, global_enabled: true })).toBeNull();
    expect(classify({ ...base, location: 'Berlin, Germany' })).toMatchObject({ market: 'international', country: 'Germany' });
    expect(classify({ ...base, location: 'Worldwide', workMode: 'remote', slEligibility: 'yes' }).market).toBe('remote_lk');
    expect(classify(base).market).toBe('sri_lanka');
  });
  it('applies remote preference', () => {
    expect(reject({ workMode: 'onsite' }, { ...s, remote_pref: 'remote' })?.kind).toBe('preference');
  });
});
