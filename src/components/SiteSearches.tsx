import { ChevronDown, ExternalLink, Globe, Search } from 'lucide-react';
import type { SiteSearch } from '@/lib/sites';
import { plural } from '@/lib/plural';

const AREA: Record<SiteSearch['area'], string> = { lk: 'Sri Lanka', world: 'Worldwide', both: 'Sri Lanka and worldwide' };

/**
 * Searches on job sites that Surelane must not read itself, built from the CV.
 * The person opens them in their own browser. Every site, LinkedIn included,
 * gets the same card, most popular first. Only switched-on scopes appear:
 * Sri Lankan and government sites need Local, and international platforms
 * search Sri Lanka, the world or both, to match the Local and Global switches.
 */
export function SiteSearches({ sites, government, open }: { sites: SiteSearch[]; government: SiteSearch[]; open?: boolean }) {
  if (!sites.length && !government.length) return null;
  const top = sites.slice(0, 3).map((s) => s.label);
  return (
    <details id="more-sites" className="card group mb-5 overflow-hidden" open={open}>
      <summary className="flex cursor-pointer items-center gap-4 px-5 py-4 transition-colors hover:bg-sunken/60">
        <span className="brand-gradient flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-[0_6px_16px_-6px_var(--brand-glow)]"><Globe size={19} aria-hidden="true" /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[1rem] font-semibold">Search more job sites with your CV</span>
          <span className="block text-[13px] text-soft">
            {plural(sites.length + government.length, 'site')}{top.length ? `, including ${top.join(', ')}` : ''}. Searches are ready to open.
          </span>
        </span>
        <ChevronDown size={20} aria-hidden="true" className="shrink-0 text-soft transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-line px-5 pb-5 pt-4">
        <p className="measure rounded-xl bg-sunken px-4 py-3 text-[13px] leading-relaxed text-soft">
          Each link opens a search on that site, built from your CV&apos;s top roles and skills, in a new tab. Most of these sites don&apos;t allow Surelane to read them, so their jobs aren&apos;t scored here; some may ask you to sign in.
          Found one you like? Copy its link, then choose <strong className="font-semibold text-ink">Add a job you found</strong> to score it against your CV and track it.
        </p>
        <SiteGrid id="ss-sites" title="Job sites" hint="Most popular first, by how many people visit each site." sites={sites} />
        <SiteGrid id="ss-gov" title="Government job sites" hint="Government job titles often differ from private-sector ones, so each site also has a link to its newest vacancies." sites={government} />
      </div>
    </details>
  );
}

function SiteGrid({ id, title, hint, sites }: { id: string; title: string; hint: string; sites: SiteSearch[] }) {
  if (!sites.length) return null;
  return (
    <section className="mt-5" aria-labelledby={id}>
      <h3 id={id} className="text-[0.95rem] font-semibold">{title}</h3>
      <p className="text-[13px] text-soft">{hint}</p>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {sites.map((site) => (
          <li key={site.id} className="flex min-w-0 flex-col rounded-xl border border-line bg-surface p-4">
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0">
                <span className="block font-semibold">{site.label}</span>
                <span className="block text-[12px] text-soft">{AREA[site.area]}</span>
              </span>
              {site.automatic && <span className="shrink-0 rounded-full bg-safe-soft px-2 py-0.5 text-[11px] font-semibold text-safe-strong" title="Surelane also reads this site's newest jobs by itself">Also automatic</span>}
            </div>
            <ul className="mt-3 flex flex-col gap-1.5">
              {site.links.map((l) => (
                <li key={l.url}>
                  <a href={l.url} target="_blank" rel="noopener noreferrer" title={l.title} className="group/link flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13px] font-medium transition-colors hover:border-edge hover:bg-sunken">
                    <Search size={13} aria-hidden="true" className="shrink-0 text-soft" />
                    <span className="min-w-0 flex-1 break-words leading-snug">{l.label}</span>
                    <ExternalLink size={13} aria-hidden="true" className="shrink-0 text-soft group-hover/link:text-ink" />
                    <span className="sr-only"> on {site.label} (opens in a new tab)</span>
                  </a>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
