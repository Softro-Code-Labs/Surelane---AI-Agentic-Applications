import { describe, expect, it } from 'vitest';
import { parseGovhub, parseJobify, parseObserver, parseReliefweb, parseVacancyFeed, parseWwr } from '@/lib/sources/adapters';
import { buildSources } from '@/lib/sources/registry';
import { SourceError, type SourceContext } from '@/lib/sources/types';

// Shapes below follow each site's live pages, as read in November 2026.
const observerData = {
  component: 'main/Vacancy',
  props: {
    results: {
      current_page: 1, per_page: 15,
      data: [
        {
          id: 645, title: 'Management Accountant', slug: 'management-accountant', has_notice: true,
          company: { name: 'Global Transportation and Logistics Pvt Ltd', is_name_withheld: false, industry: 'Logistics, Imports &amp; Exports' },
          deadline: 'November 16, 2026', categories: [{ id: 90, name: 'Accounting / Auditing / Finance' }], salary: '0', negotiable: true,
          contact_person: 'Group Head Of HR', contact_email: 'careers@example.lk', location: 'Seeduwa', location_more: '',
          years_experience: '7 to 10 years', minimum_qualification: 'Higher Diploma', type: 'Full time', description: '', created_at: 'Nov 10, 2026',
          company_contact: { contact_number: '0770000000' },
        },
        { id: 646, title: 'Hidden Employer Role', slug: 'hidden', company: { name: 'Secret Co', is_name_withheld: true }, categories: [], deadline: '', created_at: '' },
      ],
    },
  },
};
const attr = (o: unknown) => JSON.stringify(o).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const OBSERVER = `<!DOCTYPE html><html><body><div id="app" data-page="${attr(observerData)}"></div></body></html>`;

const govCard = (href: string, title: string, local: string, employer: string, closing: string) => `
  <div class="p-5 rounded-2xl border bg-white">
    <div class="space-y-1.5 flex-grow">
      <div class="flex"><span class="px-2">Government Companies</span></div>
      <h3 class="text-base"><a href="${href}">${title}</a></h3>
      <h4 class="text-sm"><a href="${href}">${local}</a></h4>
      <p class="text-xs">🏢 <a href="institute-jobs.php?id=307">${employer}</a></p>
      <div class="flex"><span>Source: www.airport.lk</span> <span class="text-rose-600">Closing: ${closing}</span> <span>👁️ 41</span></div>
    </div>
    <div><a href="${href}?lang=en">Details (English)</a></div>
  </div>`;
const GOVHUB = `<html><body><h2>All Career Opportunities (2)</h2><div class="space-y-4">
  ${govCard('/government-companies/draftsman-2787', 'Draftsman', 'සැලසුම් ශිල්පී', 'Airport and Aviation Services (Sri Lanka) Ltd', '2026-11-27')}
  ${govCard('/university/lecturer-in-physics-2790', 'Lecturer in Physics', 'කථිකාචාර්ය', 'University of Kelaniya', '2026-12-05')}
  <h3><a href="/about">About GovHub</a></h3>
</div></body></html>`;

const jobifyCard = (id: string, title: string, company: string, tags: string[]) => `
  <div class="card card-hover group relative flex">
    <div class="flex"><span aria-hidden="true">${company[0]}</span><div><h3><a href="/jobs/r/${id}">${title}</a></h3><p>${company}</p></div></div>
    <div>${tags.map((t) => `<span>${t}</span>`).join('')}</div>
    <a href="/jobs/r/${id}">Apply</a><a href="/resume?job=${id}">Tailor my CV</a>
  </div>`;
const JOBIFY = `<html><body><main>
  ${jobifyCard('2d397b518a9d6c9f', 'Senior Performance Marketing Manager', 'D2B', ['Asia Only', 'Full-time', 'Sales &amp; Marketing', 'Posted 13 Nov'])}
  ${jobifyCard('aa11', 'Legal Expert (Employment Law)', 'micro1', ['Worldwide', 'Contract', 'USD 80–130 / hour'])}
  ${jobifyCard('bb22', 'Year End Role', 'Example', ['Anywhere', 'Full-time', 'IT &amp; Software', 'Posted 20 Dec'])}
</main></body></html>`;

