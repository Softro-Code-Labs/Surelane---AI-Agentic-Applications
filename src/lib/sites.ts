import type { CandidateProfile } from './cv/parse';
import { cvDistrict, cvRoles, cvSkills } from './cv-terms';
import type { Settings } from './settings';

/*
 * Sri Lankan job sites that Surelane must not, or cannot, read automatically.
 * It builds searches on them from your CV instead, which you open in your own
 * browser. Each reason was checked against the site's terms, robots rules and
 * feeds in November 2026. Search addresses come from each site's own search
 * form or its published search template, and were opened once to confirm them,
 * except where a note says otherwise.
 *
 * Sites marked automatic publish a job feed that Surelane also reads by itself
 * (see sources/adapters.ts). They are listed for their search, which reaches
 * further back than a feed's newest jobs. ITPro.lk is read automatically and
 * has no search address, so it is not listed.
 */

/** lk = jobs in Sri Lanka (Local), world = jobs abroad (Global). */
export type Reach = 'lk' | 'world';
export type SiteQuery = { keyword: string; district: string | null; remote: boolean; where: Reach };
export type JobSite = {
  id: string;
  label: string;
  home: string;
  /** Why Surelane does not read it automatically. */
  reason: string;
  /** Builds a search on the site, or null when this keyword cannot be searched there. Absent when no search address could be confirmed. */
  search?: (q: SiteQuery) => string | null;
  /** Also read automatically, so it is not listed under Not searched. 'key' = once its API key is added. */
  automatic?: boolean | 'key';
  /** Which jobs its searches reach. Sri Lankan sites reach only lk. */
  reach?: Reach[];
};

const enc = encodeURIComponent;
const slug = (s: string) => s.toLowerCase().replace(/\s+/g, '-');

export const SRI_LANKA_SITES: JobSite[] = [
  {
    // Refuses connections from automated tools, so its search address could not be checked.
    id: 'topjobs', label: 'TopJobs.lk', home: 'https://www.topjobs.lk/',
    reason: 'It refuses connections from automated tools. Its search address could not be confirmed, so this opens its home page.',
  },
  {
    // Address template from ikman's own llms.txt and search form.
    id: 'ikman', label: 'ikman Jobs', home: 'https://ikman.lk/en/ads/sri-lanka/jobs',
    reason: 'Its terms forbid copying or storing its content without written permission.',
    search: (q) => `https://ikman.lk/en/ads/${q.district ? slug(q.district) : 'sri-lanka'}/jobs?query=${enc(q.keyword)}`,
  },
  {
    // Read from the site's app code: its job list takes a keyword parameter.
    id: 'xpressjobs', label: 'XpressJobs', home: 'https://xpress.jobs/jobs',
    reason: 'It publishes no feed or API, and its pages need a full browser to load.',
    search: (q) => `https://xpress.jobs/jobs?keyword=${enc(q.keyword)}`,
  },
  {
    id: 'rooster', label: 'Rooster Jobs', home: 'https://rooster.jobs/',
    reason: 'Its terms forbid scraping, and it has no search address to link to, so this opens its job list.',
  },
  {
    id: 'jobpal', label: 'Jobpal.lk', home: 'https://jobpal.lk/local-jobs/', automatic: true,
    reason: 'Read automatically through its job feed.',
    search: (q) => `https://jobpal.lk/local-jobs/?search_keywords=${enc(q.keyword)}`,
  },
  {
    id: 'jobmasters', label: 'JobMasters.lk', home: 'https://jobmasters.lk/jobs-listing/',
    reason: 'Its terms forbid crawling and scraping, even though it publishes a feed.',
    search: (q) => `https://jobmasters.lk/jobs-listing/?search_title=${enc(q.keyword)}&location=${enc(q.district ?? '')}`,
  },
  {
    id: 'dreamjobs', label: 'DreamJobs.lk', home: 'https://dreamjobs.lk/',
    reason: 'Its terms forbid robots and scraping.',
    search: (q) => `https://dreamjobs.lk/search?q=${enc(q.keyword)}`,
  },
  {
    id: 'observerjobs', label: 'Observer Jobs', home: 'https://observerjobs.lk/vacancies',
    reason: 'It publishes no feed or API, and its pages, including its terms, need a full browser to load.',
    search: (q) => `https://observerjobs.lk/vacancies?keyword=${enc(q.keyword)}`,
  },
  {
    id: 'finders', label: 'Finders.lk', home: 'https://finders.lk/job',
    reason: 'It publishes no feed, API or terms, so permitted automated access could not be confirmed.',
    search: (q) => `https://finders.lk/keyword-search?keyword_data=${enc(q.keyword)}&location_data=`,
  },
  {
    // Address from the site's own search template. It refuses automated tools, so it could not be opened to confirm.
    id: 'rakiya', label: 'Rakiya.lk', home: 'https://rakiya.lk/',
    reason: 'It refuses requests from automated tools.',
    search: (q) => `https://rakiya.lk/search?q=${enc(q.keyword)}`,
  },
  {
    id: 'agency', label: 'Agency.lk', home: 'https://agency.lk/jobs',
    reason: 'Its terms forbid automated scraping without written permission.',
    search: (q) => `https://agency.lk/jobs?q=${enc(q.keyword)}${q.district ? `&location=${enc(q.district)}` : ''}${q.remote ? '&workMode=Remote' : ''}`,
  },
  {
    id: 'betterjobs', label: 'BetterJobs.lk', home: 'https://betterjobs.lk/jobs',
    reason: 'Its terms forbid scraping and copying listings in bulk.',
    search: (q) => `https://betterjobs.lk/jobs?q=${enc(q.keyword)}${q.district ? `&location=${enc(q.district)}` : ''}`,
  },
  {
    id: 'jobify', label: 'Jobify.lk', home: 'https://jobify.lk/jobs',
    reason: 'It publishes no feed, and its data service is closed to automated tools.',
    search: (q) => `https://jobify.lk/jobs?q=${enc(q.keyword)}${q.district ? `&district=${enc(q.district)}` : ''}${q.remote ? '&work=remote' : ''}`,
  },
  {
    // Address from the site's own search template.
    id: 'lankatalenthub', label: 'LankaTalentHub', home: 'https://lankatalenthub.lk/',
    reason: 'Its terms forbid automated scraping.',
    search: (q) => `https://lankatalenthub.lk/?q=${enc(q.keyword)}`,
  },
];

