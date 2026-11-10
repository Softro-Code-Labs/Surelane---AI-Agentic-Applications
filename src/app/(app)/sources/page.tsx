import { ExternalLink } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Page, PageHead, Section, StatusText, Tag } from '@/components/ui';
import { q } from '@/lib/db';
import { formatColombo } from '@/lib/schedule';
import { getCv, getSettings } from '@/lib/settings';
import { UNAVAILABLE_SOURCES } from '@/lib/sources/adapters';
import { buildSources } from '@/lib/sources/registry';

export const metadata: Metadata = { title: 'Job sources' };

export default async function Sources() {
  const [s, cv] = await Promise.all([getSettings(), getCv()]);
  const latest = await q<{ source: string; status: string; jobs_found: number; error: string | null; checked_at: Date }>(
    `SELECT DISTINCT ON (source) source, status, jobs_found, error, checked_at FROM search_run_sources ORDER BY source, checked_at DESC`);
  const term = cv?.profile.targetTitles[0] ?? 'jobs';
  const list = buildSources(s);
  return (
    <Page>
      <PageHead title="Job sources" intro="Exactly what is searched, what happened last time, and what is not searched." />
      <Section title="Searched automatically" hint={<>Company websites you added are listed on <Link href="/careers" className="link">Career pages</Link>.</>}>
        <ul className="divide-y divide-line">
          {list.map((a) => {
            const r = latest.find((l) => l.source === a.id);
            const inactive = a.scope === 'global' ? !s.global_enabled : a.scope === 'local' ? !s.local_enabled : !s.local_enabled && !s.global_enabled;
            return (
              <li key={a.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{a.label}</span>
                  <Tag>{a.region}</Tag>
                  {inactive ? <Tag>{a.scope === 'global' ? 'Only with Global on' : a.scope === 'local' ? 'Only with Local on' : 'Local and Global are off'}</Tag> : r ? <StatusText status={r.status} /> : <Tag>Not checked yet</Tag>}
                  {r && <span className="text-sm text-soft">{r.status === 'success' ? `${r.jobs_found} listings, ${formatColombo(r.checked_at)}` : `${r.error ?? ''} ${formatColombo(r.checked_at)}`}</span>}
                </div>
                <p className="measure mt-0.5 text-sm text-soft">{a.note}</p>
              </li>
            );
          })}
        </ul>
      </Section>
      <Section title="Not searched" hint={<>These sites don&apos;t permit automated reading, or it couldn&apos;t be confirmed, so Surelane never reports them as checked. <Link href="/jobs#more-sites" className="link">Jobs</Link> has searches on each of them built from your CV. Open one, then use Add a job you found to score anything interesting.</>}>
        <ul className="divide-y divide-line">
          {UNAVAILABLE_SOURCES.filter((u) => !u.government).map((u) => (
            <li key={u.label} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div className="min-w-0"><span className="font-bold">{u.label}</span><p className="measure text-sm text-soft">{u.reason}</p></div>
              <a href={u.searchUrl(term)} target="_blank" rel="noopener noreferrer" className="btn btn-quiet btn-sm">Search there<ExternalLink size={14} aria-hidden="true" /><span className="sr-only">: {u.label}, opens in a new tab</span></a>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Government sites not searched" hint={<>Govjobs.lk and Govdoc Jobs are searched automatically, above. These government sites are not. <Link href="/jobs#more-sites" className="link">Jobs</Link> has links to each one.</>}>
        <ul className="divide-y divide-line">
          {UNAVAILABLE_SOURCES.filter((u) => u.government).map((u) => (
            <li key={u.label} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <div className="min-w-0"><span className="font-bold">{u.label}</span><p className="measure text-sm text-soft">{u.reason}</p></div>
              <a href={u.searchUrl(term)} target="_blank" rel="noopener noreferrer" className="btn btn-quiet btn-sm">Search there<ExternalLink size={14} aria-hidden="true" /><span className="sr-only">: {u.label}, opens in a new tab</span></a>
            </li>
          ))}
        </ul>
      </Section>
    </Page>
  );
}