function ctx(routes: Record<string, string | number>, asked: string[] = [], over: Partial<SourceContext> = {}): SourceContext {
  return {
    fetch: (async (url: string) => {
      asked.push(String(url));
      const path = String(url);
      if (path.endsWith('/robots.txt')) return new Response(String(routes.robots ?? ''), { status: routes.robots === undefined ? 404 : 200 });
      for (const [k, v] of Object.entries(routes)) if (k !== 'robots' && path.startsWith(k)) return typeof v === 'number' ? new Response('', { status: v }) : new Response(v, { headers: { 'Content-Type': v.trimStart().startsWith('<?xml') ? 'application/rss+xml' : 'text/html; charset=utf-8' } });
      return new Response('', { status: 404 });
    }) as typeof fetch,
    sleep: async () => {}, now: new Date('2026-11-13T12:00:00Z'), keywords: ['accountant'],
    settings: { local_enabled: true, global_enabled: true, custom_feeds: [] }, env: {}, robotsCache: new Map(), resolveHost: async () => ['93.184.216.34'], ...over,
  };
}
const by = (id: string) => buildSources({ custom_feeds: [] }).find((s) => s.id === id)!;

describe('Observer Jobs', () => {
  it('reads the vacancy data embedded in its page, without contact details', () => {
    const [job, hidden] = parseObserver(OBSERVER);
    expect(job).toMatchObject({
      source: 'observerjobs', sourceJobId: '645', url: 'https://observerjobs.lk/vacancy/645/management-accountant',
      title: 'Management Accountant', company: 'Global Transportation and Logistics Pvt Ltd', location: 'Seeduwa', country: 'Sri Lanka',
      employmentType: 'Full time', category: 'Accounting / Auditing / Finance', salary: 'Negotiable',
    });
    expect(job!.deadline?.toISOString()).toBe('2026-11-16T18:29:59.000Z');
    expect(job!.description).toContain('Experience: 7 to 10 years');
    expect(job!.description).toContain('Industry: Logistics, Imports & Exports');
    expect(job!.description).not.toMatch(/careers@example|0770000000|Head Of HR/);
    expect(hidden!.company).toBe('Not stated');
  });

  it('searches the newest jobs and each top keyword', async () => {
    const asked: string[] = [];
    const jobs = await by('observerjobs').search(ctx({ robots: 'User-agent: *\nDisallow:', 'https://observerjobs.lk/vacancies': OBSERVER }, asked, { keywords: ['accountant', 'hr'] }));
    expect(asked.filter((u) => !u.endsWith('robots.txt'))).toEqual([
      'https://observerjobs.lk/vacancies', 'https://observerjobs.lk/vacancies?keyword=accountant', 'https://observerjobs.lk/vacancies?keyword=hr',
    ]);
    expect(jobs).toHaveLength(2);
  });

  it('fails clearly when the page no longer carries its data', () => {
    expect(() => parseObserver('<html><body>Maintenance</body></html>')).toThrow(SourceError);
  });

  it('respects robots rules', async () => {
    await expect(by('observerjobs').search(ctx({ robots: 'User-agent: *\nDisallow: /', 'https://observerjobs.lk/vacancies': OBSERVER }))).rejects.toThrow(/robots\.txt/);
  });
});

describe('GovHub Jobs', () => {
  it('reads every vacancy card, with employer and closing date, and ignores other links', () => {
    const jobs = parseGovhub(GOVHUB);
    expect(jobs.map((j) => j.url)).toEqual([
      'https://jobs.govhub.lk/government-companies/draftsman-2787?lang=en', 'https://jobs.govhub.lk/university/lecturer-in-physics-2790?lang=en',
    ]);
    expect(jobs[0]).toMatchObject({ source: 'govhub', sourceJobId: '2787', title: 'Draftsman', company: 'Airport and Aviation Services (Sri Lanka) Ltd', category: 'Government', workMode: 'onsite' });
    expect(jobs[0]!.deadline?.toISOString()).toBe('2026-11-27T18:29:59.000Z');
    expect(jobs[0]!.description).toContain('Original advert: www.airport.lk');
  });

  it('is a complete listing, so a vacancy that leaves it is closed, but an empty page closes nothing', () => {
    expect(by('govhub')).toMatchObject({ region: 'Government', scope: 'local', completeListing: true, emptyMeansClosed: false });
  });

  it('reads the one page that lists them all', async () => {
    const asked: string[] = [];
    expect(await by('govhub').search(ctx({ 'https://jobs.govhub.lk/all-jobs.php': GOVHUB }, asked))).toHaveLength(2);
    expect(asked.filter((u) => !u.endsWith('robots.txt'))).toEqual(['https://jobs.govhub.lk/all-jobs.php']);
  });
});

