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
 * Sites marked automatic publish a job feed or public job pages that Surelane
 * also reads by itself (see sources/adapters.ts). They are listed for their search, which reaches
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
  /** Also read automatically, so it is not listed under Not searched. */
  automatic?: boolean;
  /** Which jobs its searches reach. Sri Lankan sites reach only lk. */
  reach?: Reach[];
  /**
   * Its Tranco rank (tranco-list.eu, a research ranking of the most visited sites,
   * looked up 13 November 2026), used to list the most popular sites first.
   * Absent when the site is outside Tranco's top million.
   */
  popularity?: number;
  /** For a site serving one field only: shown only when the CV's roles or skills match. */
  field?: RegExp;
};

const enc = encodeURIComponent;
const slug = (s: string) => s.toLowerCase().replace(/\s+/g, '-');
/** "Senior Accountant" to "senior-accountant", for sites that put the keyword in the path. */
const slugOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** CVs in these fields see the boards that serve only that field. */
const TEACHING = /teach|tutor|lectur|instructor|educat|school|trainer|academic/i;
const HEALTH = /nurs|doctor|physician|medical|health|clinic|pharmac|midwi|physio|care assistant|radiograph|laborator/i;
const HOSPITALITY = /chef|cook|hotel|hospitality|restaurant|waiter|steward|bartend|barista|housekeep|front office|kitchen|f&b|food and beverage/i;

