import { beforeEach, describe, expect, it } from 'vitest';
import { one, q } from '@/lib/db';
import { runCleanup } from '@/lib/cleanup';
import { assertPublic, careerPageSource, detectAts, embeddedAts, inlineJobs, inspectCareerPage, jobLinks, jsonLdPostings, parseEntry } from '@/lib/sources/career';
import { buildSources } from '@/lib/sources/registry';
import { tick } from '@/worker/tick';
import type { SourceContext } from '@/lib/sources/types';
import { resetDb, withCv } from './helpers';

type Route = (init?: RequestInit) => Response;
const html = (body: string, status = 200) => () => new Response(body, { status, headers: { 'content-type': 'text/html' } });
const robotsOk = () => new Response('User-agent: *\nAllow: /');
const page = { id: '1', company: 'Acme Lanka', url: 'https://acme.lk/careers', default_location: 'Sri Lanka' };

function ctx(routes: Record<string, Route>, over: Partial<SourceContext> = {}): SourceContext & { hits: string[] } {
  const hits: string[] = [];
  return {
    hits,
    fetch: (async (url: string, init?: RequestInit) => {
      hits.push(String(url));
      const key = Object.keys(routes).filter((k) => String(url).startsWith(k)).sort((a, b) => b.length - a.length)[0];
      return key ? routes[key]!(init) : new Response('', { status: 404 });
    }) as typeof fetch,
    sleep: async () => {}, now: new Date('2026-11-05T00:00:00Z'), keywords: [], settings: { global_enabled: false, custom_feeds: [] }, env: {},
    robotsCache: new Map(), resolveHost: async () => ['93.184.216.34'], ...over,
  };
}
const site = (routes: Record<string, Route>) => ({ 'https://acme.lk/robots.txt': robotsOk, ...routes });

describe('reading a link people paste', () => {
  it('understands every accepted format', () => {
    expect(parseEntry('https://acme.lk/careers')).toEqual({ company: 'Acme', url: 'https://acme.lk/careers' });
    expect(parseEntry('Dialog Axiata, https://www.dialog.lk/careers')).toEqual({ company: 'Dialog Axiata', url: 'https://www.dialog.lk/careers' });
    expect(parseEntry('www.hayleys.com/careers')?.url).toBe('https://www.hayleys.com/careers');
    expect(parseEntry('lever:aleph')).toEqual({ company: 'Aleph', url: 'https://jobs.lever.co/aleph' });
    expect(parseEntry('https://jobs.lever.co/aleph/')?.company).toBe('Aleph');
    expect(parseEntry('javascript:alert(1)')).toBeNull();
    expect(parseEntry('not a link')).toBeNull();
  });
  it('recognises hiring-system links', () => {
    expect(detectAts('https://job-boards.greenhouse.io/acme')).toEqual({ provider: 'greenhouse', slug: 'acme' });
    expect(detectAts('https://boards.greenhouse.io/embed/job_board?for=acme')).toEqual({ provider: 'greenhouse', slug: 'acme' });
    expect(detectAts('https://apply.workable.com/acme/')).toEqual({ provider: 'workable', slug: 'acme' });
    expect(detectAts('https://acme.recruitee.com/o/dev')).toEqual({ provider: 'recruitee', slug: 'acme' });
    expect(detectAts('https://acme.lk/careers')).toBeNull();
  });
});