describe('Jobify.lk', () => {
  it('reads remote jobs open to Sri Lanka, with pay and posted date', () => {
    const jobs = parseJobify(JOBIFY, new Date('2026-11-13T12:00:00Z'));
    expect(jobs).toHaveLength(3);
    expect(jobs[0]).toMatchObject({
      source: 'jobify', url: 'https://jobify.lk/jobs/r/2d397b518a9d6c9f', title: 'Senior Performance Marketing Manager', company: 'D2B',
      location: 'Remote (Asia Only)', workMode: 'remote', slEligibility: 'yes', employmentType: 'Full-time', category: 'Sales & Marketing', salary: null,
    });
    expect(jobs[0]!.postedAt?.toISOString().slice(0, 10)).toBe('2026-11-12'); // 13 Nov in Sri Lanka
    expect(jobs[1]).toMatchObject({ salary: 'USD 80–130 / hour', category: null, postedAt: null });
    // "20 Dec" cannot be in the future, so it is last year's.
    expect(jobs[2]!.postedAt?.getUTCFullYear()).toBe(2025);
  });

  it('is searched only with Global on, newest jobs plus each keyword', async () => {
    expect(by('jobify').scope).toBe('global');
    const asked: string[] = [];
    await by('jobify').search(ctx({ robots: 'User-Agent: *\nAllow: /\nDisallow: /api', 'https://jobify.lk/remote': JOBIFY }, asked));
    expect(asked.filter((u) => !u.endsWith('robots.txt'))).toEqual(['https://jobify.lk/remote', 'https://jobify.lk/remote?q=accountant']);
  });
});

describe('Gazette.lk and NearJobs.lk vacancy feeds', () => {
  const item = (title: string, cats: string[], body: string, link: string) => `<item><title>${title}</title><link>${link}</link><guid>${link}</guid>
    ${cats.map((c) => `<category><![CDATA[${c}]]></category>`).join('')}<pubDate>Thu, 12 Nov 2026 16:54:08 +0000</pubDate>
    <description><![CDATA[${body}]]></description></item>`;
  const FEED = `<?xml version="1.0"?><rss version="2.0"><channel><title>Gazette.lk</title>
    ${item('Designer &#8211; National Design Centre Vacancies 2026', ['Government Job Vacancies', 'National Design Center Job Vacancies'], 'Read more please go to this link: Designer Closing Date: 2026-11-27 Applications are invited…', 'https://www.gazette.lk/2026/11/designer-ndc.html')}
    ${item('Driver Job Vacancies &#8211; Plantation Human Development Trust', ['Driver Vacancy', 'Government Job Vacancies'], 'Applications are invited. Closing Date : 2026 - 11 - 30', 'https://nearjobs.lk/driver-phdt/')}
    ${item('Sri Lanka Ports Authority Job Vacancies', ['Electrician job vacancies', 'Government Job Vacancies'], 'Electricians wanted.', 'https://nearjobs.lk/slpa/')}
    ${item('Government Salary Hike Sri Lanka Budget 2027', ['Latest News in Sri Lanka'], 'News.', 'https://www.gazette.lk/2026/11/budget.html')}
  </channel></rss>`;

  it('reads vacancies with role, employer and closing date, and skips news posts', () => {
    const jobs = parseVacancyFeed(FEED, 'gazettelk', 'Gazette.lk');
    expect(jobs.map((j) => [j.title, j.company])).toEqual([
      ['Designer', 'National Design Centre'],
      ['Driver', 'Plantation Human Development Trust'],
      ['Sri Lanka Ports Authority', 'Sri Lanka Ports Authority'],
    ]);
    expect(jobs[0]).toMatchObject({ source: 'gazettelk', category: 'Government', country: 'Sri Lanka', workMode: 'onsite' });
    expect(jobs[0]!.deadline?.toISOString()).toBe('2026-11-27T18:29:59.000Z');
    expect(jobs[1]!.deadline?.toISOString()).toBe('2026-11-30T18:29:59.000Z');
  });

  it('are local government sources that read two feed pages', async () => {
    expect(by('gazettelk')).toMatchObject({ region: 'Government', scope: 'local' });
    const asked: string[] = [];
    await by('nearjobs').search(ctx({ 'https://nearjobs.lk/feed/': FEED }, asked));
    expect(asked.filter((u) => !u.endsWith('robots.txt'))).toEqual(['https://nearjobs.lk/feed/', 'https://nearjobs.lk/feed/?paged=2']);
  });
});