export const SRI_LANKA_SITES: JobSite[] = [
  {
    // Refuses connections from automated tools. Its keyword search (txtKeyWord, FA=AV for all
    // categories) was confirmed by hand in a browser in November 2026.
    id: 'topjobs', label: 'TopJobs.lk', popularity: 22291, home: 'https://www.topjobs.lk/',
    reason: 'It refuses connections from automated tools.',
    search: (q) => `https://www.topjobs.lk/applicant/vacancybyfunctionalarea.jsp?FA=AV&txtKeyWord=${enc(q.keyword)}`,
  },
  {
    // Address template from ikman's own llms.txt and search form.
    id: 'ikman', label: 'ikman Jobs', popularity: 7958, home: 'https://ikman.lk/en/ads/sri-lanka/jobs',
    reason: 'Its terms forbid copying or storing its content without written permission.',
    search: (q) => `https://ikman.lk/en/ads/${q.district ? slug(q.district) : 'sri-lanka'}/jobs?query=${enc(q.keyword)}`,
  },
  {
    // Read from the site's app code: its job list takes a keyword parameter.
    id: 'xpressjobs', label: 'XpressJobs', popularity: 840953, home: 'https://xpress.jobs/jobs',
    reason: 'It publishes no feed or API, and its pages need a full browser to load.',
    search: (q) => `https://xpress.jobs/jobs?keyword=${enc(q.keyword)}`,
  },
  {
    // Search address from its own search box, confirmed in a browser in November 2026.
    id: 'rooster', label: 'Rooster Jobs', popularity: 1712194, home: 'https://rooster.jobs/',
    reason: 'Its terms forbid scraping.',
    search: (q) => `https://rooster.jobs/?query=${enc(q.keyword)}`,
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
    id: 'dreamjobs', label: 'DreamJobs.lk', popularity: 3354419, home: 'https://dreamjobs.lk/',
    reason: 'Its terms forbid robots and scraping.',
    search: (q) => `https://dreamjobs.lk/search?q=${enc(q.keyword)}`,
  },
  {
    id: 'observerjobs', label: 'Observer Jobs', popularity: 2870840, home: 'https://observerjobs.lk/vacancies', automatic: true,
    reason: 'Read automatically from its public vacancy pages.',
    search: (q) => `https://observerjobs.lk/vacancies?keyword=${enc(q.keyword)}`,
  },
  {
    id: 'finders', label: 'Finders.lk', popularity: 874200, home: 'https://finders.lk/job', automatic: true,
    reason: 'Read automatically from its public job pages.',
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
    // Its remote jobs are read automatically; jobs posted on Jobify itself load from a data service its robots rules close to tools.
    id: 'jobify', label: 'Jobify.lk', home: 'https://jobify.lk/jobs', automatic: true,
    reason: 'Its remote jobs are read automatically from its public pages.',
    search: (q) => `https://jobify.lk/jobs?q=${enc(q.keyword)}${q.district ? `&district=${enc(q.district)}` : ''}${q.remote ? '&work=remote' : ''}`,
  },
  {
    // Address from the site's own search template.
    id: 'lankatalenthub', label: 'LankaTalentHub', home: 'https://lankatalenthub.lk/',
    reason: 'Its terms forbid automated scraping.',
    search: (q) => `https://lankatalenthub.lk/?q=${enc(q.keyword)}`,
  },
  // Added from the November 2026 survey. Each search address was confirmed in a browser with a real keyword.
  // Their terms have not been reviewed, so none of them is read automatically.
  {
    id: 'jobhub', label: 'JobHub.lk', popularity: 1395524, home: 'https://jobhub.lk/',
    reason: 'Not yet checked for permitted automated access. It publishes no feed.',
    search: (q) => `https://jobhub.lk/en/Sri%20Lanka/search?q=${enc(q.keyword)}`,
  },
  {
    id: 'hotjobs', label: 'HotJobs.lk', home: 'https://hotjobs.lk/jobs',
    reason: 'Not yet checked for permitted automated access. It publishes no feed.',
    search: (q) => `https://hotjobs.lk/jobs?search=${enc(q.keyword)}`,
  },
  {
    id: 'jobportal', label: 'JobPortal LK', home: 'https://jobportal.com.lk/jobs',
    reason: 'Not yet checked for permitted automated access. It publishes no feed.',
    search: (q) => `https://jobportal.com.lk/jobs?q=${enc(q.keyword)}${q.district ? `&district=${enc(q.district)}` : ''}`,
  },
  {
    // Its keyword search returns almost nothing, so this opens its newest vacancies.
    id: 'lankacareer', label: 'Lanka Career', popularity: 1503620, home: 'https://lankacareer.lk/',
    reason: 'Its terms forbid scraping or copying content in ways that violate the rights of its owners.',
  },
  {
    // Teaching and tutoring only. Its search page sits behind a bot check, so this opens its teaching jobs.
    id: 'fatlk', label: 'FAT.lk (teaching)', popularity: 321998, home: 'https://fat.lk/en/jobs-by-category',
    field: TEACHING,
    reason: 'Its search pages sit behind a bot check.',
  },
  {
    // UN agencies, NGOs and development banks hiring in Sri Lanka.
    id: 'unjobnet', label: 'UN and NGO jobs (UNJobNet)', popularity: 169888, home: 'https://www.unjobnet.org/countries/Sri%20Lanka',
    reason: 'Not yet checked for permitted automated access.',
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
    id: 'govdoc', label: 'Govdoc Jobs', popularity: 195396, home: 'https://job.govdoc.lk/', automatic: true,
    reason: 'Read automatically through its feed.',
  },
  {
    // It can filter only by institution, using its own codes, so there is no search to build.
    id: 'governmentjobs', label: 'GovernmentJobs.lk', popularity: 780663, home: 'https://governmentjobs.lk/',
    reason: 'It publishes no feed, API or terms, so permitted automated access could not be confirmed. It has no keyword search, so this opens its newest vacancies.',
  },
  {
    id: 'govhub', label: 'GovHub Jobs', home: 'https://jobs.govhub.lk/', automatic: true,
    reason: 'Read automatically from the public page that lists all its vacancies.',
    search: (q) => `https://jobs.govhub.lk/index.php?search=${enc(q.keyword)}&category_id=&institute_id=`,
  },
  {
    id: 'jobslanka', label: 'JobsLanka', home: 'https://jobslanka.lk/',
    reason: 'Its terms forbid copying or scraping its content in bulk.',
    search: (q) => `https://jobslanka.lk/?search=${enc(q.keyword)}${q.district ? `&district=${enc(q.district)}` : ''}`,
  },
  // Added from the November 2026 survey.
  {
    id: 'gazettelk', label: 'Gazette.lk', popularity: 206995, home: 'https://www.gazette.lk/', automatic: true,
    reason: 'Read automatically through its feed.',
    search: (q) => `https://www.gazette.lk/?s=${enc(q.keyword)}`,
  },
  {
    // Its keyword search sends you back to the home page, so this opens its newest vacancies.
    id: 'nearjobs', label: 'NearJobs.lk', popularity: 805349, home: 'https://nearjobs.lk/', automatic: true,
    reason: 'Read automatically through its feed.',
  },
  {
    id: 'ceylonvacancy', label: 'Ceylon Vacancy', popularity: 213797, home: 'https://ceylonvacancy.com/',
    reason: 'Its terms forbid republishing, copying or redistributing its material.',
    search: (q) => `https://ceylonvacancy.com/?s=${enc(q.keyword)}`,
  },
  {
    // Official notices; it has no keyword search.
    id: 'psc', label: 'Public Service Commission', popularity: 1706848, home: 'https://www.psc.gov.lk/',
    reason: 'An official notice site with no job feed.',
  },
  {
    // For people looking for work abroad. Its online job bank has been down since 2024, so this opens its notices.
    id: 'slbfe', label: 'SLBFE (foreign employment)', popularity: 85423, home: 'https://www.slbfe.lk/', reach: ['world'],
    reason: 'An official notice site; its online job bank is not working.',
  },
];

