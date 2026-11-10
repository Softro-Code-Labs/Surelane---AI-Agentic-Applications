import { describe, expect, it } from 'vitest';
import type { CandidateProfile } from '@/lib/cv/parse';
import { cvDistrict, cvRoles } from '@/lib/cv-terms';
import { SRI_LANKA_SITES, siteSearches, siteSearchUrl } from '@/lib/sites';
import { UNAVAILABLE_SOURCES, parseJobpal } from '@/lib/sources/adapters';
import { looksClosed } from '@/lib/sources/http';
import { buildSources } from '@/lib/sources/registry';
import type { SourceContext } from '@/lib/sources/types';

const profile = { targetTitles: ['Accountant', 'Finance Executive (ACCA)'], skills: ['Excel', 'Accountant', 'SAP'] } as Pick<CandidateProfile, 'targetTitles' | 'skills'>;
const settings = { extra_keywords: [] as string[], preferred_locations: [] as string[], remote_pref: 'any' as const, local_enabled: true, global_enabled: false };

// Same shape as Jobpal.lk's live job feed (WP Job Manager), including its broken location field.
const JOBPAL = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:job_listing="https://jobpal.lk"><channel>
<title>Jobs &#8211; Jobpal.lk</title><link>https://jobpal.lk</link>
<item><title>Assistant Accountant</title><link>https://jobpal.lk/job/ecowood-trading-pvt-ltd-array-36-assistant-accountant/</link>
<dc:creator><![CDATA[ecowood.hr]]></dc:creator><pubDate>Thu, 05 Nov 2026 10:08:47 +0000</pubDate>
<guid isPermaLink="false">https://jobpal.lk/?post_type=job_listing&#038;p=666970</guid>
<description><![CDATA[Assistant Accountant needed in Colombo &#8211; ACCA part qualified.]]></description>
<content:encoded><![CDATA[<p>Assistant Accountant needed in Colombo &#8211; ACCA part qualified.</p><p>Prepare monthly accounts.</p>]]></content:encoded>
<job_listing:location><![CDATA[Array &mdash; ]]></job_listing:location><job_listing:job_type><![CDATA[full-time]]></job_listing:job_type><job_listing:company><![CDATA[Ecowood Trading (PVT) Ltd]]></job_listing:company></item>
<item><title>Senior Marketing Manager (Remote) MKT-SR</title><link>https://jobpal.lk/job/verdica-36-senior-marketing-manager-remote-mkt-sr/</link>
<dc:creator><![CDATA[careers.kanut]]></dc:creator><pubDate>Thu, 05 Nov 2026 13:01:25 +0000</pubDate><guid isPermaLink="false">https://jobpal.lk/?post_type=job_listing&#038;p=666981</guid>
<content:encoded><![CDATA[<p>Remote role.</p>]]></content:encoded>
<job_listing:location><![CDATA[Kandy]]></job_listing:location><job_listing:job_type><![CDATA[part-time]]></job_listing:job_type><job_listing:company><![CDATA[Verdica]]></job_listing:company></item>
</channel></rss>`;

describe('Sri Lankan job sites', () => {
  it('searches each site for the top two roles and a skill, without repeating a role', () => {
    const out = siteSearches(profile, settings);
    expect(out.map((s) => s.id)).toEqual(SRI_LANKA_SITES.map((s) => s.id));
    const ikman = out.find((s) => s.id === 'ikman')!;
    expect(ikman.links.map((l) => l.label)).toEqual(['Accountant', 'Finance Executive', 'Excel']);
    expect(ikman.links[0]!.url).toBe('https://ikman.lk/en/ads/sri-lanka/jobs?query=Accountant');
  });

  it('opens the home page of a site whose search address could not be confirmed', () => {
    for (const id of ['topjobs', 'rooster']) {
      const site = siteSearches(profile, settings).find((s) => s.id === id)!;
      expect(site.links).toEqual([{ label: `Browse ${SRI_LANKA_SITES.find((s) => s.id === id)!.label}`, url: SRI_LANKA_SITES.find((s) => s.id === id)!.home }]);
    }
  });

  it('uses the confirmed search address on every other site, on that site and over https', () => {
    const urls = Object.fromEntries(siteSearches(profile, { ...settings, preferred_locations: ['colombo'], remote_pref: 'remote' })
      .map((s) => [s.id, s.links[0]!.url]));
    expect(urls).toMatchObject({
      ikman: 'https://ikman.lk/en/ads/colombo/jobs?query=Accountant',
      xpressjobs: 'https://xpress.jobs/jobs?keyword=Accountant',
      jobmasters: 'https://jobmasters.lk/jobs-listing/?search_title=Accountant&location=Colombo',
      dreamjobs: 'https://dreamjobs.lk/search?q=Accountant',
      observerjobs: 'https://observerjobs.lk/vacancies?keyword=Accountant',
      finders: 'https://finders.lk/keyword-search?keyword_data=Accountant&location_data=',
      rakiya: 'https://rakiya.lk/search?q=Accountant',
      agency: 'https://agency.lk/jobs?q=Accountant&location=Colombo&workMode=Remote',
      betterjobs: 'https://betterjobs.lk/jobs?q=Accountant&location=Colombo',
      jobify: 'https://jobify.lk/jobs?q=Accountant&district=Colombo&work=remote',
      lankatalenthub: 'https://lankatalenthub.lk/?q=Accountant',
    });
    for (const site of SRI_LANKA_SITES) {
      const url = new URL(siteSearchUrl(site, 'C# & .NET'));
      expect(url.protocol).toBe('https:');
      expect(url.hostname.endsWith(new URL(site.home).hostname.replace(/^www\./, ''))).toBe(true);
    }
    expect(siteSearchUrl(SRI_LANKA_SITES.find((s) => s.id === 'dreamjobs')!, 'C# & .NET')).toBe('https://dreamjobs.lk/search?q=C%23%20%26%20.NET');
  });

  it('only filters by a location that is a Sri Lankan district', () => {
    expect(cvDistrict({ preferred_locations: ['Dubai', 'nuwara eliya'] })).toBe('Nuwara Eliya');
    expect(cvDistrict({ preferred_locations: ['Moneragala'] })).toBe('Monaragala');
    expect(cvDistrict({ preferred_locations: ['Dubai'] })).toBeNull();
    expect(siteSearches(profile, { ...settings, preferred_locations: ['Nuwara Eliya'] }).find((s) => s.id === 'ikman')!.links[0]!.url)
      .toBe('https://ikman.lk/en/ads/nuwara-eliya/jobs?query=Accountant');
  });

  it('puts your own keywords first, and still offers browsing with an empty CV', () => {
    expect(cvRoles(profile, { extra_keywords: ['Tax Consultant'] })).toEqual(['Tax Consultant', 'Accountant', 'Finance Executive']);
    const empty = siteSearches({ targetTitles: [], skills: [] }, settings);
    expect(empty.every((s) => s.links.length === 1 && s.links[0]!.label.startsWith('Browse '))).toBe(true);
  });

  it('lists every site under Not searched, with its reason and a working search link', () => {
    const labels = UNAVAILABLE_SOURCES.map((u) => u.label);
    for (const site of SRI_LANKA_SITES) expect(labels.includes(site.label)).toBe(!site.automatic);
    expect(labels).not.toContain('Jobpal.lk');
    expect(labels).toEqual(expect.arrayContaining(['LinkedIn Jobs', 'TopJobs.lk', 'Rooster Jobs', 'JobMasters.lk', 'Finders.lk', 'Indeed', 'Glassdoor']));
    for (const u of UNAVAILABLE_SOURCES) {
      expect(u.reason.length).toBeGreaterThan(10);
      expect(new URL(u.searchUrl('Accountant')).protocol).toBe('https:');
    }
  });
});

describe('Jobpal.lk feed', () => {
  it('reads the company and job type, and ignores the broken location', () => {
    const jobs = parseJobpal(JOBPAL);
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({
      source: 'jobpal', title: 'Assistant Accountant', company: 'Ecowood Trading (PVT) Ltd', location: 'Sri Lanka', country: 'Sri Lanka',
      employmentType: 'full time', workMode: 'unknown', url: 'https://jobpal.lk/job/ecowood-trading-pvt-ltd-array-36-assistant-accountant/',
    });
    expect(jobs[0]!.description).toContain('Prepare monthly accounts.');
    expect(jobs[0]!.postedAt?.toISOString()).toBe('2026-11-05T10:08:47.000Z');
    expect(jobs[1]).toMatchObject({ company: 'Verdica', location: 'Kandy', workMode: 'remote', employmentType: 'part time' });
  });

  it('reads the newest jobs and one search per keyword, only when robots.txt allows', async () => {
    const asked: string[] = [];
    const ctx = (robots: string): SourceContext => ({
      fetch: (async (url: string) => {
        if (url.endsWith('/robots.txt')) return new Response(robots);
        asked.push(url);
        return new Response(JOBPAL);
      }) as typeof fetch,
      sleep: async () => {}, now: new Date('2026-11-06T00:00:00Z'), keywords: ['accountant', 'finance executive', 'excel', 'sap'],
      settings: { local_enabled: true, global_enabled: false, custom_feeds: [] }, env: {}, robotsCache: new Map(),
    });
    const jobpal = buildSources({ custom_feeds: [] }).find((s) => s.id === 'jobpal')!;
    expect(await jobpal.search(ctx('User-agent: *\nDisallow: /wp-admin/'))).toHaveLength(2);
    expect(asked).toEqual([
      'https://jobpal.lk/?feed=job_feed', 'https://jobpal.lk/?feed=job_feed&search_keywords=accountant',
      'https://jobpal.lk/?feed=job_feed&search_keywords=finance%20executive', 'https://jobpal.lk/?feed=job_feed&search_keywords=excel',
    ]);
    await expect(jobpal.search(ctx('User-agent: *\nDisallow: /'))).rejects.toThrow(/robots/);
  });

  it('recognises an expired Jobpal listing as closed', () => {
    expect(looksClosed('Assistant Accountant\nThis listing has expired.')).toBe(true);
  });
});
