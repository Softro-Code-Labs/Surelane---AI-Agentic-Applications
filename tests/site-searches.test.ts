import { describe, expect, it } from 'vitest';
import { linkedinSite, type LinkedinSearch } from '@/lib/linkedin';
import { GLOBAL_SITES, GOVERNMENT_SITES, SRI_LANKA_SITES, byPopularity, siteSearches, type SiteSearch } from '@/lib/sites';

const profile = { targetTitles: ['Accountant'], skills: ['Excel', 'SAP'] };
const settings = { extra_keywords: [] as string[], preferred_locations: [] as string[], remote_pref: 'any' as const, local_enabled: true, global_enabled: false };
const site = (id: string, popularity: number | null): SiteSearch => ({ id, label: id, automatic: false, links: [], popularity, area: 'lk' });

describe('job sites to search by hand', () => {
  it('list the most popular first, with unranked sites after in their own order', () => {
    expect(byPopularity([site('c', null), site('a', 500), site('d', null), site('b', 17)]).map((s) => s.id)).toEqual(['b', 'a', 'c', 'd']);
  });

  it('give every Sri Lankan site a real search, except the few with no working keyword search', () => {
    const lk = siteSearches(profile, settings, SRI_LANKA_SITES);
    const browseOnly = lk.filter((s) => s.links.some((l) => l.label.startsWith('Browse '))).map((s) => s.id);
    expect(browseOnly).toEqual(['lankacareer', 'unjobnet']);
    expect(lk.find((s) => s.id === 'jobhub')!.links[0]!.url).toBe('https://jobhub.lk/en/Sri%20Lanka/search?q=Accountant');
    expect(lk.find((s) => s.id === 'hotjobs')!.links[0]!.url).toBe('https://hotjobs.lk/jobs?search=Accountant');
    expect(lk.find((s) => s.id === 'jobportal')!.links[0]!.url).toBe('https://jobportal.com.lk/jobs?q=Accountant');
    expect(lk.find((s) => s.id === 'topjobs')!.links[0]!.url).toBe('https://www.topjobs.lk/applicant/vacancybyfunctionalarea.jsp?FA=AV&txtKeyWord=Accountant');
    expect(lk.find((s) => s.id === 'rooster')!.links[0]!.url).toBe('https://rooster.jobs/?query=Accountant');
  });

  it('say whose jobs each site reaches, and carry its popularity', () => {
    const intl = siteSearches(profile, { ...settings, global_enabled: true }, GLOBAL_SITES);
    expect(intl.find((s) => s.id === 'indeed')).toMatchObject({ area: 'world', popularity: 436 });
    expect(intl.find((s) => s.id === 'himalayas')).toMatchObject({ area: 'both' });
    expect(intl.find((s) => s.id === 'glassdoor')).toMatchObject({ area: 'world' });
    expect(siteSearches(profile, settings, GOVERNMENT_SITES, { latest: true }).find((s) => s.id === 'govjobs')!.links.at(-1)!.label).toBe('Latest vacancies');
  });

  it('show LinkedIn as one ordinary card: three searches, or two per scope with both on', () => {
    const s = (scope: 'local' | 'global', label: string): LinkedinSearch => ({ scope, label, why: 'Why.', facts: ['Sri Lanka'], url: `https://www.linkedin.com/jobs/search/?keywords=${label}` });
    const localOnly = linkedinSite([s('local', 'A'), s('local', 'B'), s('local', 'C'), s('local', 'D')])!;
    expect(localOnly).toMatchObject({ id: 'linkedin', popularity: 17, area: 'lk' });
    expect(localOnly.links.map((l) => l.label)).toEqual(['A', 'B', 'C']);
    expect(localOnly.links[0]!.title).toBe('Why. Sri Lanka.');
    const both = linkedinSite([s('local', 'A'), s('local', 'B'), s('local', 'C'), s('global', 'X'), s('global', 'Y'), s('global', 'Z')])!;
    expect(both.area).toBe('both');
    expect(both.links.map((l) => l.label)).toEqual(['A · Sri Lanka', 'B · Sri Lanka', 'X', 'Y']);
    expect(linkedinSite([])).toBeNull();
  });

  it('show a one-field site only for CVs in that field', () => {
    const teacher = siteSearches({ targetTitles: ['English Teacher'], skills: ['Lesson planning'] }, settings, SRI_LANKA_SITES);
    expect(teacher.find((s) => s.id === 'fatlk')!.links.at(-1)!.url).toBe('https://fat.lk/en/jobs-by-category');
    expect(siteSearches(profile, settings, SRI_LANKA_SITES).find((s) => s.id === 'fatlk')).toBeUndefined();
  });

  it('send people looking abroad to the foreign employment bureau only with Global on', () => {
    expect(siteSearches(profile, settings, GOVERNMENT_SITES, { latest: true }).some((s) => s.id === 'slbfe')).toBe(false);
    expect(siteSearches(profile, { ...settings, global_enabled: true }, GOVERNMENT_SITES, { latest: true }).find((s) => s.id === 'slbfe')).toMatchObject({ area: 'world' });
  });

  it('put LinkedIn first among all sites', () => {
    const all = byPopularity([...siteSearches(profile, settings, SRI_LANKA_SITES), linkedinSite([{ scope: 'local', label: 'A', why: '', facts: [], url: 'https://www.linkedin.com/jobs/search/?keywords=A' }])!]);
    expect(all.slice(0, 3).map((s) => s.id)).toEqual(['linkedin', 'ikman', 'topjobs']);
  });
});