/*
 * International platforms. Some reach both Sri Lanka and the world, and get a
 * search for each switched-on scope. Checked in November 2026: Jobicy's and
 * Remotive's addresses were opened to confirm them, and Remote OK's for its
 * known tags. Indeed and Glassdoor ask automated tools not to open search pages,
 * and Himalayas refused this check, so their addresses follow each
 * site's long-standing public format and could not be opened to confirm them.
 */
export const GLOBAL_SITES: JobSite[] = [
  {
    // Indeed has no Sri Lankan site, so a "Sri Lanka" search on indeed.com finds few local jobs. It is offered for jobs abroad only.
    id: 'indeed', label: 'Indeed', popularity: 436, home: 'https://www.indeed.com/', reach: ['world'],
    reason: 'Its public job-search API was withdrawn, and remaining APIs do not read listings.',
    search: (q) => `https://www.indeed.com/jobs?q=${enc(q.keyword)}${q.where === 'lk' ? '&l=Sri+Lanka' : ''}`,
  },
  {
    id: 'glassdoor', label: 'Glassdoor', popularity: 2945, home: 'https://www.glassdoor.com/Job/index.htm', reach: ['world'],
    reason: 'No public job-search API is available.',
    search: (q) => `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${enc(q.keyword)}`,
  },
  {
    id: 'himalayas', label: 'Himalayas', popularity: 64522, home: 'https://himalayas.app/jobs', reach: ['lk', 'world'], automatic: true,
    reason: 'Searched automatically through its API.',
    search: (q) => (q.where === 'lk' ? `https://himalayas.app/jobs/countries/sri-lanka?q=${enc(q.keyword)}` : `https://himalayas.app/jobs?q=${enc(q.keyword)}`),
  },
  {
    id: 'jobicy', label: 'Jobicy', popularity: 247544, home: 'https://jobicy.com/jobs/', reach: ['world'], automatic: true,
    reason: 'Searched automatically through its API.',
    search: (q) => `https://jobicy.com/jobs/?search_keywords=${enc(q.keyword)}`,
  },
  {
    id: 'remotive', label: 'Remotive', popularity: 97111, home: 'https://remotive.com/remote-jobs', reach: ['world'], automatic: true,
    reason: 'Searched automatically through its API.',
    search: (q) => `https://remotive.com/remote-jobs?query=${enc(q.keyword)}`,
  },
  {
    // Remote OK searches by tag, such as /remote-react-jobs. An unknown tag opens its home page, so only one-word terms are tried.
    id: 'remoteok', label: 'Remote OK', popularity: 60492, home: 'https://remoteok.com/', reach: ['world'], automatic: true,
    reason: 'Searched automatically through its API.',
    search: (q) => (/^[a-z0-9]+$/i.test(q.keyword) ? `https://remoteok.com/remote-${q.keyword.toLowerCase()}-jobs` : null),
  },
  /*
   * Added from the November 2026 international survey (reports/). Each search address was
   * confirmed in a browser with a real keyword; sites behind a bot check, or whose search did
   * not filter, open their job list instead. All are for jobs abroad, so they follow Global.
   */
  {
    id: 'wwr', label: 'We Work Remotely', popularity: 32230, home: 'https://weworkremotely.com/', reach: ['world'], automatic: true,
    reason: 'Read automatically through its public feed.',
    search: (q) => `https://weworkremotely.com/remote-jobs/search?term=${enc(q.keyword)}`,
  },
  {
    id: 'workingnomads', label: 'Working Nomads', popularity: 158661, home: 'https://www.workingnomads.com/jobs', reach: ['world'],
    reason: 'Its terms forbid using the service to build a competing product.',
  },
  {
    id: 'remoteco', label: 'Remote.co', popularity: 63290, home: 'https://remote.co/remote-jobs/', reach: ['world'],
    reason: 'Not yet checked for permitted automated access.',
  },
  {
    id: 'dynamite', label: 'Dynamite Jobs', popularity: 398934, home: 'https://dynamitejobs.com/remote-jobs', reach: ['world'],
    reason: 'Not yet checked for permitted automated access.',
  },
  // Working abroad: the Gulf, the Maldives and Asia are where most Sri Lankans who work overseas go.
  {
    id: 'bayt', label: 'Bayt (Gulf)', popularity: 30116, home: 'https://www.bayt.com/en/international/jobs/', reach: ['world'],
    reason: 'It blocks automated tools.',
    search: (q) => `https://www.bayt.com/en/international/jobs/${slugOf(q.keyword)}-jobs/`,
  },
  {
    id: 'gulftalent', label: 'GulfTalent', popularity: 48927, home: 'https://www.gulftalent.com/jobs', reach: ['world'],
    reason: 'It blocks automated tools.',
    search: (q) => `https://www.gulftalent.com/jobs/search?search_keyword=${enc(q.keyword)}`,
  },
  {
    id: 'jobmaldives', label: 'Job-Maldives', popularity: 557901, home: 'https://www.job-maldives.com/', reach: ['world'],
    reason: 'Not yet checked for permitted automated access.',
    search: (q) => `https://www.job-maldives.com/search?q=${enc(q.keyword)}`,
  },
  {
    id: 'careermaldives', label: 'Career-Maldives', popularity: 1379899, home: 'https://career-maldives.com/', reach: ['world'],
    reason: 'Its feed refuses automated tools.',
  },
  {
    id: 'mycareersfuture', label: 'MyCareersFuture (Singapore)', popularity: 70857, home: 'https://www.mycareersfuture.gov.sg/', reach: ['world'],
    reason: 'No public job feed.',
    search: (q) => `https://www.mycareersfuture.gov.sg/search?search=${enc(q.keyword)}`,
  },
  {
    id: 'jobstreet', label: 'JobStreet (Malaysia)', popularity: 4728, home: 'https://my.jobstreet.com/', reach: ['world'],
    reason: 'Its pages sit behind a bot check.',
  },
  {
    id: 'seek', label: 'SEEK (Australia)', popularity: 13069, home: 'https://www.seek.com.au/', reach: ['world'],
    reason: 'Its pages sit behind a bot check.',
  },
  {
    id: 'reed', label: 'Reed (UK)', popularity: 15673, home: 'https://www.reed.co.uk/jobs', reach: ['world'],
    reason: 'Its API needs a key and is limited to UK jobs.',
    search: (q) => `https://www.reed.co.uk/jobs/${slugOf(q.keyword)}-jobs`,
  },
  {
    id: 'jobbank', label: 'Job Bank (Canada)', popularity: 18659, home: 'https://www.jobbank.gc.ca/', reach: ['world'],
    reason: 'No public job feed for this search.',
    search: (q) => `https://www.jobbank.gc.ca/jobsearch/jobsearch?searchstring=${enc(q.keyword)}`,
  },
  {
    // europa.eu's traffic rank covers all EU sites, so it is not used here.
    id: 'eures', label: 'EURES (EU)', home: 'https://eures.europa.eu/index_en', reach: ['world'],
    reason: 'No simple job search address to link to.',
  },
  // One field only: shown just to CVs in that field.
  {
    id: 'nhs', label: 'NHS Jobs (UK health)', popularity: 19097, home: 'https://www.jobs.nhs.uk/', reach: ['world'], field: HEALTH,
    reason: 'No public job feed for this search.',
    search: (q) => `https://www.jobs.nhs.uk/candidate/search/results?keyword=${enc(q.keyword)}`,
  },
  {
    id: 'tes', label: 'TES (teaching)', popularity: 12920, home: 'https://www.tes.com/jobs/', reach: ['world'], field: TEACHING,
    reason: 'No public job feed.',
    search: (q) => `https://www.tes.com/jobs/search?keywords=${enc(q.keyword)}`,
  },
  {
    id: 'teachaway', label: 'Teach Away', popularity: 185591, home: 'https://www.teachaway.com/teaching-jobs-abroad', reach: ['world'], field: TEACHING,
    reason: 'No public job feed.',
  },
  {
    id: 'caterer', label: 'Caterer.com (hospitality)', popularity: 38886, home: 'https://www.caterer.com/', reach: ['world'], field: HOSPITALITY,
    reason: 'No public job feed.',
    search: (q) => `https://www.caterer.com/jobs/${slugOf(q.keyword)}`,
  },
  {
    id: 'hosco', label: 'Hosco (hospitality)', popularity: 155680, home: 'https://www.hosco.com/en/jobs', reach: ['world'], field: HOSPITALITY,
    reason: 'Its pages sit behind a bot check.',
  },
  // NGO, UN and development.
  {
    // Read automatically once RELIEFWEB_APPNAME is set (see sources/adapters.ts); the link works either way.
    id: 'reliefweb', label: 'ReliefWeb (NGO and UN)', popularity: 6182, home: 'https://reliefweb.int/jobs', reach: ['lk', 'world'], automatic: true,
    reason: 'Read automatically once its approved app name is added.',
  },
  {
    id: 'idealist', label: 'Idealist (non-profit)', popularity: 16991, home: 'https://www.idealist.org/en/jobs', reach: ['world'],
    reason: 'No public job feed.',
    search: (q) => `https://www.idealist.org/en/jobs?q=${enc(q.keyword)}`,
  },
  {
    id: 'uncareers', label: 'UN Careers', home: 'https://careers.un.org/jobopening?language=en', reach: ['world'],
    reason: 'No public job feed.',
  },
];

