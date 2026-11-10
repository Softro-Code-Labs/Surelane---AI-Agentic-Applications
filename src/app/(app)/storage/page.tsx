import { Check } from 'lucide-react';
import type { Metadata } from 'next';
import { DataControls } from '@/components/Forms';
import { Notice, Page, PageHead, Section } from '@/components/ui';
import { RETENTION_TARGETS, storageStats } from '@/lib/cleanup';
import { RETENTION_DAYS, formatColombo, nextCleanup } from '@/lib/schedule';

export const metadata: Metadata = { title: 'Storage' };

const FREE_LIMIT = 500 * 1024 * 1024;
const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;

export default async function Storage() {
  const s = await storageStats();
  const pct = Math.min(100, (s.bytes / FREE_LIMIT) * 100);
  const facts: [string, string][] = [
    ['Stored job records', Number(s.counts.jobs ?? 0).toLocaleString()],
    ['Records deleted in last cleanup', String(s.last?.total_deleted ?? 0)],
    ['Records deleted in total', s.lifetimeDeleted.toLocaleString()],
    ['Last cleanup', s.last ? formatColombo(s.last.finished_at ?? s.last.started_at) : 'Not run yet'],
    ['Next scheduled cleanup', formatColombo(nextCleanup(new Date()))],
    ['Retention period', `${RETENTION_DAYS} days`],
  ];
  const kept = ['Your active CV', 'Your cover letter', 'Your candidate profile', 'Your account', `Application records (${s.counts.applications ?? 0})`, 'Your settings and preferences', 'Your career page list'];
  return (
    <Page>
      <PageHead title="Storage" intro={`Job history older than ${RETENTION_DAYS} days is deleted automatically every day.`} />
      <Section title="Database usage">
        <p className="text-[2rem] font-bold leading-tight tabular">{mb(s.bytes)} <span className="text-lg font-medium text-soft">of the 500 MB free limit</span></p>
        <div role="img" aria-label={`${pct.toFixed(1)}% of free database limit used`} className="mt-2 h-2.5 max-w-xl overflow-hidden rounded-sm bg-sunken"><div className={`h-full ${pct > 80 ? 'bg-stop' : 'bg-road'}`} style={{ width: `${Math.max(pct, 0.5)}%` }} /></div>
        <p className="measure mt-2 text-sm text-soft">Deleted space is reused for new records, so this figure levels off rather than dropping straight after a cleanup.</p>
      </Section>
      <dl className="mb-9 grid grid-cols-2 items-start gap-x-6 gap-y-4 md:grid-cols-3">
        {facts.map(([k, v]) => <div key={k} className="flex flex-col-reverse"><dt className="text-sm text-soft">{k}</dt><dd className="text-[1.2rem] font-bold leading-tight">{v}</dd></div>)}
      </dl>
      {s.lastAttempt?.status === 'failed' && <div className="mb-6"><Notice tone="stop" role="alert">The last cleanup failed: {s.lastAttempt.note}. It retries on the next trigger.</Notice></div>}
      <div className="grid gap-x-10 sm:grid-cols-2">
        <Section title={`Deleted after ${RETENTION_DAYS} days`}>
          <ul className="list-disc space-y-1 pl-5">{RETENTION_TARGETS.map((t) => <li key={t.table}>{t.label}</li>)}</ul>
        </Section>
        <Section title="Kept until you delete them">
          <ul className="space-y-1">{kept.map((k) => <li key={k} className="flex items-start gap-2"><Check size={17} className="mt-0.5 shrink-0 text-safe-strong" aria-hidden="true" />{k}</li>)}</ul>
        </Section>
      </div>
      <Section title="Your data"><DataControls /></Section>
    </Page>
  );
}
