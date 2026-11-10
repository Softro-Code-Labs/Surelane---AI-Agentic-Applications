'use client';
import { Eye, EyeOff, FileUp, LoaderCircle, ShieldCheck, Trash2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import { api } from './controls';
import { ConfirmButton, useDialog, useToast } from './feedback';
import { Notice, SettingGroup } from './ui';

const ACCEPT = '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function useCvUpload() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const upload = async (file: File) => {
    setBusy(true); setError('');
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/cv', { method: 'POST', body: form }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    setBusy(false);
    if (input.current) input.current.value = '';
    if (!res?.ok) return setError(data?.error ?? 'The upload failed. Check your connection and try again.');
    router.refresh();
  };
  return { input, busy, error, upload };
}

export function CvReplace() {
  const { input, busy, error, upload } = useCvUpload();
  return (
    <div>
      <label className={`btn btn-quiet ${busy ? 'opacity-60' : ''}`}>
        {busy ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <FileUp size={16} aria-hidden="true" />}
        {busy ? 'Reading your CV' : 'Replace CV'}
        <input ref={input} type="file" accept={ACCEPT} className="sr-only" disabled={busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </label>
      {error && <p role="alert" className="mt-2 text-sm font-semibold text-stop-strong">{error}</p>}
    </div>
  );
}

export function CvDrop() {
  const { input, busy, error, upload } = useCvUpload();
  const [over, setOver] = useState(false);
  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files[0]) upload(e.dataTransfer.files[0]); };
  return (
    <div>
      <label onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}
        className={`flex cursor-pointer flex-col items-center rounded-lg border-2 border-dashed px-5 py-12 text-center transition-colors ${over ? 'border-primary bg-info-soft' : 'border-edge bg-surface hover:bg-sunken'}`}>
        {busy ? <LoaderCircle size={30} className="animate-spin text-road" aria-hidden="true" /> : <FileUp size={30} className="text-road" aria-hidden="true" />}
        <span className="mt-3 text-lg font-bold">{busy ? 'Reading your CV' : 'Upload your CV'}</span>
        <span className="mt-1 text-soft">Choose a PDF or DOCX file, or drop it here.</span>
        <input ref={input} type="file" accept={ACCEPT} className="sr-only" disabled={busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </label>
      {error && <p role="alert" className="mt-2 font-semibold text-stop-strong">{error}</p>}
      <p className="mt-3 flex items-start gap-2 text-[15px] text-soft"><ShieldCheck size={18} className="mt-0.5 shrink-0 text-safe-strong" aria-hidden="true" />Your CV is encrypted in your own database. Surelane uses it only to match jobs for you.</p>
    </div>
  );
}

export function CvRemove() {
  const router = useRouter();
  return (
    <ConfirmButton className="btn btn-danger-quiet" title="Remove your CV?" body="Searches stop until you upload a new CV. Your applications stay." confirm="Remove CV"
      onConfirm={async () => { await api('/api/cv', 'DELETE'); router.refresh(); }}><Trash2 size={16} aria-hidden="true" />Remove CV</ConfirmButton>
  );
}

function PasswordField({ mode }: { mode: 'login' | 'setup' }) {
  const [show, setShow] = useState(false);
  return (
    <label className="label">Password
      <span className="relative mt-1.5 block">
        <input name="password" type={show ? 'text' : 'password'} className="field pr-12 font-normal" required minLength={mode === 'setup' ? 10 : 1} autoComplete={mode === 'setup' ? 'new-password' : 'current-password'} aria-describedby={mode === 'setup' ? 'pw-hint' : undefined} />
        <button type="button" className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-soft hover:text-ink" aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)}>{show ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button>
      </span>
      {mode === 'setup' && <span id="pw-hint" className="hint">At least 10 characters.</span>}
    </label>
  );
}

