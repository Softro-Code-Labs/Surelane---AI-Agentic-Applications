import { describe, expect, it } from 'vitest';
import { searchProfile } from '@/lib/cv-terms';
import { searchKeywords } from '@/lib/search/run';
import { siteSearches, SRI_LANKA_SITES } from '@/lib/sites';
import type { CandidateProfile } from '@/lib/cv/parse';

const profile = {
  targetTitles: ['Founder and Full-Stack Software Engineer', 'ICT and Programming Instructor', 'Frontend Developer Intern'],
  skills: ['JavaScript', 'TypeScript', 'Swift', 'React'],
  keywords: ['Founder and Full-Stack Software Engineer', 'ICT and Programming Instructor', 'Frontend Developer Intern', 'JavaScript', 'Swift'],
} as unknown as CandidateProfile;
const settings = { extra_keywords: [] as string[], categories: [] as string[], preferred_locations: [] as string[], remote_pref: 'any' as const, local_enabled: true, global_enabled: false };

describe('roles and skills you hide from searches', () => {
  it('are left out of titles, skills and keywords, whatever their capitals', () => {
    const p = searchProfile(profile, { hidden_keywords: ['ict and programming instructor', 'Swift'] });
    expect(p.targetTitles).toEqual(['Founder and Full-Stack Software Engineer', 'Frontend Developer Intern']);
    expect(p.skills).toEqual(['JavaScript', 'TypeScript', 'React']);
    expect(p.keywords).not.toContain('Swift');
  });

  it('change nothing when none are hidden, or before the database has the setting', () => {
    expect(searchProfile(profile, { hidden_keywords: [] })).toBe(profile);
    expect(searchProfile(profile, {})).toBe(profile);
  });

  it('are never used as search terms or in site search links', () => {
    const p = searchProfile(profile, { hidden_keywords: ['ICT and Programming Instructor', 'Frontend Developer Intern', 'Swift'] });
    const terms = searchKeywords(p, settings);
    expect(terms).toEqual(['Founder and Full-Stack Software Engineer', 'JavaScript', 'TypeScript', 'React']);
    const links = siteSearches(p, settings, SRI_LANKA_SITES).flatMap((s) => s.links.map((l) => l.label));
    expect(links.join(' ')).not.toMatch(/Instructor|Intern|Swift/);
  });
});