describe('a company that does not allow it', () => {
  it('robots.txt refusal: shows the message and never opens the page', async () => {
    const c = ctx({ 'https://acme.lk/robots.txt': () => new Response('User-agent: *\nDisallow: /careers'), 'https://acme.lk/careers': html('<h2>Software Engineer</h2>') });
    const o = await inspectCareerPage(page, c);
    expect(o.status).toBe('not_allowed');
    expect(o.message).toBe('Acme Lanka does not allow automated search of this page. Its robots.txt rules say no, so the agent will not read it.');
    expect(c.hits).toEqual(['https://acme.lk/robots.txt']);
  });
  it('honours a rule aimed at this agent, even if others are allowed', async () => {
    const c = ctx({ 'https://acme.lk/robots.txt': () => new Response('User-agent: *\nAllow: /\n\nUser-agent: Surelane\nDisallow: /'), 'https://acme.lk/careers': html('x') });
    expect((await inspectCareerPage(page, c)).status).toBe('not_allowed');
  });
  it('a wildcard block counts too', async () => {
    const c = ctx({ 'https://acme.lk/robots.txt': () => new Response('User-agent: *\nDisallow: /') });
    expect((await inspectCareerPage(page, c)).status).toBe('not_allowed');
  });
  it('HTTP 403 and 401 are shown as not allowed, and not retried around', async () => {
    for (const status of [401, 403]) {
      const c = ctx(site({ 'https://acme.lk/careers': html('nope', status) }));
      const o = await inspectCareerPage(page, c);
      expect(o.status).toBe('not_allowed');
      expect(o.message).toContain(`HTTP ${status}`);
      expect(c.hits.filter((h) => h.endsWith('/careers'))).toHaveLength(1);
    }
  });
  it('anti-bot checks are shown as not allowed', async () => {
    for (const [body, status] of [['<title>Just a moment...</title>', 503], ['<h1>Please complete the CAPTCHA</h1>', 200]] as const) {
      const o = await inspectCareerPage(page, ctx(site({ 'https://acme.lk/careers': html(body, status) })));
      expect(o.status).toBe('not_allowed');
      expect(o.message).toContain('anti-bot');
    }
  });
  it('a sign-in page is not entered', async () => {
    const o = await inspectCareerPage(page, ctx(site({ 'https://acme.lk/careers': html('<body><form><input type="password"></form></body>') })));
    expect(o.status).toBe('not_allowed');
    expect(o.message).toContain('sign-in');
  });
  it('a blocked redirect target is refused as well', async () => {
    const c = ctx({
      'https://acme.lk/robots.txt': robotsOk, 'https://acme.lk/careers': () => new Response(null, { status: 302, headers: { location: 'https://jobs.other.com/x' } }),
      'https://jobs.other.com/robots.txt': () => new Response('User-agent: *\nDisallow: /'), 'https://jobs.other.com/x': html('secret'),
    });
    expect((await inspectCareerPage(page, c)).status).toBe('not_allowed');
    expect(c.hits).not.toContain('https://jobs.other.com/x');
  });
  it('job pages disallowed individually are not opened, while the listing still counts', async () => {
    const c = ctx({
      'https://acme.lk/robots.txt': () => new Response('User-agent: *\nDisallow: /careers/jobs/'),
      'https://acme.lk/careers': html('<main><a href="/careers/jobs/1">Software Engineer</a></main>'), 'https://acme.lk/careers/jobs/1': html('secret'),
    });
    const o = await inspectCareerPage(page, c);
    expect(o.jobs).toHaveLength(1);
    expect(o.jobs[0]!.description).toBe('');
    expect(c.hits).not.toContain('https://acme.lk/careers/jobs/1');
  });
  it('an unreachable robots file is an error, never reported as a refusal', async () => {
    const o = await inspectCareerPage(page, ctx({ 'https://acme.lk/robots.txt': () => new Response('', { status: 503 }) }));
    expect(o.status).toBe('error');
    expect(o.message).toContain('could not be read');
  });
});