export function AuthForm({ mode, needsCode }: { mode: 'login' | 'setup'; needsCode?: boolean }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form className="space-y-4" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true); setError('');
      const f = new FormData(e.currentTarget);
      try {
        await api(`/api/auth/${mode}`, 'POST', Object.fromEntries(f));
        location.href = '/';
      } catch (err) {
        setError(err instanceof Error ? err.message : 'That did not work.');
        setBusy(false);
      }
    }}>
      {mode === 'setup' && <label className="label">Your name<input name="name" className="field" required autoComplete="name" /></label>}
      <label className="label">Email<input name="email" type="email" className="field" required autoComplete="email" /></label>
      <PasswordField mode={mode} />
      {needsCode && <label className="label">Setup code<input name="code" className="field" required autoComplete="off" /><span className="hint">The SETUP_CODE you chose when you deployed Surelane.</span></label>}
      {error && <p role="alert" className="text-sm font-semibold text-stop-strong">{error}</p>}
      <button className="btn btn-primary w-full" disabled={busy}>{busy && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}{mode === 'setup' ? 'Create account' : 'Sign in'}</button>
    </form>
  );
}

/** Lists are entered one item at a time, so nobody has to remember a comma rule. */
function TokenField({ label, hint, placeholder, value, onChange }: { label: string; hint?: string; placeholder: string; value: string[]; onChange: (v: string[]) => void }) {
  const id = useId();
  const [draft, setDraft] = useState('');
  const add = (raw: string) => {
    const extra = raw.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);
    if (extra.length) onChange([...new Set([...value, ...extra])].slice(0, 50));
    setDraft('');
  };
  const key = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(draft); }
    if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
  };
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <div className="tokens mt-1.5">
        {value.map((t) => <span key={t} className="token">{t}<button type="button" aria-label={`Remove ${t}`} onClick={() => onChange(value.filter((x) => x !== t))}><X size={14} aria-hidden="true" /></button></span>)}
        <input id={id} value={draft} placeholder={value.length ? 'Add another' : placeholder} onChange={(e) => (e.target.value.includes(',') ? add(e.target.value) : setDraft(e.target.value))} onKeyDown={key} onBlur={() => add(draft)} />
      </div>
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

type Values = {
  preferred_countries: string[]; preferred_locations: string[]; industries: string[]; categories: string[]; extra_keywords: string[]; custom_feeds: string[];
  remote_pref: string; min_score: number; max_post_age_days: number; email_recipient: string; email_mode: string; email_no_results: string;
};

function Group({ id, title, hint, children }: { id: string; title: string; hint?: string; children: ReactNode }) {
  return <SettingGroup id={id} title={title} hint={hint}><div className="grid gap-4 sm:grid-cols-2">{children}</div></SettingGroup>;
}