describe('Finders.lk', () => {
  it('opens its job pages and reads the job data on each, filed under Finders.lk', async () => {
    const LIST = `<html><body><a href="/job/waiter-restaurant">Waiter (Restaurant)</a><a href="/job/assistant-manager-analytics">Assistant Manager Business Analytics</a></body></html>`;
    // Like the live site: a "//" comment line and a trailing comma inside the job data, and map coordinates as the locality.
    const data = (title: string) => JSON.stringify({ '@context': 'https://schema.org', '@type': 'JobPosting', title, datePosted: '2026-11-13 16:53:53', validThrough: '2027-07-23', hiringOrganization: { name: 'Finder' }, jobLocation: { address: { addressLocality: '6.8382,79.9103', addressRegion: 'Western Province', addressCountry: 'Sri Lanka' } }, description: `<p>${title} wanted.</p>` }, null, 1)
      .replace(/\n}$/, ',\n // "isPartOf": { "@type": "Website" }\n}');
    const job = (title: string) => `<html><head><script type="application/ld+json">${data(title)}</script></head><body>${title} Full-Time Finder Colombo 07</body></html>`;
    const jobs = await by('finders').search(ctx({
      'https://finders.lk/job/waiter': job('Waiter (Restaurant)'), 'https://finders.lk/job/assistant': job('Assistant Manager Business Analytics'), 'https://finders.lk/job': LIST,
    }));
    expect(jobs.map((j) => j.title)).toEqual(['Waiter (Restaurant)', 'Assistant Manager Business Analytics']);
    expect(jobs[0]).toMatchObject({ source: 'finders', sourceLabel: 'Finders.lk', location: 'Western Province, Sri Lanka', description: 'Waiter (Restaurant) wanted.' });
    expect(jobs[0]!.postedAt?.toISOString().slice(0, 10)).toBe('2026-11-13');
    expect(by('finders')).toMatchObject({ region: 'Sri Lanka', scope: 'local' });
  });
});

describe('We Work Remotely', () => {
  const item = (title: string, region: string, link: string) => `<item><title>${title}</title><region>${region}</region><country></country><state></state>
    <skills>Excel, QuickBooks</skills><category>Finance and Legal</category><type>Full-Time</type><description>&lt;p&gt;Remote role.&lt;/p&gt;</description>
    <pubDate>Fri, 13 Nov 2026 15:58:32 +0000</pubDate><expires_at>Sun, 13 Dec 2026 15:57:57 +0000</expires_at><guid>${link}</guid><link>${link}</link></item>`;
  const FEED = `<?xml version="1.0"?><rss version="2.0"><channel><title>We Work Remotely</title>
    ${item('Acme Ltd: Remote Bookkeeper', 'Anywhere in the World', 'https://weworkremotely.com/remote-jobs/acme-bookkeeper')}
    ${item('Lanka Co: Accounts Executive', 'Asia Only', 'https://weworkremotely.com/remote-jobs/lanka-accounts')}
    ${item('US Corp: Controller', 'USA Only', 'https://weworkremotely.com/remote-jobs/us-controller')}
  </channel></rss>`;

  it('splits company from title, and marks only worldwide and Asia jobs as open to Sri Lanka', () => {
    const jobs = parseWwr(FEED);
    expect(jobs.map((j) => [j.company, j.title, j.slEligibility])).toEqual([
      ['Acme Ltd', 'Remote Bookkeeper', 'yes'], ['Lanka Co', 'Accounts Executive', 'yes'], ['US Corp', 'Controller', 'no'],
    ]);
    expect(jobs[0]).toMatchObject({ source: 'wwr', workMode: 'remote', location: 'Remote (Anywhere in the World)', employmentType: 'Full-Time', category: 'Finance and Legal' });
    expect(jobs[0]!.deadline?.toISOString()).toBe('2026-12-13T15:57:57.000Z');
    expect(jobs[0]!.description).toContain('Skills: Excel, QuickBooks');
  });

  it('is a global source that reads one feed', async () => {
    expect(by('wwr')).toMatchObject({ region: 'Remote', scope: 'global' });
    const asked: string[] = [];
    expect(await by('wwr').search(ctx({ 'https://weworkremotely.com/remote-jobs.rss': FEED }, asked))).toHaveLength(3);
    expect(asked.filter((u) => !u.endsWith('robots.txt'))).toEqual(['https://weworkremotely.com/remote-jobs.rss']);
  });
});

