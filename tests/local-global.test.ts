import { describe, expect, it } from 'vitest';
import { SECTION_TITLE, emailSections, matchesEmail, type EmailJob } from '@/lib/notify/email';
import { scopeLabel, scopeSql, searchesOff } from '@/lib/settings';
import { GLOBAL_SITES, GOVERNMENT_SITES, SRI_LANKA_SITES, siteSearches } from '@/lib/sites';
import { UNAVAILABLE_SOURCES } from '@/lib/sources/adapters';
import { buildSources } from '@/lib/sources/registry';
import type { SourceContext } from '@/lib/sources/types';

const on = (local_enabled: boolean, global_enabled: boolean) => ({ local_enabled, global_enabled });

describe('Local and Global switches', () => {
  it('filter stored jobs by scope, and stop everything when both are off', () => {
    expect(scopeSql(on(true, true))).toBe('');
    expect(scopeSql(on(true, false))).toBe(`AND j.market = 'sri_lanka'`);
    expect(scopeSql(on(false, true))).toBe(`AND j.market <> 'sri_lanka'`);
    expect(scopeSql(on(false, false))).toBe('AND false');
    expect([searchesOff(on(false, false)), searchesOff(on(true, false)), searchesOff(on(false, true))]).toEqual([true, false, false]);
    expect([scopeLabel(on(true, true)), scopeLabel(on(true, false)), scopeLabel(on(false, true))]).toEqual(['Sri Lanka and global', 'Sri Lanka only', 'global only']);
  });

  it('give every source the right scope', () => {
    const scope = Object.fromEntries(buildSources({ custom_feeds: ['https://example.lk/feed'] }).map((s) => [s.id, s.scope]));
    expect(scope).toEqual({
      itpro: 'local', jobpal: 'local', observerjobs: 'local', govjobs: 'local', govdoc: 'local', govhub: 'local',
      gazettelk: 'local', nearjobs: 'local', finders: 'local',
      himalayas: 'both', reliefweb: 'both', 'feed:example.lk': 'both',
      jobify: 'global', wwr: 'global', jobicy: 'global', remotive: 'global', remoteok: 'global',
    });
  });

  it('make Himalayas search Sri Lanka, the world, or both', async () => {
    const asked: string[] = [];
    const ctx = (local_enabled: boolean, global_enabled: boolean): SourceContext => ({
      fetch: (async (url: string, init?: RequestInit) => {
        asked.push(init?.body ? `${url} ${init.body}` : String(url));
        return new Response(JSON.stringify({ jobs: [] }));
      }) as typeof fetch,
      sleep: async () => {}, now: new Date('2026-11-10T00:00:00Z'), keywords: ['accountant'],
      settings: { local_enabled, global_enabled, custom_feeds: [] }, env: {}, robotsCache: new Map(), resolveHost: async () => ['93.184.216.34'],
    });
    const himalayas = buildSources({ custom_feeds: [] }).find((s) => s.id === 'himalayas')!;
    const run = async (local: boolean, global: boolean) => {
      asked.length = 0;
      await himalayas.search(ctx(local, global));
      return [...asked];
    };
    expect(await run(true, false)).toEqual([
      'https://himalayas.app/jobs/api/search?q=accountant&sort=recent&country=Sri+Lanka',
    ]);
    expect(await run(false, true)).toEqual([
      'https://himalayas.app/jobs/api/search?q=accountant&sort=recent',
    ]);
    expect(await run(true, true)).toHaveLength(2);
  });
});