export function SettingsForm({ s, emailProblem }: { s: any; emailProblem: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const from = (x: any): Values => ({
    preferred_countries: x.preferred_countries, preferred_locations: x.preferred_locations, industries: x.industries, categories: x.categories, extra_keywords: x.extra_keywords,
    custom_feeds: x.custom_feeds, remote_pref: x.remote_pref, min_score: x.min_score, max_post_age_days: x.max_post_age_days, email_recipient: x.email_recipient ?? '', email_mode: x.email_mode, email_no_results: x.email_no_results,
  });
  const [saved, setSaved] = useState<Values>(() => from(s));
  const [v, setV] = useState<Values>(() => from(s));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(v) !== JSON.stringify(saved);
  const set = <K extends keyof Values>(k: K, value: Values[K]) => setV({ ...v, [k]: value });
  const pick = (k: keyof Values) => (e: { target: { value: string } }) => set(k, e.target.value as never);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    addEventListener('beforeunload', warn);
    return () => removeEventListener('beforeunload', warn);
  }, [dirty]);
  const save = async () => {
    setBusy(true); setError('');
    try {
      await api('/api/settings', 'PATCH', { ...v, min_score: Number(v.min_score), max_post_age_days: Number(v.max_post_age_days), email_recipient: v.email_recipient.trim() || null });
      setSaved(v);
      toast('ok', 'Changes saved.');
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'That did not save.'); }
    setBusy(false);
  };
  const testMail = async () => {
    try { const r = await api('/api/email/test'); toast('ok', `Test email sent to ${r.recipient}.`); }
    catch (e) { toast('bad', e instanceof Error ? e.message : 'The test email failed.'); }
    router.refresh();
  };
  return (
    <>
      <Group id="looking" title="What to look for" hint="Your CV sets the main search. Add to it here.">
        <TokenField label="Job categories" placeholder="Business analyst" value={v.categories} onChange={(x) => set('categories', x)} />
        <TokenField label="Extra search keywords" placeholder="Power BI" value={v.extra_keywords} onChange={(x) => set('extra_keywords', x)} />
        <TokenField label="Industries" placeholder="Banking" value={v.industries} onChange={(x) => set('industries', x)} />
        <TokenField label="Sri Lankan locations" placeholder="Colombo" value={v.preferred_locations} onChange={(x) => set('preferred_locations', x)} />
        <TokenField label="Preferred countries" hint="Used when Global job opportunities are on, for searches and LinkedIn links." placeholder="Singapore" value={v.preferred_countries} onChange={(x) => set('preferred_countries', x)} />
        <label className="label">Work arrangement
          <select className="field" value={v.remote_pref} onChange={pick('remote_pref')}>
            <option value="any">Any</option><option value="remote">Remote only</option><option value="hybrid">Hybrid only</option><option value="onsite">On-site only</option>
          </select>
        </label>
        <label className="label">Minimum match: <span className="tabular">{v.min_score}%</span>
          <input type="range" min={45} max={95} step={5} className="mt-3 w-full" value={v.min_score} onChange={(e) => set('min_score', Number(e.target.value))} />
          <span className="hint">Lower shows more jobs, higher shows closer matches.</span>
        </label>
        <label className="label">Hide listings older than
          <span className="mt-1.5 flex items-center gap-2 font-normal"><input type="number" min={1} max={90} className="field max-w-24" value={v.max_post_age_days} onChange={(e) => set('max_post_age_days', Number(e.target.value))} />days</span>
          <span className="hint">Used when a listing gives no deadline.</span>
        </label>
      </Group>

      <Group id="email" title="Email" hint="Sent after scheduled searches, never while the agent is off.">
        {emailProblem && <div className="sm:col-span-2"><Notice tone="warn"><b>The last email could not be sent.</b> {emailProblem}</Notice></div>}
        <label className="label sm:col-span-2">Send alerts to<input type="email" autoComplete="email" className="field" value={v.email_recipient} onChange={pick('email_recipient')} /><span className="hint">Until you verify a domain in Resend, use the email you signed up to Resend with.</span></label>
        <label className="label">Which matches
          <select className="field" value={v.email_mode} onChange={pick('email_mode')}><option value="all">All matches above my minimum</option><option value="strong">Strong matches only</option></select>
        </label>
        <label className="label">When nothing new is found
          <select className="field" value={v.email_no_results} onChange={pick('email_no_results')}><option value="summary">Send a short summary</option><option value="silent">Send nothing</option></select>
        </label>
        <div className="sm:col-span-2"><button type="button" className="btn btn-quiet" onClick={testMail}>Send test email</button></div>
      </Group>

      <Group id="feeds" title="Extra sources" hint="Add a job feed from a site you trust.">
        <div className="sm:col-span-2">
          <TokenField label="RSS job feeds" hint="A feed is read only if the site allows it." placeholder="https://example.lk/jobs/feed" value={v.custom_feeds} onChange={(x) => set('custom_feeds', x)} />
        </div>
      </Group>

      {(dirty || error) && (
        <div className="savebar -mx-4 border-t border-line bg-surface px-4 py-3 sm:-mx-6 sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary" onClick={save} disabled={busy}>{busy && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}Save changes</button>
            <button type="button" className="btn btn-quiet" onClick={() => { setV(saved); setError(''); }}>Discard</button>
            {error ? <p role="alert" className="text-sm font-semibold text-stop-strong">{error}</p> : <span className="text-sm text-soft max-sm:sr-only">You have unsaved changes.</span>}
          </div>
        </div>
      )}
    </>
  );
}