describe('ReliefWeb', () => {
  // Shape of ReliefWeb's API (v2) response, as its documentation describes it.
  const RESPONSE = { totalCount: 2, data: [
    { id: '4189001', fields: {
      title: 'Programme Officer - Livelihoods', url: 'https://reliefweb.int/node/4189001', url_alias: 'https://reliefweb.int/job/4189001/programme-officer-livelihoods',
      date: { created: '2026-11-12T08:00:00+00:00', closing: '2026-11-30T00:00:00+00:00' },
      source: [{ name: 'World Food Programme' }], country: [{ name: 'Sri Lanka' }], city: [{ name: 'Batticaloa' }],
      body: '<p>Support livelihood programmes.</p>', career_categories: [{ name: 'Program/Project Management' }], type: [{ name: 'Job' }], experience: [{ name: '3-4 years' }],
    } },
    { id: '4189002', fields: { title: 'Logistics Officer', url: 'https://reliefweb.int/node/4189002', date: { created: '2026-11-11T08:00:00+00:00' }, source: [{ name: 'UNHCR' }], country: [{ name: 'Kenya' }], body: '' } },
  ] };

  it('reads jobs with organisation, place, closing date and link back to ReliefWeb', () => {
    const [sl, ke] = parseReliefweb(RESPONSE);
    expect(sl).toMatchObject({
      source: 'reliefweb', url: 'https://reliefweb.int/job/4189001/programme-officer-livelihoods', title: 'Programme Officer - Livelihoods',
      company: 'World Food Programme', location: 'Batticaloa, Sri Lanka', country: 'Sri Lanka', slEligibility: 'yes', category: 'Program/Project Management',
    });
    expect(sl!.deadline?.toISOString()).toBe('2026-11-30T18:29:59.000Z');
    expect(sl!.description).toContain('Experience: 3-4 years');
    expect(ke).toMatchObject({ url: 'https://reliefweb.int/node/4189002', country: 'Kenya', company: 'UNHCR' });
  });

  it('stays off until an approved app name is added', () => {
    expect(by('reliefweb').missingConfig!(ctx({}))).toMatch(/RELIEFWEB_APPNAME/);
    expect(by('reliefweb').missingConfig!(ctx({}, [], { env: { RELIEFWEB_APPNAME: 'surelane-jobs' } }))).toBeNull();
  });

  it('asks for Sri Lankan jobs with Local on and keyword searches with Global on', async () => {
    const sent: { url: string; body: any }[] = [];
    const fetch = (async (url: string, init?: RequestInit) => {
      sent.push({ url: String(url), body: JSON.parse(String(init?.body ?? '{}')) });
      return new Response(JSON.stringify(RESPONSE), { headers: { 'Content-Type': 'application/json' } });
    }) as typeof globalThis.fetch;
    const jobs = await by('reliefweb').search(ctx({}, [], { fetch, env: { RELIEFWEB_APPNAME: 'surelane jobs' }, keywords: ['programme officer'] }));
    expect(sent.map((r) => r.url)).toEqual(['https://api.reliefweb.int/v2/jobs?appname=surelane%20jobs', 'https://api.reliefweb.int/v2/jobs?appname=surelane%20jobs']);
    expect(sent[0]!.body).toMatchObject({ filter: { field: 'country.name', value: 'Sri Lanka' }, sort: ['date.created:desc'] });
    expect(sent[1]!.body).toMatchObject({ query: { value: 'programme officer', fields: ['title'] } });
    expect(jobs).toHaveLength(2);
  });

  it('explains a refused app name instead of failing the search', async () => {
    const fetch = (async () => new Response('{}', { status: 403 })) as typeof globalThis.fetch;
    await expect(by('reliefweb').search(ctx({}, [], { fetch, env: { RELIEFWEB_APPNAME: 'wrong' } }))).rejects.toThrow(/app name was refused/);
  });
});
