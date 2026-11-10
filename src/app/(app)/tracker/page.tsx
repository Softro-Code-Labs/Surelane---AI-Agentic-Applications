import { Building, ChevronDown, MapPin, SquareKanban } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ApplicationControls } from '@/components/Applications';
import { Deadline } from '@/components/JobRow';
import { Chevrons, Empty, Page, PageHead, Tag } from '@/components/ui';
import { q } from '@/lib/db';
import { deadlineLabel } from '@/lib/jobs';
import { STAGES } from '@/lib/stages';

export const metadata: Metadata = { title: 'Applications' };

const TIER_ON: Record<string, number> = { Strong: 3, Good: 2, Potential: 1 };

export default async function Applications({ searchParams }: { searchParams: Promise<{ stage?: string }> }) {
  const { stage } = await searchParams;
  const all = await q(`SELECT * FROM applications ORDER BY updated_at DESC`);
  const apps = stage ? all.filter((a) => a.status === stage) : all;
  const count = (s: string) => all.filter((a) => a.status === s).length;
  const link = (s: string) => (stage === s ? '/tracker' : `/tracker?stage=${encodeURIComponent(s)}`);
  return (
    <Page>
      <PageHead title="Applications" eyebrow="Your pipeline" intro="Saved jobs stay here until you delete them, even after job history is cleared." />
      {all.length > 0 && (
        <nav aria-label="Application stages" className="mb-6">
          <div className="stages">
            {STAGES.map((s) => <Link key={s} href={link(s)} className="stage" aria-current={stage === s ? 'true' : undefined}><b>{count(s)}</b><span>{s}</span></Link>)}
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 text-[13px]">
            <span className="text-soft">{stage ? `Showing ${stage}` : `Showing all ${all.length}`}</span>
            <Link href={link('Rejected')} className="font-semibold text-road hover:underline" aria-current={stage === 'Rejected' ? 'true' : undefined}>{stage === 'Rejected' ? 'Show all stages' : `Rejected (${count('Rejected')})`}</Link>
          </div>
        </nav>
      )}
      {!all.length ? <Empty title="Nothing saved yet" icon={SquareKanban} action={<Link href="/jobs" className="btn btn-primary">See jobs for you</Link>}>Save a job and it stays here, with its deadline, your notes and your cover letter.</Empty>
        : !apps.length ? <Empty title={`Nothing at ${stage}`} icon={SquareKanban}><Link href="/tracker" className="link">Show all stages</Link></Empty> : (
        <ul className="space-y-3">
          {apps.map((a) => {
            const passed = a.deadline ? deadlineLabel(a.deadline).passed : false;
            return (
              <li key={a.id} className="card card-pad">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <h2 className="text-[1.05rem] font-semibold">{a.job_id ? <Link href={`/jobs/${a.job_id}`} className="hover:text-primary">{a.title}</Link> : a.title}</h2>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-soft">
                      <span className="inline-flex items-center gap-1"><Building size={14} aria-hidden="true" />{a.company}</span>
                      {a.location && <span className="inline-flex items-center gap-1"><MapPin size={14} aria-hidden="true" />{a.location}</span>}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {a.tier && <Tag tone={a.tier === 'Strong' ? 'safe' : a.tier === 'Good' ? 'info' : 'plain'}><Chevrons on={TIER_ON[a.tier] ?? 1} className="h-2.5 w-auto" />{a.score}% {a.tier}</Tag>}
                    {a.deadline && (passed ? <Tag>Deadline passed</Tag> : <Deadline date={a.deadline} />)}
                  </div>
                </div>
                <ApplicationControls id={a.id} title={a.title} status={a.status} notes={a.notes} url={a.url} />
                {a.cover_letter && (
                  <details className="group mt-4 rounded-xl border border-line bg-sunken/50">
                    <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-2.5 text-sm font-semibold">Saved cover letter<ChevronDown size={16} className="text-soft transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
                    <p className="measure whitespace-pre-line border-t border-line px-4 py-3 text-sm leading-relaxed">{a.cover_letter}</p>
                  </details>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Page>
  );
}
