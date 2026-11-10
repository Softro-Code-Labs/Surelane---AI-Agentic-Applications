import { describe, expect, it } from 'vitest';
import type { CandidateProfile } from '@/lib/cv/parse';
import { isLinkedinUrl, linkedinJobId, linkedinJobUrl, linkedinSearchUrl, linkedinSearches } from '@/lib/linkedin';

const profile = (over: Partial<CandidateProfile> = {}) => ({
  experienceLevel: 'Mid level', targetTitles: ['Software Engineer', 'Full Stack Developer (React | Node)', 'Backend Engineer', 'Platform Engineer'],
  skills: ['React', 'TypeScript', 'Node.js', 'PostgreSQL'], ...over,
}) as CandidateProfile;

const settings = {
  extra_keywords: [] as string[], preferred_locations: [] as string[], preferred_countries: [] as string[],
  remote_pref: 'any' as const, local_enabled: true, global_enabled: false, max_post_age_days: 30,
};

const params = (url: string) => Object.fromEntries(new URL(url).searchParams);

describe('LinkedIn searches from the CV', () => {
  it('builds a LinkedIn search link with its filters', () => {
    const url = linkedinSearchUrl({ keywords: 'Software Engineer', location: 'Sri Lanka', experience: [3, 4], workType: [2], posted: 'week' });
    expect(url.startsWith('https://www.linkedin.com/jobs/search/?')).toBe(true);
    expect(params(url)).toEqual({ keywords: 'Software Engineer', location: 'Sri Lanka', f_E: '3,4', f_WT: '2', f_TPR: 'r604800' });
  });

  it('suggests target roles at the CV level, a fresh search, a skills search and a remote search', () => {
    const s = linkedinSearches(profile(), settings);
    expect(s.map((x) => x.label)).toEqual([
      'Software Engineer', 'Full Stack Developer', 'Backend Engineer', 'Software Engineer, posted today',
      'Jobs asking for React, TypeScript or Node.js', 'Software Engineer with React', 'Remote Software Engineer in Sri Lanka',
    ]);
    expect(s.every((x) => x.scope === 'local')).toBe(true);
    expect(params(s[0]!.url)).toMatchObject({ keywords: 'Software Engineer', location: 'Sri Lanka', f_E: '3,4', f_TPR: 'r2592000' });
    expect(params(s[0]!.url).f_WT).toBeUndefined();
    expect(s[0]!.facts).toEqual(['Sri Lanka', 'Associate or Mid-Senior', 'Past month']);
    expect(params(s[3]!.url).f_TPR).toBe('r86400');
    expect(params(s[4]!.url).keywords).toBe('"React" OR "TypeScript" OR "Node.js"');
    expect(params(s[6]!.url).f_WT).toBe('2');
  });

  it('follows your settings: own keywords first, location, work mode, age limit and Global countries', () => {
    const s = linkedinSearches(profile({ experienceLevel: 'Senior' }), {
      ...settings, extra_keywords: ['Tech Lead'], preferred_locations: ['Colombo'], remote_pref: 'hybrid', max_post_age_days: 7,
      global_enabled: true, preferred_countries: ['Singapore', 'Australia', 'Canada'],
    }, 20);
    expect(s[0]!.label).toBe('Tech Lead');
    expect(params(s[0]!.url)).toMatchObject({ location: 'Colombo', f_E: '4', f_WT: '3', f_TPR: 'r604800' });
    const labels = s.map((x) => x.label);
    expect(labels).toEqual(expect.arrayContaining(['Tech Lead in Singapore', 'Tech Lead in Australia', 'Remote Tech Lead, worldwide']));
    expect(labels).not.toContain('Tech Lead in Canada');
    expect(params(s.find((x) => x.label === 'Remote Tech Lead, worldwide')!.url)).toMatchObject({ location: 'Worldwide', f_WT: '2' });
  });

  it('leaves out remote searches for on-site only, never repeats a search, and caps the list', () => {
    const s = linkedinSearches(profile(), { ...settings, remote_pref: 'onsite' });
    expect(s.some((x) => /remote/i.test(x.label))).toBe(false);
    expect(new Set(s.map((x) => x.url)).size).toBe(s.length);
    expect(linkedinSearches(profile(), { ...settings, global_enabled: true, preferred_countries: ['A', 'B'] }, 5)).toHaveLength(5);
  });

  it('follows the Local and Global switches, and keeps room for global searches when both are on', () => {
    const only = (local_enabled: boolean, global_enabled: boolean) => linkedinSearches(profile(), { ...settings, local_enabled, global_enabled });
    const global = only(false, true);
    expect(global.map((x) => x.label)).toEqual([
      'Remote Software Engineer, worldwide', 'Software Engineer, worldwide', 'Remote jobs asking for React, TypeScript or Node.js', 'Remote Full Stack Developer, worldwide',
    ]);
    expect(global.every((x) => x.scope === 'global' && params(x.url).location === 'Worldwide')).toBe(true);
    const both = only(true, true);
    expect(both).toHaveLength(8);
    expect(both.filter((x) => x.scope === 'global')).toHaveLength(3);
    expect(both.slice(0, 5).every((x) => x.scope === 'local')).toBe(true);
    expect(only(false, false)).toEqual([]);
  });

  it('still helps when the CV has no clear role, and gives nothing when it has neither roles nor skills', () => {
    expect(linkedinSearches(profile({ targetTitles: [] }), settings).map((x) => x.label)).toEqual(['Jobs asking for React, TypeScript or Node.js']);
    expect(linkedinSearches(profile({ targetTitles: [], skills: [] }), settings)).toEqual([]);
  });
});

describe('LinkedIn job links you paste', () => {
  it('finds the job in every kind of link LinkedIn gives you', () => {
    expect(linkedinJobId('https://www.linkedin.com/jobs/view/4012345678/')).toBe('4012345678');
    expect(linkedinJobId('https://www.linkedin.com/jobs/view/4012345678/?refId=abc&trackingId=x%3D%3D')).toBe('4012345678');
    expect(linkedinJobId('https://lk.linkedin.com/jobs/view/senior-engineer-at-acme-4012345678')).toBe('4012345678');
    expect(linkedinJobId('https://www.linkedin.com/comm/jobs/view/4012345678/?trk=eml')).toBe('4012345678');
    expect(linkedinJobId('https://www.linkedin.com/jobs/search/?currentJobId=4012345678&keywords=engineer')).toBe('4012345678');
    expect(linkedinJobId('https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4012345678')).toBe('4012345678');
  });

  it('rejects links that are not one LinkedIn job', () => {
    expect(linkedinJobId('https://www.linkedin.com/jobs/search/?keywords=engineer')).toBeNull();
    expect(linkedinJobId('https://www.linkedin.com/company/acme/')).toBeNull();
    expect(linkedinJobId('https://linkedin.com.evil.example/jobs/view/4012345678/')).toBeNull();
    expect(linkedinJobId('https://evil.example/?currentJobId=4012345678')).toBeNull();
    expect(linkedinJobId('not a link')).toBeNull();
  });

  it('tells LinkedIn links apart and rebuilds a clean job link', () => {
    expect(isLinkedinUrl('https://lk.linkedin.com/jobs/view/1')).toBe(true);
    expect(isLinkedinUrl('https://notlinkedin.com/jobs/view/1')).toBe(false);
    expect(linkedinJobUrl('4012345678')).toBe('https://www.linkedin.com/jobs/view/4012345678/');
  });
});
