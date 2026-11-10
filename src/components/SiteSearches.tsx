import { ChevronDown, ExternalLink, Globe } from 'lucide-react';
import type { LinkedinSearch } from '@/lib/linkedin';
import type { SiteSearch } from '@/lib/sites';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Searches on job sites that Surelane must not read itself, built from the CV.
 * The person opens them in their own browser. Only switched-on scopes appear:
 * Sri Lankan and government sites need Local, and international platforms
 * search Sri Lanka, the world or both, to match the Local and Global switches.
 */
export function SiteSearches({ linkedin, sites, government, international, open }: {
  linkedin: LinkedinSearch[]; sites: SiteSearch[]; government: SiteSearch[]; international: SiteSearch[]; open?: boolean;
}) {
  if (!linkedin.length && !sites.length && !government.length && !international.length) return null;
  const covers = [
    linkedin.length ? 'LinkedIn' : null,
    sites.length ? plural(sites.length, 'Sri Lankan site') : null,
    government.length ? plural(government.length, 'government site') : null,
    international.length ? plural(international.length, 'international platform') : null,
  ].filter(Boolean) as string[];
  const localLinkedin = linkedin.filter((s) => s.scope === 'local');
  const globalLinkedin = linkedin.filter((s) => s.scope === 'global');
  const both = localLinkedin.length > 0 && globalLinkedin.length > 0;
  return (
    <details id="more-sites" className="card group mb-5 overflow-hidden" open={open}>
      <summary className="flex cursor-pointer items-center gap-4 px-5 py-4 transition-colors hover:bg-sunken/60">
        <span className="brand-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-[0_6px_16px_-6px_var(--brand-glow)]"><Globe size={19} aria-hidden="true" /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[1rem] font-semibold">Search more job sites with your CV</span>
          <span className="block text-[13px] text-soft">{covers.length > 1 ? `${covers.slice(0, -1).join(', ')} and ${covers.at(-1)}` : covers[0]}, with searches built from your CV</span>
        </span>
        <ChevronDown size={20} aria-hidden="true" className="shrink-0 text-soft transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-line px-5 pb-3 pt-4">
        <p className="measure rounded-xl bg-sunken px-4 py-3 text-[13px] leading-relaxed text-soft">
          Most of these sites don&apos;t allow Surelane to read them, so their jobs aren&apos;t scored here. Sites marked as searched automatically are also read by Surelane, but their feeds hold only the newest jobs. Each search opens on the site in a new tab, and some sites may ask you to sign in.
          Found one you like? Copy its link, then choose <strong className="font-semibold text-ink">Add a job you found</strong> to score it against your CV and track it.
        </p>

        {linkedin.length > 0 && (
          <section className="mt-4" aria-labelledby="ss-linkedin">
            <h3 id="ss-linkedin" className="text-[0.95rem] font-semibold">LinkedIn</h3>
            {both ? (
              <>
                <h4 className="eyebrow mt-3">Local (Sri Lanka)</h4>
                <LinkedinList searches={localLinkedin} />
                <h4 className="eyebrow mt-4">Global (international)</h4>
                <LinkedinList searches={globalLinkedin} />
              </>
            ) : <LinkedinList searches={linkedin} />}
          </section>
        )}

        <SiteList id="ss-lk" title="Sri Lankan job sites" hint="Each button searches that site for one of your top roles or skills." sites={sites} />
        <SiteList id="ss-gov" title="Government job sites" hint="Government job titles often differ from private-sector ones, so each site also has a link to its newest vacancies." sites={government} />
        <SiteList id="ss-intl" title="International job platforms" hint="Each button searches for one of your top roles or skills. Where a platform has both, Sri Lanka and Worldwide searches follow your Local and Global switches." sites={international} />
      </div>
    </details>
  );
}

function LinkedinList({ searches }: { searches: LinkedinSearch[] }) {
  return (
    <ul className="divide-y divide-line">
      {searches.map((s) => (
        <li key={s.url} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
          <div className="min-w-0 flex-1 basis-64">
            <p className="font-semibold">{s.label}</p>
            <p className="text-sm text-soft">{s.why}</p>
            <p className="mt-0.5 text-[13px] text-soft">{s.facts.map((f, i) => <span key={i}>{i > 0 && <span aria-hidden="true" className="mx-1.5 text-edge">/</span>}{f}</span>)}</p>
          </div>
          <a href={s.url} target="_blank" rel="noopener noreferrer" className="btn btn-quiet btn-sm shrink-0">
            Open on LinkedIn<ExternalLink size={14} aria-hidden="true" /><span className="sr-only">: {s.label} (opens in a new tab)</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

function SiteList({ id, title, hint, sites }: { id: string; title: string; hint: string; sites: SiteSearch[] }) {
  if (!sites.length) return null;
  return (
    <section className="mt-5" aria-labelledby={id}>
      <h3 id={id} className="text-[0.95rem] font-semibold">{title}</h3>
      <p className="text-[13px] text-soft">{hint}</p>
      <ul className="mt-1 divide-y divide-line">
        {sites.map((site) => (
          <li key={site.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
            <span className="w-36 shrink-0">
              <span className="block text-sm font-semibold">{site.label}</span>
              {site.automatic && <span className="block text-[12px] text-safe-strong">{site.automatic === 'key' ? 'Searched automatically with a key' : 'Also searched automatically'}</span>}
            </span>
            <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
              {site.links.map((l) => (
                <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="chip gap-1.5">
                  {l.label}<ExternalLink size={13} aria-hidden="true" className="text-soft" /><span className="sr-only"> on {site.label} (opens in a new tab)</span>
                </a>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