/*
 * Government vacancy sites, kept apart from the private job sites. Checked in
 * November 2026, the same way as the list above.
 */
export const GOVERNMENT_SITES: JobSite[] = [
  {
    id: 'govjobs', label: 'Govjobs.lk', home: 'https://www.govjobs.lk/', automatic: true,
    reason: 'Read automatically through its feed.',
    search: (q) => `https://www.govjobs.lk/?s=${enc(q.keyword)}`,
  },
  {
    // Its search address returns "page not found", so this opens its newest vacancies.
    id: 'govdoc', label: 'Govdoc Jobs', home: 'https://job.govdoc.lk/', automatic: true,
    reason: 'Read automatically through its feed.',
  },
  {
    // It can filter only by institution, using its own codes, so there is no search to build.
    id: 'governmentjobs', label: 'GovernmentJobs.lk', home: 'https://governmentjobs.lk/',
    reason: 'It publishes no feed, API or terms, so permitted automated access could not be confirmed. It has no keyword search, so this opens its newest vacancies.',
  },
  {
    id: 'govhub', label: 'GovHub Jobs', home: 'https://jobs.govhub.lk/',
    reason: 'It publishes no feed, API or terms, so permitted automated access could not be confirmed.',
    search: (q) => `https://jobs.govhub.lk/index.php?search=${enc(q.keyword)}&category_id=&institute_id=`,
  },
  {
    id: 'jobslanka', label: 'JobsLanka', home: 'https://jobslanka.lk/',
    reason: 'Its terms forbid copying or scraping its content in bulk.',
    search: (q) => `https://jobslanka.lk/?search=${enc(q.keyword)}${q.district ? `&district=${enc(q.district)}` : ''}`,
  },
];

/*
 * International platforms. Some reach both Sri Lanka and the world, and get a
 * search for each switched-on scope. Checked in November 2026: Jobicy's and
 * Remotive's addresses were opened to confirm them, and Remote OK's for its
 * known tags. Indeed and Glassdoor ask automated tools not to open search pages,
 * and Jooble and Himalayas refused this check, so their addresses follow each
 * site's long-standing public format and could not be opened to confirm them.
 */
