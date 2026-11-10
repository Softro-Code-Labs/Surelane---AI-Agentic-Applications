import type { Metadata } from 'next';
import Link from 'next/link';
import { AddJob } from '@/components/Forms';
import { JobRow } from '@/components/JobRow';
import { SiteSearches } from '@/components/SiteSearches';
import { Empty, Page, PageHead } from '@/components/ui';
import { recommended, type JobFilters } from '@/lib/jobs';
import { linkedinSearches } from '@/lib/linkedin';
import { GLOBAL_SITES, GOVERNMENT_SITES, siteSearches } from '@/lib/sites';
import { one } from '@/lib/db';
import { SCOPE_OFF, getCv, getSettings, searchesOff } from '@/lib/settings';

export const metadata: Metadata = { title: 'Jobs' };

const GROUPS: { key: keyof JobFilters; label: string; options: [string, string][] }[] = [
  { key: 'tier', label: 'Match', options: [['Strong', 'Strong'], ['Good', 'Good'], ['Potential', 'Potential']] },
  { key: 'market', label: 'Scope', options: [['local', 'Local'], ['global', 'Global']] },
  { key: 'sector', label: 'Sector', options: [['government', 'Government'], ['private', 'Private']] },
  { key: 'mode', label: 'Work', options: [['remote', 'Remote']] },
  { key: 'type', label: 'Hours', options: [['full', 'Full-time'], ['part', 'Part-time']] },
  { key: 'recent', label: 'Posted', options: [['1', 'Last 7 days']] },
];

export default async function Jobs({ searchParams }: { searchParams: Promise<JobFilters> }) {
  const f = await searchParams;
  const s = await getSettings();
  const [jobs, cv, searched] = await Promise.all([recommended(s, f), getCv(), one(`SELECT 1 FROM search_runs LIMIT 1`)]);
  const href = (key: keyof JobFilters, value: string) => {
    const next = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]);
    if (f[key] === value) next.delete(key); else next.set(key, value);
    const qs = next.toString();
    return qs ? `/jobs?${qs}` : '/jobs';
  };
  const active = Object.values(f).some(Boolean);
  const linkedin = cv ? linkedinSearches(cv.profile, s) : [];
  const sites = cv ? siteSearches(cv.profile, s) : [];
  const government = cv ? siteSearches(cv.profile, s, GOVERNMENT_SITES, { latest: true }) : [];
  const international = cv ? siteSearches(cv.profile, s, GLOBAL_SITES) : [];
  return (
    <Page>
      <PageHead title="Jobs for you" intro={`${jobs.length} open ${jobs.length === 1 ? 'vacancy' : 'vacancies'} at ${s.min_score}% or above, each confirmed open in the last 3 days.`} action={<AddJob />} />
      <nav aria-label="Filter jobs" className="-mx-4 mb-3 flex items-center gap-x-5 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:gap-y-2 sm:overflow-visible sm:px-0">
        {GROUPS.filter((g) => (g.key !== 'market' || (s.local_enabled && s.global_enabled)) && (g.key !== 'sector' || s.local_enabled)).map((g) => (
          <div key={g.key} className="chips shrink-0" role="group" aria-label={g.label}>
            <span className="text-sm text-soft">{g.label}</span>
            {g.options.map(([v, l]) => <Link key={v} href={href(g.key, v)} aria-current={f[g.key] === v ? 'true' : undefined} className="chip">{l}</Link>)}
          </div>
        ))}
        {active && <Link href="/jobs" className="link shrink-0 text-sm">Clear filters</Link>}
      </nav>
      <SiteSearches linkedin={linkedin} sites={sites} government={government} international={international} open={jobs.length === 0} />
      {jobs.length ? <div className="border-t border-line">{jobs.map((j) => <JobRow key={j.id} job={j} heading="h2" />)}</div>
        : !cv ? <Empty title="Upload your CV to see jobs" action={<Link href="/cv" className="btn btn-primary">Upload your CV</Link>}>Surelane reads it to learn what fits you, then looks for open vacancies.</Empty>
        : searchesOff(s) ? <Empty title="Local and Global are both off" action={<Link href="/settings#agent" className="btn btn-primary">Open Search settings</Link>}>{SCOPE_OFF}</Empty>
        : !searched ? <Empty title="No search has run yet">Press Search at the top of the page, or wait for the next search time.</Empty>
        : <Empty title={active ? 'No jobs match these filters' : 'No open matches right now'}>{active ? 'Clear a filter to see more.' : <>Surelane shows only vacancies confirmed as open. Try lowering your minimum match in <Link href="/settings" className="link">Search settings</Link>, or add a <Link href="/careers" className="link">career page</Link>.</>}</Empty>}
    </Page>
  );
}
