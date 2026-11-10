import type { Metadata } from 'next';
import { SlidersHorizontal, X } from 'lucide-react';
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
      <PageHead title="Jobs for you" eyebrow="Matched to your CV" intro={<><span className="font-semibold text-ink">{jobs.length} open {jobs.length === 1 ? 'vacancy' : 'vacancies'}</span> at {s.min_score}% or above, each confirmed open in the last 3 days.</>} action={<AddJob />} />
      <nav aria-label="Filter jobs" className="card mb-5 flex items-center gap-x-6 gap-y-3 overflow-x-auto px-4 py-3 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible">
        <span className="hidden shrink-0 items-center gap-1.5 text-[13px] font-semibold text-soft sm:inline-flex"><SlidersHorizontal size={15} aria-hidden="true" />Filters</span>
        {GROUPS.filter((g) => (g.key !== 'market' || (s.local_enabled && s.global_enabled)) && (g.key !== 'sector' || s.local_enabled)).map((g) => (
          <div key={g.key} className="chips shrink-0" role="group" aria-label={g.label}>
            <span className="text-[12px] font-medium text-soft">{g.label}</span>
            {g.options.map(([v, l]) => <Link key={v} href={href(g.key, v)} aria-current={f[g.key] === v ? 'true' : undefined} className="chip">{l}</Link>)}
          </div>
        ))}
        {active && <Link href="/jobs" className="ml-auto inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-road hover:underline"><X size={14} aria-hidden="true" />Clear filters</Link>}
      </nav>
      <SiteSearches linkedin={linkedin} sites={sites} government={government} international={international} open={jobs.length === 0} />
      {jobs.length ? <div className="space-y-3">{jobs.map((j) => <JobRow key={j.id} job={j} heading="h2" />)}</div>
        : !cv ? <Empty title="Upload your CV to see jobs" action={<Link href="/cv" className="btn btn-primary">Upload your CV</Link>}>Surelane reads it to learn what fits you, then looks for open vacancies.</Empty>
        : searchesOff(s) ? <Empty title="Local and Global are both off" action={<Link href="/settings#agent" className="btn btn-primary">Open Search settings</Link>}>{SCOPE_OFF}</Empty>
        : !searched ? <Empty title="No search has run yet">Press Search at the top of the page, or wait for the next search time.</Empty>
        : <Empty title={active ? 'No jobs match these filters' : 'No open matches right now'}>{active ? 'Clear a filter to see more.' : <>Surelane shows only vacancies confirmed as open. Try lowering your minimum match in <Link href="/settings" className="link">Search settings</Link>, or add a <Link href="/careers" className="link">career page</Link>.</>}</Empty>}
    </Page>
  );
}