describe('site searches follow the switches', () => {
  const profile = { targetTitles: ['Accountant'], skills: ['Excel', 'SAP'] };
  const base = { extra_keywords: [] as string[], preferred_locations: [] as string[], remote_pref: 'any' as const };
  const ids = (sites: { id: string }[]) => sites.map((s) => s.id);

  it('show Sri Lankan and government sites only with Local on', () => {
    expect(siteSearches(profile, { ...base, ...on(true, false) })).toHaveLength(SRI_LANKA_SITES.filter((x) => !x.field).length);
    expect(siteSearches(profile, { ...base, ...on(false, true) })).toEqual([]);
    // Only the foreign employment bureau serves Global: it is for people looking for work abroad.
    expect(ids(siteSearches(profile, { ...base, ...on(false, true) }, GOVERNMENT_SITES, { latest: true }))).toEqual(['slbfe']);
  });

  it('give international platforms Sri Lanka searches for Local and worldwide ones for Global', () => {
    const local = siteSearches(profile, { ...base, ...on(true, false) }, GLOBAL_SITES);
    // Indeed has no Sri Lankan site, so it is offered for jobs abroad only.
    // ReliefWeb also lists NGO jobs in Sri Lanka.
    expect(ids(local)).toEqual(['himalayas', 'reliefweb']);
    expect(local.find((s) => s.id === 'himalayas')!.links[0]!.url).toBe('https://himalayas.app/jobs/countries/sri-lanka?q=Accountant');

    const global = siteSearches(profile, { ...base, ...on(false, true) }, GLOBAL_SITES);
    // Boards for one field (health, teaching, hospitality) are left out for an accountant.
    expect(ids(global)).toEqual(['indeed', 'glassdoor', 'himalayas', 'jobicy', 'remotive', 'remoteok', 'wwr', 'workingnomads', 'remoteco', 'dynamite',
      'bayt', 'gulftalent', 'jobmaldives', 'careermaldives', 'mycareersfuture', 'jobstreet', 'seek', 'reed', 'jobbank', 'eures', 'reliefweb', 'idealist', 'uncareers']);
    expect(global.find((s) => s.id === 'bayt')!.links[0]!.url).toBe('https://www.bayt.com/en/international/jobs/accountant-jobs/');
    expect(global.find((s) => s.id === 'reed')!.links[0]!.url).toBe('https://www.reed.co.uk/jobs/accountant-jobs');
    expect(global.find((s) => s.id === 'gulftalent')!.links[0]!.url).toBe('https://www.gulftalent.com/jobs/search?search_keyword=Accountant');
    expect(global.find((s) => s.id === 'indeed')!.links[0]!.url).toBe('https://www.indeed.com/jobs?q=Accountant');
    expect(global.find((s) => s.id === 'jobicy')!.links[0]!.url).toBe('https://jobicy.com/jobs/?search_keywords=Accountant');
    expect(global.find((s) => s.id === 'remotive')!.links[0]!.url).toBe('https://remotive.com/remote-jobs?query=Accountant');
    expect(global.find((s) => s.id === 'glassdoor')!.links[0]!.url).toBe('https://www.glassdoor.com/Job/jobs.htm?sc.keyword=Accountant');

    const both = siteSearches(profile, { ...base, ...on(true, true) }, GLOBAL_SITES);
    expect(both.find((s) => s.id === 'himalayas')!.links.map((l) => l.label)).toEqual(['Accountant · Sri Lanka', 'Excel · Sri Lanka', 'Accountant · Worldwide', 'Excel · Worldwide']);
    expect(both.find((s) => s.id === 'indeed')!.area).toBe('world');
  });

  it('search Remote OK by one-word tags only, and say which platforms are searched automatically', () => {
    const remoteok = siteSearches({ targetTitles: ['Software Engineer'], skills: ['React', 'Node.js'] }, { ...base, ...on(false, true) }, GLOBAL_SITES)
      .find((s) => s.id === 'remoteok')!;
    expect(remoteok.links.map((l) => l.url)).toEqual(['https://remoteok.com/remote-react-jobs']);
    expect(GLOBAL_SITES.filter((s) => s.automatic).map((s) => s.id)).toEqual(['himalayas', 'jobicy', 'remotive', 'remoteok', 'wwr', 'reliefweb']);
    const nurse = siteSearches({ targetTitles: ['Staff Nurse'], skills: ['Patient care'] }, { ...base, ...on(false, true) }, GLOBAL_SITES);
    expect(nurse.find((s) => s.id === 'nhs')!.links[0]!.url).toBe('https://www.jobs.nhs.uk/candidate/search/results?keyword=Staff%20Nurse');
    expect(nurse.some((s) => s.id === 'tes' || s.id === 'caterer')).toBe(false);
    const notSearched = UNAVAILABLE_SOURCES.map((u) => u.label);
    expect(notSearched).toEqual(expect.arrayContaining(['Indeed', 'Glassdoor']));
    for (const label of ['Himalayas', 'Jobicy', 'Remotive', 'Remote OK']) expect(notSearched).not.toContain(label);
  });
});

describe('job email sections', () => {
  const job = (id: string, market: string, title: string): EmailJob => ({
    id, title, company: 'Acme', location: market === 'sri_lanka' ? 'Colombo' : 'Berlin', country: null, market, work_mode: 'onsite',
    salary: null, employment_type: null, posted_at: null, deadline: null, score: 80, tier: 'Strong', explanation: null,
    matching_skills: [], missing_skills: [], mandatory_missing: [], url: `https://jobs.example/${id}`, source_label: 'Test',
  });
  const jobs = [job('1', 'sri_lanka', 'Colombo Accountant'), job('2', 'international', 'Berlin Accountant'), job('3', 'remote_lk', 'Remote Accountant')];

  it('keep local and global jobs in separate, labelled sections when both are on', () => {
    const sections = emailSections(jobs, on(true, true));
    expect(sections.map((x) => [x.title, x.jobs.map((j) => j.id)])).toEqual([
      ['Local Job Opportunities (Sri Lanka)', ['1']],
      ['Global Job Opportunities (International)', ['2', '3']],
    ]);
    const mail = matchesEmail(jobs, undefined, on(true, true));
    expect(mail.subject).toBe('3 new job matches (1 local, 2 global), 3 strong');
    const html = mail.html;
    expect(html.indexOf(SECTION_TITLE.local)).toBeLessThan(html.indexOf('Colombo Accountant'));
    expect(html.indexOf('Colombo Accountant')).toBeLessThan(html.indexOf(SECTION_TITLE.global));
    expect(html.indexOf(SECTION_TITLE.global)).toBeLessThan(html.indexOf('Berlin Accountant'));
    expect(mail.text.split('GLOBAL JOB OPPORTUNITIES')[0]).not.toContain('Berlin');
  });

  it('include only the switched-on category', () => {
    const local = matchesEmail(jobs, undefined, on(true, false));
    expect(local.html).toContain(SECTION_TITLE.local);
    expect(local.html).not.toContain(SECTION_TITLE.global);
    expect(local.html).not.toContain('Berlin Accountant');
    expect(local.subject).toBe('1 new job match, 1 strong');
    const global = matchesEmail(jobs, undefined, on(false, true));
    expect(global.html).not.toContain(SECTION_TITLE.local);
    expect(global.html).not.toContain('Colombo Accountant');
    expect(global.subject).toBe('2 new job matches, 2 strong');
  });

  it('say so when one of two sections has nothing new', () => {
    const mail = matchesEmail([jobs[1]!], undefined, on(true, true));
    expect(mail.html).toContain('No new local matches this time.');
    expect(mail.subject).toBe('1 new job match (0 local, 1 global), 1 strong');
  });
});
