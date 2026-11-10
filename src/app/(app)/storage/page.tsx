import { CalendarClock, Check, Clock3, Database, Hourglass, Recycle, Trash2 } from 'lucide-react';
import type { Metadata } from 'next';
import { DataControls } from '@/components/Forms';
import { Notice, Page, PageHead, Section, Stat } from '@/components/ui';
import { RETENTION_TARGETS, storageStats } from '@/lib/cleanup';
import { RETENTION_DAYS, formatColombo, nextCleanup } from '@/lib/schedule';

export const metadata: Metadata = { title: 'Storage' };

const FREE_LIMIT = 500 * 1024 * 1024;
const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;

export default async function Storage() {
  const s = await storageStats();
  const pct = Math.min(100, (s.bytes / FREE_LIMIT) * 100);
  const facts = [
    ['Stored job records', Number(s.counts.jobs ?? 0).toLocaleString(), Database],
    ['Deleted in last cleanup', String(s.last?.total_deleted ?? 0), Trash2],
    ['Deleted in total', s.lifetimeDeleted.toLocaleString(), Recycle],
    ['Last cleanup', s.last ? formatColombo(s.last.finished_at ?? s.last.started_at) : 'Not run yet', Clock3],
    ['Next cleanup', formatColombo(nextCleanup(new Date())), CalendarClock],
    ['Retention period', `${RETENTION_DAYS} days`, Hourglass],
  ] as const;
  const kept = ['Your active CV', 'Your cover letter', 'Your candidate profile', 'Your account', `Application records (${s.counts.applications ?? 0})`, 'Your settings and preferences', 'Your career page list'];
  return (
    <Page>
      <PageHead title="Storage" eyebrow="Search setup" intro={`Job history older than ${RETENTION_DAYS} days is deleted automatically every day.`} />
      <Section title="Database usage">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-display text-[2rem] font-bold leading-tight tabular">{mb(s.bytes)} <span className="font-sans text-base font-medium text-soft">of the 500 MB free limit</span></p>
          <span className="text-sm font-semibold text-soft tabular">{pct.toFixed(1)}%</span>
        </div>
        <div role="img" aria-label={`${pct.toFixed(1)}% of free database limit used`} className="mt-3 h-2.5 overflow-hidden rounded-full bg-sunken">
          <div className={`h-full rounded-full ${pct > 80 ? 'bg-stop' : 'brand-gradient'}`} style={{ width: `${Math.max(pct, 1)}%` }} />
        </div>
        <p className="measure mt-3 text-[13px] text-soft">Deleted space is reused for new records, so this figure levels off rather than dropping straight after a cleanup.</p>
      </Section>
      <dl className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3">
        {facts.map(([k, v, icon]) => <Stat key={k} label={k} value={<span className="text-[1.15rem]">{v}</span>} icon={icon} tone="plain" />)}
      </dl>
      {s.lastAttempt?.status === 'failed' && <div className="mb-5"><Notice tone="stop" role="alert">The last cleanup failed: {s.lastAttempt.note}. It retries on the next trigger.</Notice></div>}
      <div className="grid gap-x-5 sm:grid-cols-2">
        <Section title={`Deleted after ${RETENTION_DAYS} days`}>
          <ul className="space-y-2 text-sm">{RETENTION_TARGETS.map((t) => <li key={t.table} className="flex items-start gap-2.5"><Trash2 size={15} className="mt-0.5 shrink-0 text-soft" aria-hidden="true" />{t.label}</li>)}</ul>
        </Section>
        <Section title="Kept until you delete them">
          <ul className="space-y-2 text-sm">{kept.map((k) => <li key={k} className="flex items-start gap-2.5"><Check size={15} className="mt-0.5 shrink-0 text-safe-strong" aria-hidden="true" />{k}</li>)}</ul>
        </Section>
      </div>
      <Section title="Your data" hint="Delete your job history now, or remove your account and everything in it."><DataControls /></Section>
    </Page>
  );
}
