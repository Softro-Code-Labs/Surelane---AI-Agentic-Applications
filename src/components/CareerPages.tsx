'use client';
import { Ban, Check, ExternalLink, FolderInput, LoaderCircle, Minus, RefreshCw, ScanEye, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { MAX_CATEGORY_LENGTH } from '@/lib/career-categories';
import { Switch, api } from './controls';
import { ConfirmButton, useToast } from './feedback';
import { Notice, Tag, type Tone } from './ui';

export type PageRow = { id: string; company: string; url: string; enabled: boolean; category: string | null; last_status: string | null; last_message: string | null; last_found: number; last_checked: string | null };

const NEW_CATEGORY = '__new__';

/**
 * A dropdown of the categories already used, plus "New category" to type one.
 * With no categories yet it starts as a text box.
 */
function CategoryPicker({ id, categories, value, onChange }: { id: string; categories: string[]; value: string; onChange: (v: string) => void }) {
  const [typing, setTyping] = useState(categories.length === 0);
  // Once a newly typed category is saved it appears in the list, so go back to the dropdown.
  useEffect(() => { setTyping((t) => (categories.length === 0 ? true : t && !categories.includes(value))); }, [categories]);
  if (typing) {
    return (
      <div className="flex gap-2">
        <input id={id} className="field" value={value} maxLength={MAX_CATEGORY_LENGTH} placeholder="For example IT companies, Banks" autoFocus={categories.length > 0} onChange={(e) => onChange(e.target.value)} />
        {categories.length > 0 && <button type="button" className="btn btn-quiet btn-sm shrink-0 self-center" onClick={() => { setTyping(false); onChange(''); }}>Choose from list</button>}
      </div>
    );
  }
  return (
    <select id={id} className="field" value={categories.includes(value) ? value : ''} onChange={(e) => {
      if (e.target.value === NEW_CATEGORY) { setTyping(true); onChange(''); } else onChange(e.target.value);
    }}>
      <option value="">No category</option>
      {categories.map((c) => <option key={c} value={c}>{c}</option>)}
      <option value={NEW_CATEGORY}>+ New category…</option>
    </select>
  );
}

const STATUS: Record<string, { label: string; tone: Tone; icon: typeof Check }> = {
  ok: { label: 'Readable', tone: 'safe', icon: Check }, no_jobs: { label: 'No vacancies found', tone: 'plain', icon: Minus }, needs_browser: { label: 'Cannot be read', tone: 'warn', icon: ScanEye },
  not_allowed: { label: 'Not allowed', tone: 'stop', icon: Ban }, error: { label: 'Check failed', tone: 'stop', icon: X },
};

export function AddCareerPages({ categories }: { categories: string[] }) {
  const router = useRouter();
  const [entries, setEntries] = useState('');
  const [location, setLocation] = useState('Sri Lanka');
  const [category, setCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [refused, setRefused] = useState<{ company: string; message: string }[]>([]);
  const [note, setNote] = useState('');
  return (
    <form className="card card-pad" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setError(''); setNote(''); setRefused([]);
      try {
        const r = await api('/api/career-pages', 'POST', { entries, default_location: location, category: category || null });
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
        <div className="grid content-start gap-4">
          <div className="label">
            <label htmlFor="add-category">Category (optional)</label>
            <CategoryPicker id="add-category" categories={categories} value={category} onChange={setCategory} />
            <span className="hint">Applies to every link in the box. You can add or change it later.</span>
          </div>
          <label className="label">Location, if a page doesn&apos;t say<input className="field" value={location} onChange={(e) => setLocation(e.target.value)} /></label>
        </div>
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

export function CareerRow({ page, categories }: { page: PageRow; categories: string[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(page.enabled);
  const [moving, setMoving] = useState(false);
  const [category, setCategory] = useState(page.category ?? '');
  const [saving, setSaving] = useState(false);
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
          <button type="button" className="btn btn-quiet btn-sm btn-icon ml-1" aria-label={`Change category of ${page.company}`} title="Change category" aria-expanded={moving}
            onClick={() => { setCategory(page.category ?? ''); setMoving((m) => !m); }}><FolderInput size={16} aria-hidden="true" /></button>
          <button type="button" className="btn btn-quiet btn-sm btn-icon" aria-label={`Check ${page.company} now`} title={`Check ${page.company} now`} disabled={busy} onClick={async () => {
            setBusy(true);
            try { const r = await api(`/api/career-pages/${page.id}/check`); setTitles(r?.titles ?? []); router.refresh(); }
            catch (e) { toast('bad', e instanceof Error ? e.message : 'The check could not run.'); }
            setBusy(false);
          }}>{busy ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <RefreshCw size={16} aria-hidden="true" />}</button>
          <ConfirmButton className="btn btn-quiet btn-sm btn-icon" label={`Remove ${page.company}`} title={`Remove ${page.company}?`} body="Surelane stops checking this company. Jobs you saved from it stay in your applications." confirm="Remove"
            onConfirm={async () => { await api(`/api/career-pages/${page.id}`, 'DELETE'); router.refresh(); }}><Trash2 size={16} aria-hidden="true" /></ConfirmButton>
        </span>
      </div>
      {moving && (
        <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={async (e) => {
          e.preventDefault(); setSaving(true);
          try { await api(`/api/career-pages/${page.id}`, 'PATCH', { category: category || null }); setMoving(false); router.refresh(); }
          catch (err) { toast('bad', err instanceof Error ? err.message : 'That did not save.'); }
          setSaving(false);
        }}>
          <div className="label min-w-[220px] flex-1 sm:max-w-sm">
            <label htmlFor={`category-${page.id}`}>Category for {page.company}</label>
            <CategoryPicker id={`category-${page.id}`} categories={categories} value={category} onChange={setCategory} />
          </div>
          <button className="btn btn-primary btn-sm" disabled={saving}>{saving && <LoaderCircle size={14} className="animate-spin" aria-hidden="true" />}Save</button>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setMoving(false)}>Cancel</button>
        </form>
      )}
      <a href={page.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex max-w-full items-center gap-1 text-[13px] text-soft hover:text-ink"><span className="truncate">{page.url}</span><ExternalLink size={12} className="shrink-0" aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a>
      {page.last_message && page.last_status !== 'ok' && <p className={`measure mt-1 text-[15px] ${refused ? 'font-semibold text-stop-strong' : 'text-soft'}`}>{page.last_message}</p>}
      {titles.length > 0 && <p className="mt-1 text-sm text-soft">Found: {titles.join(', ')}</p>}
      {page.last_checked && <p className="text-[13px] text-soft">Last checked {page.last_checked}</p>}
    </li>
  );
}
