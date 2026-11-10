import { describe, expect, it } from 'vitest';
import { GOVERNMENT_SITES, siteSearches } from '@/lib/sites';
import { UNAVAILABLE_SOURCES, parseGovdoc, parseGovjobs } from '@/lib/sources/adapters';
import { buildSources } from '@/lib/sources/registry';
import { classify } from '@/lib/search/classify';
import type { SourceContext } from '@/lib/sources/types';

const profile = { targetTitles: ['Pharmacist'], skills: ['Inventory'] };
const settings = { extra_keywords: [] as string[], preferred_locations: ['Kandy'], remote_pref: 'any' as const, local_enabled: true, global_enabled: false };

// Items copied from Govjobs.lk's live feed, including an exam calendar and a news post, which are not vacancies.
const GOVJOBS = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>Govjobs.lk</title>
<item><title>Pharmacist &#8211; State Pharmaceuticals Corporation of Sri Lanka Job Vacancies 2026</title><link>https://www.govjobs.lk/pharmacist-state-pharmaceuticals-corporation-of-sri-lanka-job-vacancies-2026/</link>
<pubDate>Mon, 09 Nov 2026 13:04:44 +0000</pubDate><category><![CDATA[Government Job Vacancies]]></category><category><![CDATA[State Pharmaceuticals Corporation of Sri Lanka Job Vacancies]]></category><guid isPermaLink="false">https://www.govjobs.lk/?p=31500</guid>
<description><![CDATA[<p>Read more please go to this link: <a href="https://www.govjobs.lk/x/">Pharmacist</a></p><p>State Pharmaceuticals Corporation of Sri Lanka Job Vacancies for 2026 Employer State Pharmaceuticals Corporation of Sri Lanka Job Title Pharmacist Closing Date 2026 &#8211; 11 &#8211; 23 Sinhala Advertisement Download</p>]]></description></item>
<item><title>Technical Assistant (Agriculture Extension) &#8211; North Western Province Vacancies 2026</title><link>https://www.govjobs.lk/technical-assistant-nwp/</link>
<pubDate>Sun, 08 Nov 2026 05:58:01 +0000</pubDate><category><![CDATA[Government Job Vacancies]]></category><guid isPermaLink="false">https://www.govjobs.lk/?p=31490</guid>
<description><![CDATA[<p>Northern Province Job Vacancies for 2026 Job Title Technical Assistant (Agricultural Extension) Exam Date And Closing Date 2026 &#8211; 11 &#8211; 15 Sinhala Advertisement</p>]]></description></item>
<item><title>Exam Calendar 2026 December</title><link>https://www.govjobs.lk/exam-calendar-2026-december/</link><pubDate>Sat, 07 Nov 2026 05:00:00 +0000</pubDate>
<category><![CDATA[Exam Calendar October]]></category><description><![CDATA[<p>Exam Calendar Sinhala Download PDF</p>]]></description></item>
<item><title>Sri Lanka Principals Service (SLPS) Openings for 2025–2026</title><link>https://www.govjobs.lk/slps/</link><pubDate>Sat, 07 Nov 2026 04:00:00 +0000</pubDate>
<category><![CDATA[News]]></category><description><![CDATA[<p>Gazette Notice</p>]]></description></item>
</channel></rss>`;

const GOVDOC = `<?xml version="1.0" encoding="UTF-8" ?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>Govdoc</title>
<item><title>Assistant Quantity Surveyor, Technical Officer jobs at Land Reclamation &amp; Development Company Limited</title>
<link>https://job.govdoc.lk/assistant-quantity-surveyor-technical-officer-land-reclamation-development-company-limited-9770</link>
<guid>https://job.govdoc.lk/assistant-quantity-surveyor-technical-officer-land-reclamation-development-company-limited-9770</guid>
<description><![CDATA[Apply for the Assistant Quantity Surveyor and Technical Officer vacancies at Land Reclamation & Development Company Limited.]]></description>
<pubDate>Tue, 10 Nov 2026 04:49:44 +0000</pubDate></item>
<item><title>Driver job at Nawalapitiya Urban Council</title><link>https://job.govdoc.lk/driver-nawalapitiya-urban-council-9771</link>
<description><![CDATA[Apply for the Driver vacancy.]]></description><pubDate>Tue, 10 Nov 2026 05:13:23 +0000</pubDate></item>
</channel></rss>`;

describe('government job sites', () => {
  it('are their own group, with a newest-vacancies link on every site', () => {
    const out = siteSearches(profile, settings, GOVERNMENT_SITES, { latest: true });
    expect(out.map((s) => s.id)).toEqual(['govjobs', 'govdoc', 'governmentjobs', 'govhub', 'jobslanka']);
    const links = Object.fromEntries(out.map((s) => [s.id, s.links.map((l) => l.url)]));
    expect(links).toEqual({
      govjobs: ['https://www.govjobs.lk/?s=Pharmacist', 'https://www.govjobs.lk/?s=Inventory', 'https://www.govjobs.lk/'],
      govdoc: ['https://job.govdoc.lk/'],
      governmentjobs: ['https://governmentjobs.lk/'],
      govhub: ['https://jobs.govhub.lk/index.php?search=Pharmacist&category_id=&institute_id=', 'https://jobs.govhub.lk/index.php?search=Inventory&category_id=&institute_id=', 'https://jobs.govhub.lk/'],
      jobslanka: ['https://jobslanka.lk/?search=Pharmacist&district=Kandy', 'https://jobslanka.lk/?search=Inventory&district=Kandy', 'https://jobslanka.lk/'],
    });
    expect(out.find((s) => s.id === 'govdoc')!.links[0]!.label).toBe('Latest vacancies');
    expect(out.filter((s) => s.automatic).map((s) => s.id)).toEqual(['govjobs', 'govdoc']);
  });

  it('lists only the sites that are not read automatically under Not searched, marked as government', () => {
    expect(UNAVAILABLE_SOURCES.filter((u) => u.government).map((u) => u.label)).toEqual(['GovernmentJobs.lk', 'GovHub Jobs', 'JobsLanka']);
    expect(UNAVAILABLE_SOURCES.filter((u) => !u.government).map((u) => u.label)).not.toContain('GovHub Jobs');
  });
});

describe('government feeds', () => {
  it('reads Govjobs.lk vacancies with employer and closing date, and skips exam calendars and news', () => {
    const jobs = parseGovjobs(GOVJOBS);
    expect(jobs.map((j) => j.title)).toEqual(['Pharmacist', 'Technical Assistant (Agricultural Extension)']);
    expect(jobs[0]).toMatchObject({ source: 'govjobs', company: 'State Pharmaceuticals Corporation of Sri Lanka', category: 'Government', location: 'Sri Lanka', workMode: 'onsite' });
    expect(jobs[0]!.deadline?.toISOString()).toBe('2026-11-23T18:29:59.000Z');
    expect(jobs[1]).toMatchObject({ company: 'North Western Province' });
    expect(jobs[1]!.deadline?.toISOString()).toBe('2026-11-15T18:29:59.000Z');
    expect(classify(jobs[0]!).market).toBe('sri_lanka');
  });

  it('reads Govdoc Jobs titles as role and employer', () => {
    const jobs = parseGovdoc(GOVDOC);
    expect(jobs.map((j) => [j.title, j.company])).toEqual([
      ['Assistant Quantity Surveyor, Technical Officer', 'Land Reclamation & Development Company Limited'],
      ['Driver', 'Nawalapitiya Urban Council'],
    ]);
    expect(jobs[0]).toMatchObject({ source: 'govdoc', category: 'Government', country: 'Sri Lanka' });
    expect(jobs[1]!.postedAt?.toISOString()).toBe('2026-11-10T05:13:23.000Z');
  });

  it('are searched as Government sources, only when robots.txt allows', async () => {
    const ctx = (robots: string, body: string): SourceContext => ({
      fetch: (async (url: string) => new Response(url.endsWith('/robots.txt') ? robots : body)) as typeof fetch,
      sleep: async () => {}, now: new Date('2026-11-10T00:00:00Z'), keywords: [], settings: { local_enabled: true, global_enabled: false, custom_feeds: [] }, env: {}, robotsCache: new Map(), resolveHost: async () => ['93.184.216.34'],
    });
    const sources = buildSources({ custom_feeds: [] });
    const govjobs = sources.find((s) => s.id === 'govjobs')!;
    const govdoc = sources.find((s) => s.id === 'govdoc')!;
    expect([govjobs.region, govdoc.region]).toEqual(['Government', 'Government']);
    expect(await govjobs.search(ctx('User-agent: *\nDisallow: /wp-admin/', GOVJOBS))).toHaveLength(2);
    expect(await govdoc.search(ctx('User-agent: *\nDisallow:', GOVDOC))).toHaveLength(2);
    await expect(govdoc.search(ctx('User-agent: *\nDisallow: /', GOVDOC))).rejects.toThrow(/robots/);
  });
});
