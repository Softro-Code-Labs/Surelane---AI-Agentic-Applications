'use client';
import { Bookmark, BookmarkCheck, LoaderCircle, LogOut, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useToast } from './feedback';

export async function api(url: string, method = 'POST', body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? 'That did not work. Try again.');
  return data;
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} className="switch" />;
}

export function useSetting(initial: boolean, field: string) {
  const router = useRouter();
  const toast = useToast();
  const [value, setValue] = useState(initial);
  const [, start] = useTransition();
  useEffect(() => setValue(initial), [initial]);
  const set = async (next: boolean) => {
    setValue(next);
    try {
      await api('/api/settings', 'PATCH', { [field]: next });
      start(() => router.refresh());
    } catch (e) {
      setValue(!next);
      toast('bad', e instanceof Error ? e.message : 'That did not save.');
    }
  };
  return { value, set };
}

export function AgentSwitch({ enabled }: { enabled: boolean }) {
  const { value, set } = useSetting(enabled, 'agent_enabled');
  return (
    <div className="flex items-center gap-2">
      <Switch checked={value} onChange={set} label="Surelane agent" />
      <span className="text-sm font-semibold max-[359px]:sr-only">{value ? 'Agent on' : 'Agent off'}</span>
    </div>
  );
}

export function SettingSwitch({ field, initial, label, hint }: { field: string; initial: boolean; label: string; hint?: string }) {
  const { value, set } = useSetting(initial, field);
  return (
    <div className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div>
        <div className="font-semibold">{label}</div>
        {hint && <div className="text-[15px] text-soft">{hint}</div>}
      </div>
      <Switch checked={value} onChange={set} label={label} />
    </div>
  );
}

export function SearchNow({ blockedBecause }: { blockedBecause?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [state, setState] = useState<'idle' | 'waiting' | 'running' | 'queued'>('idle');
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const run = async () => {
    try {
      const r = await api('/api/search');
      setState(r.started ? 'waiting' : 'queued');
      const began = Date.now();
      timer.current = setInterval(async () => {
        const s = await fetch('/api/search').then((x) => x.json()).catch(() => null);
        if (!s) return;
        if (s.running) setState('running');
        if (!s.running && !s.pending) {
          clearInterval(timer.current!);
          setState('idle');
          toast('ok', s.last?.summary ?? 'Search finished.');
          router.refresh();
        } else if (Date.now() - began > 15 * 60_000) {
          clearInterval(timer.current!);
          setState('idle');
          toast('info', 'This search is taking longer than usual. Check Search history shortly.');
        }
      }, 4000);
    } catch (e) {
      setState('idle');
      toast('bad', e instanceof Error ? e.message : 'The search could not start.');
    }
  };

  const busy = state !== 'idle';
  // aria-disabled, not disabled: the button stays reachable and explains why it can't run.
  return (
    <button type="button" className="btn btn-band" aria-disabled={Boolean(blockedBecause) || busy} onClick={() => {
      if (blockedBecause) toast('info', blockedBecause);
      else if (!busy) run();
    }}>
      {busy ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <Search size={16} aria-hidden="true" />}
      {state === 'running' ? 'Searching' : state === 'waiting' ? 'Starting' : state === 'queued' ? 'Queued' : <span>Search<span className="max-[479px]:sr-only"> now</span></span>}
    </button>
  );
}

export function SaveJob({ jobId, saved, className = '' }: { jobId: string; saved: boolean; className?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [done, setDone] = useState(saved);
  const [busy, setBusy] = useState(false);
  useEffect(() => setDone(saved), [saved]);
  return (
    <button type="button" className={`btn btn-quiet ${className}`} disabled={done || busy} onClick={async () => {
      setBusy(true);
      try {
        await api('/api/tracker', 'POST', { jobId });
        setDone(true);
        toast('ok', 'Saved to your applications.');
        router.refresh();
      } catch (e) { toast('bad', e instanceof Error ? e.message : 'That job could not be saved.'); }
      setBusy(false);
    }}>
      {done ? <BookmarkCheck size={16} aria-hidden="true" /> : <Bookmark size={16} aria-hidden="true" />}{done ? 'Saved' : 'Save job'}
    </button>
  );
}

export function SignOut({ className = '' }: { className?: string }) {
  return (
    <button type="button" className={className} onClick={async () => { await api('/api/auth/logout'); location.href = '/login'; }}>
      <LogOut size={16} aria-hidden="true" />Sign out
    </button>
  );
}
