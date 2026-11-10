'use client';
import { Ban, Check, ExternalLink, LoaderCircle, Minus, RefreshCw, ScanEye, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Switch, api } from './controls';
import { ConfirmButton, useToast } from './feedback';
import { Notice, Tag, type Tone } from './ui';

export type PageRow = { id: string; company: string; url: string; enabled: boolean; last_status: string | null; last_message: string | null; last_found: number; last_checked: string | null };

const STATUS: Record<string, { label: string; tone: Tone; icon: typeof Check }> = {
  ok: { label: 'Readable', tone: 'safe', icon: Check }, no_jobs: { label: 'No vacancies found', tone: 'plain', icon: Minus }, needs_browser: { label: 'Cannot be read', tone: 'warn', icon: ScanEye },
  not_allowed: { label: 'Not allowed', tone: 'stop', icon: Ban }, error: { label: 'Check failed', tone: 'stop', icon: X },
};

export function AddCareerPages() {
  const router = useRouter();
  const [entries, setEntries] = useState('');
  const [location, setLocation] = useState('Sri Lanka');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [refused, setRefused] = useState<{ company: string; message: string }[]>([]);
  const [note, setNote] = useState('');
  return (
    <form className="card card-pad" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setError(''); setNote(''); setRefused([]);
      try {
        const r = await api('/api/career-pages', 'POST', { entries, default_location: location });
        const no = r.results.filter((x: any) => x.status === 'not_allowed');
        setRefused(no);
        setNote(`${r.added} added${r.skipped ? `, ${r.skipped} already on your list` : ''}.`);
        setEntries(r.invalid.join('\n'));
        if (r.invalid.length) setError(`${r.invalid.length} ${r.invalid.length === 1 ? 'line was' : 'lines were'} not added. Fix the ${r.invalid.length === 1 ? 'link' : 'links'} left in the box and try again.`);
        router.refresh();
      } catch (err) { setError(err instanceof Error ? err.message : 'Those pages could not be added.'); }
      setBusy(false);
    }}>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
        <label className="label">Career page links, one per line
          <textarea rows={4} required className="field" value={entries} onChange={(e) => setEntries(e.target.value)} placeholder={'https://company.lk/careers\nAcme Lanka, https://acme.lk/jobs'} />
          <span className="hint">Start a line with the company name and a comma to set the name yourself.</span>
        </label>
        <label className="label">Location, if a page doesn&apos;t say<input className="field" value={location} onChange={(e) => setLocation(e.target.value)} /></label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" disabled={busy}>{busy && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}{busy ? 'Checking permission' : 'Add and check'}</button>
        {note && <span role="status" className="text-sm font-semibold text-safe-strong">{note}</span>}
        {error && <p role="alert" className="text-sm font-semibold text-stop-strong">{error}</p>}
      </div>
      {refused.length > 0 && (
        <div className="mt-3">
          <Notice tone="stop" role="alert">{refused.map((r) => <p key={r.company}>{r.message}</p>)}</Notice>
        </div>
      )}
    </form>
  );
}

export function CareerRow({ page }: { page: PageRow }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(page.enabled);
  const [titles, setTitles] = useState<string[]>([]);
  const status = page.last_status ? STATUS[page.last_status] : null;
  const refused = page.last_status === 'not_allowed';
  return (
    <li className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-[15px] font-semibold">{page.company}</span>
        {status ? <Tag tone={status.tone}><status.icon size={13} aria-hidden="true" className="-mt-px" />{status.label}</Tag> : <Tag>Not checked yet</Tag>}
        {page.last_status === 'ok' && <span className="text-sm text-soft">{page.last_found} {page.last_found === 1 ? 'vacancy' : 'vacancies'}</span>}
        <span className="ml-auto flex items-center gap-2">
          <Switch checked={enabled} label={`Search ${page.company}`} onChange={async (v) => {
            setEnabled(v);
            try { await api(`/api/career-pages/${page.id}`, 'PATCH', { enabled: v }); router.refresh(); }
            catch (e) { setEnabled(!v); toast('bad', e instanceof Error ? e.message : 'That did not save.'); }
          }} />
          <button type="button" className="btn btn-quiet btn-sm btn-icon ml-1" aria-label={`Check ${page.company} now`} title={`Check ${page.company} now`} disabled={busy} onClick={async () => {
            setBusy(true);
            try { const r = await api(`/api/career-pages/${page.id}/check`); setTitles(r?.titles ?? []); router.refresh(); }
            catch (e) { toast('bad', e instanceof Error ? e.message : 'The check could not run.'); }
            setBusy(false);
          }}>{busy ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}</button>
          <ConfirmButton className="btn btn-quiet btn-sm btn-icon" label={`Remove ${page.company}`} title={`Remove ${page.company}?`} body="Surelane stops checking this company. Jobs you saved from it stay in your applications." confirm="Remove"
            onConfirm={async () => { await api(`/api/career-pages/${page.id}`, 'DELETE'); router.refresh(); }}><Trash2 size={16} aria-hidden="true" /></ConfirmButton>
        </span>
      </div>
      <a href={page.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex max-w-full items-center gap-1 text-[13px] text-soft hover:text-ink"><span className="truncate">{page.url}</span><ExternalLink size={12} className="shrink-0" aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a>
      {page.last_message && page.last_status !== 'ok' && <p className={`measure mt-1 text-[15px] ${refused ? 'font-semibold text-stop-strong' : 'text-soft'}`}>{page.last_message}</p>}
      {titles.length > 0 && <p className="mt-1 text-sm text-soft">Found: {titles.join(', ')}</p>}
      {page.last_checked && <p className="text-[13px] text-soft">Last checked {page.last_checked}</p>}
    </li>
  );
}
