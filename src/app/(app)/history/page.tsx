import { ChevronDown, ScrollText } from 'lucide-react';
import type { Metadata } from 'next';
import { Empty, Page, PageHead, StatusText } from '@/components/ui';
import { q } from '@/lib/db';
import { plural } from '@/lib/plural';
import { RETENTION_DAYS, SLOTS, formatColombo } from '@/lib/schedule';

export const metadata: Metadata = { title: 'Search history' };

type Run = { id: string; trigger: string; slot_key: string | null; status: string; mode: string; started_at: Date; finished_at: Date | null; jobs_found: number; jobs_new: number; matches: number; strong: number; good: number; potential: number; filtered_outdated: number; duplicates: number; summary: string | null; errors: string[] };
type Src = { run_id: string; label: string; status: string; jobs_found: number; error: string | null; checked_at: Date };

export default async function History() {
  const runs = await q<Run>(`SELECT * FROM search_runs ORDER BY started_at DESC LIMIT 60`);
  const sources = await q<Src>(`SELECT run_id, label, status, jobs_found, error, checked_at FROM search_run_sources WHERE run_id = ANY($1::bigint[]) ORDER BY id`, [runs.map((r) => r.id)]);
  return (
    <Page>
      <PageHead title="Search history" eyebrow="Search setup" intro={`Every search and every site it checked. Kept for ${RETENTION_DAYS} days.`} />
      {!runs.length ? <Empty title="No searches yet" icon={ScrollText}>Your first search will appear here.</Empty> : (
        <ol className="space-y-3">
          {runs.map((r) => {
            const list = sources.filter((s) => s.run_id === r.id);
            return (
              <li key={r.id} className="card card-pad">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><span className="font-semibold">{formatColombo(r.started_at)}</span><span className="ml-2 text-sm text-soft">{r.trigger === 'manual' ? 'Manual search' : `${SLOTS.find((s) => s.key === r.slot_key)?.label} scheduled search`}, {r.mode === 'global' ? 'Sri Lanka and global' : r.mode === 'global_only' ? 'Global only' : 'Sri Lanka only'}</span></div>
                  <StatusText status={r.status} />
                </div>
                {r.summary && <p className="measure mt-2 text-[15px]">{r.summary}</p>}
                {list.length > 0 && (
                  <>
                    <p className="mt-1.5 text-[13px] text-soft">{plural(r.jobs_found, 'listing')}, {r.jobs_new} new, {plural(r.matches, 'match', 'matches')} ({r.strong} strong, {r.good} good, {r.potential} potential), {r.filtered_outdated} expired left out, {plural(r.duplicates, 'duplicate')} merged{r.finished_at ? `, finished ${formatColombo(r.finished_at, 'time')}` : ''}.</p>
                    <details className="group mt-3 rounded-xl border border-line bg-sunken/40 text-sm">
                      <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-2.5 font-semibold">Sites checked: {list.filter((s) => s.status === 'success').length} of {list.length}<ChevronDown size={16} className="text-soft transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
                      <ul className="space-y-2 border-t border-line px-4 py-3">
                        {list.map((s) => (
                          <li key={s.label} className="flex flex-wrap items-center gap-2"><StatusText status={s.status} /><span className="font-semibold">{s.label}</span>
                            <span className="text-soft">{s.status === 'success' ? `${plural(s.jobs_found, 'listing')} at ${formatColombo(s.checked_at, 'time')}` : s.error}</span></li>
                        ))}
                      </ul>
                    </details>
                  </>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Page>
  );
}