export const GLOBAL_SITES: JobSite[] = [
  {
    id: 'indeed', label: 'Indeed', home: 'https://www.indeed.com/', reach: ['lk', 'world'],
    reason: 'Its public job-search API was withdrawn, and remaining APIs do not read listings.',
    search: (q) => `https://www.indeed.com/jobs?q=${enc(q.keyword)}${q.where === 'lk' ? '&l=Sri+Lanka' : ''}`,
  },
  {
    id: 'glassdoor', label: 'Glassdoor', home: 'https://www.glassdoor.com/Job/index.htm', reach: ['world'],
    reason: 'No public job-search API is available.',
    search: (q) => `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${enc(q.keyword)}`,
  },
  {
    id: 'jooble', label: 'Jooble', home: 'https://jooble.org/', reach: ['lk', 'world'], automatic: 'key',
    reason: 'Searched automatically once you add a free Jooble key.',
    search: (q) => `https://jooble.org/SearchResult?ukw=${enc(q.keyword)}${q.where === 'lk' ? '&rgns=Sri%20Lanka' : ''}`,
  },
  {
    id: 'himalayas', label: 'Himalayas', home: 'https://himalayas.app/jobs', reach: ['lk', 'world'], automatic: true,
    reason: 'Searched automatically through its API.',
    search: (q) => (q.where === 'lk' ? `https://himalayas.app/jobs/countries/sri-lanka?q=${enc(q.keyword)}` : `https://himalayas.app/jobs?q=${enc(q.keyword)}`),
  },
  {
    id: 'jobicy', label: 'Jobicy', home: 'https://jobicy.com/jobs/', reach: ['world'], automatic: true,
    reason: 'Searched automatically through its API.',
    search: (q) => `https://jobicy.com/jobs/?search_keywords=${enc(q.keyword)}`,
  },
  {
    id: 'remotive', label: 'Remotive', home: 'https://remotive.com/remote-jobs', reach: ['world'], automatic: true,
    reason: 'Searched automatically through its API.',
    search: (q) => `https://remotive.com/remote-jobs?query=${enc(q.keyword)}`,
  },
  {
    // Remote OK searches by tag, such as /remote-react-jobs. An unknown tag opens its home page, so only one-word terms are tried.
    id: 'remoteok', label: 'Remote OK', home: 'https://remoteok.com/', reach: ['world'], automatic: true,
    reason: 'Searched automatically through its API.',
    search: (q) => (/^[a-z0-9]+$/i.test(q.keyword) ? `https://remoteok.com/remote-${q.keyword.toLowerCase()}-jobs` : null),
  },
];

export type SiteLink = { label: string; url: string };
export type SiteSearch = { id: string; label: string; automatic: boolean | 'key'; links: SiteLink[] };
const WHERE_LABEL: Record<Reach, string> = { lk: 'Sri Lanka', world: 'Worldwide' };

/**
 * Searches on each site, built from your CV's top roles and skill and from your search settings.
 * With latest, each site also gets a link to its newest vacancies, which suits government sites:
 * their job titles rarely match the wording of a private-sector CV.
 */
export function siteSearches(
  p: Pick<CandidateProfile, 'targetTitles' | 'skills'>, s: Pick<Settings, 'extra_keywords' | 'preferred_locations' | 'remote_pref' | 'local_enabled' | 'global_enabled'>,
  sites: JobSite[] = SRI_LANKA_SITES, { latest = false } = {},
): SiteSearch[] {
  const roles = cvRoles(p, s, 2);
  const skills = cvSkills(p, 3);
  const words = [...roles, ...skills.filter((k) => !roles.some((r) => r.toLowerCase().includes(k.toLowerCase())))].slice(0, 3);
  const district = cvDistrict(s);
  const remote = s.remote_pref === 'remote';
  return sites.flatMap((site) => {
    // A site appears only when it reaches a scope that is switched on, and searches only that scope.
    const reaches = (site.reach ?? ['lk']).filter((r) => (r === 'lk' ? s.local_enabled : s.global_enabled));
    if (!reaches.length) return [];
    // Tag-based sites search by skill; the rest by role first.
    const terms = site.id === 'remoteok' ? [...new Set([...skills, ...words])] : words;
    const searches = reaches.flatMap((where) => {
      const links = terms.flatMap((keyword) => {
        const url = site.search?.({ keyword, district, remote, where });
        return url ? [{ label: reaches.length > 1 ? `${keyword} · ${WHERE_LABEL[where]}` : keyword, url }] : [];
      });
      return links.slice(0, reaches.length > 1 ? 2 : 3);
    });
    const browse = { label: latest ? 'Latest vacancies' : `Browse ${site.label}`, url: site.home };
    return [{ id: site.id, label: site.label, automatic: site.automatic ?? false, links: searches.length && !latest ? searches : [...searches, browse] }];
  });
}

/** One search on a site, for a single term, as the Job sources page offers. */
export function siteSearchUrl(site: JobSite, term: string): string {
  const where: Reach = (site.reach ?? ['lk']).includes('lk') ? 'lk' : 'world';
  return (term && site.search?.({ keyword: term, district: null, remote: false, where })) || site.home;
}