/** A search link. title explains it, shown on hover. */
export type SiteLink = { label: string; url: string; title?: string };
/** area: whose jobs its searches here reach, following the Local and Global switches. */
export type SiteSearch = { id: string; label: string; automatic: boolean; links: SiteLink[]; popularity: number | null; area: 'lk' | 'world' | 'both' };
const WHERE_LABEL: Record<Reach, string> = { lk: 'Sri Lanka', world: 'Worldwide' };

/** Most popular first; sites outside the ranking keep their listed order, after the ranked ones. */
export function byPopularity(sites: SiteSearch[]): SiteSearch[] {
  return sites.map((s, i) => ({ s, i }))
    .sort((a, b) => (a.s.popularity ?? Infinity) - (b.s.popularity ?? Infinity) || a.i - b.i)
    .map(({ s }) => s);
}

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
  const cvText = [...p.targetTitles, ...s.extra_keywords, ...p.skills].join(' ');
  return sites.flatMap((site) => {
    // A site serving one field appears only for CVs in that field.
    if (site.field && !site.field.test(cvText)) return [];
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
    return [{
      id: site.id, label: site.label, automatic: site.automatic ?? false, links: searches.length && !latest ? searches : [...searches, browse],
      popularity: site.popularity ?? null, area: reaches.length > 1 ? 'both' : reaches[0]!,
    }];
  });
}

/** One search on a site, for a single term, as the Job sources page offers. */
export function siteSearchUrl(site: JobSite, term: string): string {
  const where: Reach = (site.reach ?? ['lk']).includes('lk') ? 'lk' : 'world';
  return (term && site.search?.({ keyword: term, district: null, remote: false, where })) || site.home;
}