describe('safety', () => {
  it('refuses private addresses, even behind a public name or a redirect', async () => {
    for (const ip of ['127.0.0.1', '10.0.0.5', '192.168.1.1', '172.16.0.1', '169.254.169.254', '100.64.0.1', '::1', 'fd00::1']) {
      await expect(assertPublic('https://evil.example/', { resolveHost: async () => [ip] }), ip).rejects.toThrow(/Private/);
    }
    await expect(assertPublic('http://localhost:3000/', {})).rejects.toThrow(/Private/);
    const c = ctx({ 'https://acme.lk/robots.txt': robotsOk, 'https://acme.lk/careers': () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest' } }) },
      { resolveHost: async (h) => (h === 'acme.lk' ? ['93.184.216.34'] : [h]) });
    expect((await inspectCareerPage(page, c)).status).toBe('error');
    expect(c.hits.some((h) => h.includes('169.254'))).toBe(false);
  });
});

describe('reading company pages', () => {
  const jsonld = `<html><head><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite"},{"@type":"JobPosting","title":"Senior Software Engineer","description":"<p>Build things</p>","datePosted":"2026-11-01","validThrough":"2026-12-01T00:00","employmentType":["FULL_TIME"],"hiringOrganization":{"name":"Acme"},"jobLocation":{"@type":"Place","address":{"addressLocality":"Colombo","addressCountry":"LK"}},"url":"/careers/1","baseSalary":{"currency":"LKR","value":{"minValue":100,"maxValue":200,"unitText":"MONTH"}}}]}</script><script type="application/ld+json">{broken</script></head><body></body></html>`;

  it('prefers structured job data, with deadline and location', async () => {
    const o = await inspectCareerPage(page, ctx(site({ 'https://acme.lk/careers': html(jsonld) })));
    expect(o.status).toBe('ok');
    expect(o.jobs[0]).toMatchObject({ title: 'Senior Software Engineer', company: 'Acme Lanka', location: 'Colombo, Sri Lanka', country: 'Sri Lanka', employmentType: 'full time', salary: 'LKR 100-200', url: 'https://acme.lk/careers/1', description: 'Build things' });
    expect(o.jobs[0]!.deadline?.toISOString()).toBe('2026-12-01T18:29:59.000Z'); // end of 1 Dec, Colombo
    expect(jsonLdPostings('<script type="application/ld+json">[{"@type":["JobPosting"],"title":"X"}]</script>')).toHaveLength(1);
  });
  it('reads remote eligibility from structured data', async () => {
    const remote = `<script type="application/ld+json">{"@type":"JobPosting","title":"QA Engineer","jobLocationType":"TELECOMMUTE","applicantLocationRequirements":{"@type":"Country","name":"Sri Lanka"},"description":"x"}</script>`;
    expect((await inspectCareerPage(page, ctx(site({ 'https://acme.lk/careers': html(remote) })))).jobs[0]).toMatchObject({ workMode: 'remote', slEligibility: 'yes' });
  });
  it('switches to the public API when a page embeds a hiring system', async () => {
    expect(embeddedAts('<iframe src="https://boards.greenhouse.io/embed/job_board?for=acme"></iframe>')).toEqual({ provider: 'greenhouse', slug: 'acme' });
    const c = ctx(site({
      'https://acme.lk/careers': html('<a href="https://jobs.lever.co/acme">See jobs</a>'),
      'https://api.lever.co/v0/postings/acme': () => new Response(JSON.stringify([{ id: '1', text: 'Backend Developer', categories: {}, hostedUrl: 'https://jobs.lever.co/acme/1', descriptionPlain: 'x' }])),
    }));
    const o = await inspectCareerPage(page, c);
    expect(o.jobs[0]).toMatchObject({ title: 'Backend Developer', company: 'Acme Lanka', location: 'Sri Lanka (assumed)', country: 'Sri Lanka' });
  });
  it('follows job links on a plain page, ignoring navigation and marketing', async () => {
    const list = `<header><a href="/careers/manager">Marketing Manager</a></header><main>
      <h1>Join our team</h1><ul>
      <li><a href="/careers/se">Software Engineer</a></li>
      <li><h3>Accountant</h3><a href="/careers/acc">Read more</a></li>
      <li><a href="/about">About our company</a></li><li><a href="https://other.com/x">Sales Executive</a></li></ul></main><footer><a href="/privacy">Privacy</a></footer>`;
    expect(jobLinks(list, 'https://acme.lk/careers').links.map((l) => l.title)).toEqual(['Software Engineer', 'Accountant']);
    const c = ctx(site({
      'https://acme.lk/careers/se': html('<main><h1>Software Engineer</h1><p>Requirements</p><ul><li>React</li></ul><p>Closing date: 30 November 2026</p></main>'),
      'https://acme.lk/careers/acc': html('<main><h1>Accountant</h1></main>'), 'https://acme.lk/careers': html(list),
    }));
    const o = await inspectCareerPage(page, c);
    expect(o.status).toBe('ok');
    expect(o.jobs[0]).toMatchObject({ title: 'Software Engineer', location: 'Sri Lanka (assumed)', company: 'Acme Lanka' });
    expect(o.jobs[0]!.description).toContain('React');
    expect(o.jobs[0]!.deadline?.toISOString()).toBe('2026-11-30T18:29:59.000Z');
  });
  it('reads a page that lists every vacancy inline', () => {
    const list = '<main><h2>Current vacancies</h2><h3>Quality Controller</h3><p>Apply by email.</p><h3>Accounts Executive</h3><p>CIMA required.</p></main>';
    expect(inlineJobs(list, 'https://acme.lk/careers')).toEqual([{ title: 'Quality Controller', description: 'Apply by email.' }, { title: 'Accounts Executive', description: 'CIMA required.' }]);
  });
  it('explains pages it cannot read, instead of reporting zero jobs', async () => {
    const check = async (body: string) => inspectCareerPage(page, ctx(site({ 'https://acme.lk/careers': html(body) })));
    expect((await check('<body><div id="root"></div><script src="/app.js"></script></body>')).status).toBe('needs_browser');
    const pdf = await check('<main><a href="/v/role.pdf">Vacancy notice</a></main>');
    expect(pdf.status).toBe('needs_browser');
    expect(pdf.message).toContain('PDF');
    expect((await check(`<main>${'We value people and teamwork in everything that we do here. '.repeat(30)}</main>`)).status).toBe('no_jobs');
  });
  it('reports a dead link clearly', async () => {
    const o = await inspectCareerPage(page, ctx(site({})));
    expect(o).toMatchObject({ status: 'error', message: 'This link no longer exists. Check the address.' });
  });
  it('stops opening job pages at the per-run limit', async () => {
    const list = `<main>${Array.from({ length: 6 }, (_, i) => `<a href="/careers/${i}">Software Engineer ${i}</a>`).join('')}</main>`;
    const c = ctx(site({ 'https://acme.lk/careers': html(list) }), { detailBudget: { left: 2 } });
    const o = await inspectCareerPage(page, c);
    expect(o.jobs).toHaveLength(6);
    expect(c.hits.filter((h) => /careers\/\d/.test(h))).toHaveLength(2);
  });
});

describe('career pages in a scheduled search', () => {
  const at8 = () => new Date('2026-11-04T02:31:00Z');
  const listing = '<main><h1>Careers</h1><a href="/careers/se">Senior Software Engineer</a></main>';
  const detail = '<main><h1>Senior Software Engineer</h1><p>Build payment products.</p><h2>Requirements</h2><ul><li>React, TypeScript and Node.js</li><li>PostgreSQL, AWS and Docker</li></ul></main>';
  const deps = (fetchFn: typeof fetch, now = at8) => ({ sources: undefined, fetch: fetchFn, provider: null, env: {}, now, sleep: async () => {}, log: () => {}, resolveHost: async () => ['93.184.216.34'] });
  const route = (routes: Record<string, Route>): typeof fetch => (async (url: string) => {
    const key = Object.keys(routes).filter((k) => String(url).startsWith(k)).sort((a, b) => b.length - a.length)[0];
    return key ? routes[key]!() : new Response('', { status: 404 });
  }) as typeof fetch;
  const add = (company: string, url: string) => q(`INSERT INTO career_pages (company, url) VALUES ($1,$2)`, [company, url]);

  beforeEach(resetDb);

  it('searches listed companies at search time and recommends their jobs', async () => {
    await withCv();
    await add('Acme Lanka', 'https://acme.lk/careers');
    await tick(deps(route(site({ 'https://acme.lk/careers/se': html(detail), 'https://acme.lk/careers': html(listing) }))));
    const job = await one(`SELECT j.title, j.company, j.market, j.status, j.source_label, j.verify_method FROM jobs j`);
    expect(job).toEqual({ title: 'Senior Software Engineer', company: 'Acme Lanka', market: 'sri_lanka', status: 'active', source_label: 'Acme Lanka careers', verify_method: 'employer_board' });
    expect(await one(`SELECT last_status, last_found FROM career_pages`)).toEqual({ last_status: 'ok', last_found: 1 });
    expect(await one(`SELECT status, jobs_found FROM search_run_sources WHERE label='Acme Lanka careers'`)).toEqual({ status: 'success', jobs_found: 1 });
  });

  it('a refusing company shows as not allowed, is logged as skipped, and is not a failed search', async () => {
    await withCv();
    await add('Closed Co', 'https://closed.lk/careers');
    await add('Acme Lanka', 'https://acme.lk/careers');
    let read = false;
    const f = route(site({
      'https://closed.lk/robots.txt': () => new Response('User-agent: *\nDisallow: /'), 'https://closed.lk/careers': () => { read = true; return new Response(''); },
      'https://acme.lk/careers/se': html(detail), 'https://acme.lk/careers': html(listing),
    }));
    await tick(deps(f));
    expect(read).toBe(false);
    expect(await one(`SELECT last_status, last_message FROM career_pages WHERE company='Closed Co'`)).toMatchObject({ last_status: 'not_allowed', last_message: expect.stringContaining('does not allow automated search') });
    expect(await one(`SELECT status FROM search_run_sources WHERE label='Closed Co careers'`)).toEqual({ status: 'skipped' });
    const run = await one(`SELECT errors FROM search_runs`);
    expect(JSON.stringify(run.errors)).not.toContain('Closed Co');
  });

  it('a switched-off company is not searched', async () => {
    await withCv();
    await q(`INSERT INTO career_pages (company, url, enabled) VALUES ('Off Co','https://off.lk/careers',false)`);
    let hit = false;
    await tick(deps((async (u: string) => { if (String(u).includes('off.lk')) hit = true; return new Response('', { status: 404 }); }) as typeof fetch));
    expect(hit).toBe(false);
  });

  it('opens each job page once, and still keeps the job current on later searches', async () => {
    await withCv();
    await add('Acme Lanka', 'https://acme.lk/careers');
    let opened = 0;
    const f = route(site({ 'https://acme.lk/careers/se': () => { opened++; return html(detail)(); }, 'https://acme.lk/careers': html(listing) }));
    await tick(deps(f));
    await q(`UPDATE jobs SET last_seen_at = '2026-11-01'`);
    await tick(deps(f, () => new Date('2026-11-04T07:01:00Z')));
    expect(opened).toBe(1);
    expect((await one(`SELECT last_seen_at FROM jobs`)).last_seen_at.toISOString()).toBe('2026-11-04T07:01:00.000Z');
    expect((await one(`SELECT count(*)::int c FROM jobs`)).c).toBe(1);
  });

  it('closes a job that leaves the page, but a broken or empty read closes nothing', async () => {
    await withCv();
    await add('Acme Lanka', 'https://acme.lk/careers');
    await tick(deps(route(site({ 'https://acme.lk/careers/se': html(detail), 'https://acme.lk/careers': html(listing) }))));
    await tick(deps(route(site({ 'https://acme.lk/careers': html('<body><div id="root"></div></body>') })), () => new Date('2026-11-04T07:01:00Z')));
    expect(await one(`SELECT status FROM jobs`)).toEqual({ status: 'active' });
    await tick(deps(route(site({ 'https://acme.lk/careers': html('<main><a href="/careers/x">Data Analyst</a></main>') })), () => new Date('2026-11-04T11:31:00Z')));
    expect(await one(`SELECT status FROM jobs WHERE title='Senior Software Engineer'`)).toEqual({ status: 'closed' });
  });

  it('keeps your list out of the 30-day cleanup', async () => {
    await q(`INSERT INTO career_pages (company, url, created_at) VALUES ('Old Co','https://old.lk',now() - interval '400 days')`);
    await runCleanup(new Date());
    expect((await one(`SELECT count(*)::int c FROM career_pages`)).c).toBe(1);
  });

  it('moves boards from older installs across exactly once', async () => {
    const { pool } = await import('@/lib/db');
    const { readFileSync } = await import('node:fs');
    await pool().query(`ALTER TABLE settings ADD COLUMN company_boards text[] NOT NULL DEFAULT '{}'`);
    await pool().query(`UPDATE settings SET company_boards='{lever:aleph,greenhouse:acme}'`);
    await pool().query(readFileSync('db/schema.sql', 'utf8'));
    expect((await q(`SELECT url FROM career_pages ORDER BY url`)).map((r) => r.url)).toEqual(['https://boards.greenhouse.io/acme', 'https://jobs.lever.co/aleph']);
    await q(`DELETE FROM career_pages`);
    await pool().query(readFileSync('db/schema.sql', 'utf8'));
    expect(await q(`SELECT 1 FROM career_pages`)).toHaveLength(0);
  });

  it('builds one source per listed page', () => {
    expect(buildSources({ custom_feeds: [] }, [page]).map((s) => s.id)).toContain('page:1');
    expect(careerPageSource(page).completeListing).toBe(true);
  });
});