export function ThemeControl({ initial }: { initial?: string }) {
  const [theme, setTheme] = useState(initial === 'light' || initial === 'dark' ? initial : 'system');
  const choose = (t: string) => {
    setTheme(t);
    document.cookie = t === 'system' ? 'theme=; path=/; max-age=0; samesite=lax' : `theme=${t}; path=/; max-age=31536000; samesite=lax`;
    if (t === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  };
  return (
    <fieldset>
      <legend className="sr-only">Appearance</legend>
      <div className="flex flex-wrap gap-5">
        {[['system', 'Match this device'], ['light', 'Light'], ['dark', 'Dark']].map(([key, label]) => (
          <label key={key} className="flex min-h-11 cursor-pointer items-center gap-2"><input type="radio" name="theme" className="h-4 w-4 accent-[var(--primary)]" checked={theme === key} onChange={() => choose(key!)} />{label}</label>
        ))}
      </div>
    </fieldset>
  );
}

export function AddJob() {
  const router = useRouter();
  const { ref, open, close } = useDialog();
  const heading = useId();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState('');
  const linkedin = /^https?:\/\/([a-z0-9-]+\.)*linkedin\.com\//i.test(url.trim());
  return (
    <>
      <button type="button" className="btn btn-quiet" onClick={open}>Add a job you found</button>
      <dialog ref={ref} className="sheet sheet-wide" aria-labelledby={heading}>
        <h2 id={heading} className="text-[1.25rem]">Add a job you found</h2>
        <p className="mt-1 text-soft">Found a vacancy on LinkedIn, TopJobs or another site? Paste it here to score it against your CV and track it.</p>
        <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={async (e) => {
          e.preventDefault(); setError(''); setBusy(true);
          try {
            const r = await api('/api/jobs', 'POST', Object.fromEntries(new FormData(e.currentTarget)));
            close();
            setUrl('');
            router.push(`/jobs/${r.id}`);
          } catch (err) { setError(err instanceof Error ? err.message : 'That job could not be added.'); }
          setBusy(false);
        }}>
          <label className="label sm:col-span-2">Link to the job<input name="url" type="url" required className="field" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.linkedin.com/jobs/view/…" /></label>
          {linkedin && (
            <div className="sm:col-span-2">
              <Notice tone="info">LinkedIn doesn&apos;t let other apps read its pages, so copy these four things from the job: its title, the company, the location and the &ldquo;About the job&rdquo; text. The more of the description you paste, the better the match.</Notice>
            </div>
          )}
          <label className="label">Job title<input name="title" required className="field" /></label>
          <label className="label">Company<input name="company" required className="field" /></label>
          <label className="label sm:col-span-2">Location<input name="location" defaultValue="Sri Lanka" className="field" /></label>
          <label className="label sm:col-span-2">Job description<textarea name="description" rows={6} required minLength={30} className="field" /></label>
          {error && <p role="alert" className="text-sm font-semibold text-stop-strong sm:col-span-2">{error}</p>}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <button type="button" className="btn btn-quiet" onClick={close}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>{busy && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}Score this job</button>
          </div>
        </form>
      </dialog>
    </>
  );
}

export function DataControls() {
  const router = useRouter();
  const toast = useToast();
  return (
    <div className="flex flex-wrap items-center gap-3">
      <ConfirmButton className="btn btn-quiet" title="Delete job history now?" body="This removes stored jobs and logs. Your CV and applications stay." confirm="Delete history"
        onConfirm={async () => { await api('/api/data', 'POST', { action: 'clear_history' }); toast('ok', 'Job history deleted.'); router.refresh(); }}>Delete job history now</ConfirmButton>
      <ConfirmButton className="btn btn-danger-quiet" title="Delete your account?" body="This permanently removes your CV, applications, history and account. It cannot be undone." confirm="Delete everything"
        onConfirm={async () => { await api('/api/data', 'POST', { action: 'delete_account' }); location.href = '/setup'; }}>Delete my account and all data</ConfirmButton>
    </div>
  );
}
