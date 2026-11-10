'use client';
import { Copy, LoaderCircle, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { api } from './controls';
import { useToast } from './feedback';

type Basis = 'reference' | 'scratch';
type Task = { id: string; status: string; engine: string; result: string | null; error: string | null; basis?: string | null };

const engineLabel = (t: Task) => (t.engine === 'rules' ? 'Written by the built-in engine, no AI model used.' : `Written by ${t.engine.split(':').slice(1).join(':')}.`);

function basisLabel(t: Task) {
  if (!t.basis) return '';
  if (t.basis === 'scratch') return 'Written from your CV.';
  return t.engine === 'rules'
    ? 'Your own letter with a new opening for this job and a line on the skills you share with it. Check that it reads well before sending.'
    : 'Your own letter, rewritten for this job in your style. Check every fact before sending.';
}

/**
 * hasLetter: you have saved your own cover letter, so you can choose between
 * tailoring it and writing a new one from your CV.
 */
export function AiPanel({ kind, jobId, cta, applicationId, hasLetter }: { kind: string; jobId?: string; cta: string; applicationId?: string | null; hasLetter?: boolean }) {
  const toast = useToast();
  const [task, setTask] = useState<Task | null>(null);
  const [busy, setBusy] = useState<Basis | 'plain' | null>(null);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);
  const letter = kind === 'cover_letter';

  const load = async (basis?: Basis) => {
    setBusy(basis ?? 'plain'); setError(''); setSaved(false);
    if (timer.current) clearInterval(timer.current);
    try {
      const t: Task = await api('/api/ai', 'POST', { kind, jobId, ...(basis ? { basis } : {}) });
      setTask(t); setText(t.result ?? '');
      if (t.status === 'queued') {
        timer.current = setInterval(async () => {
          const u: Task = await api(`/api/ai/${t.id}`, 'GET');
          if (u.status !== 'queued') { clearInterval(timer.current!); setTask(u); setText(u.result ?? ''); }
        }, 6000);
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'That could not be generated.'); }
    setBusy(null);
  };
  const spin = (b: Basis | 'plain', icon = true) => (busy === b ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : icon ? <Sparkles size={16} aria-hidden="true" /> : null);

  if (!task) return (
    <div>
      {letter && hasLetter ? (
        <>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary" onClick={() => load('reference')} disabled={Boolean(busy)}>{spin('reference')}Tailor my cover letter</button>
            <button type="button" className="btn btn-quiet" onClick={() => load('scratch')} disabled={Boolean(busy)}>{spin('scratch', false)}Write a new one</button>
          </div>
          <p className="mt-2 text-sm text-soft">Tailoring keeps your own letter&apos;s words and style, and fits it to this job. A new one is written from your CV.</p>
        </>
      ) : (
        <>
          <button type="button" className="btn btn-quiet" onClick={() => load(letter ? 'scratch' : undefined)} disabled={Boolean(busy)}>{spin(letter ? 'scratch' : 'plain')}{cta}</button>
          {letter && <p className="mt-2 text-sm text-soft">Written from your CV. Have your own cover letter? <Link href="/cover-letter" className="link">Save it</Link>, and Surelane tailors it to each job instead.</p>}
        </>
      )}
      {error && <p role="alert" className="mt-2 text-sm font-semibold text-stop-strong">{error}</p>}
    </div>
  );
  const tailored = Boolean(task.basis?.startsWith('reference:'));
  return (
    <div>
      <textarea aria-label={cta} rows={letter ? 16 : 8} className="field leading-relaxed" value={text} onChange={(e) => setText(e.target.value)} readOnly={!letter} />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-soft">
        <span className="min-w-0 flex-1 basis-64">
          {task.status === 'queued' ? 'This is a quick draft. Your AI model is preparing a better version.' : engineLabel(task)}
          {letter && task.status !== 'queued' && basisLabel(task) && <> {basisLabel(task)}</>}
        </span>
        <span className="flex flex-wrap gap-2">
          {letter && hasLetter && (
            <button type="button" className="btn btn-quiet btn-sm" disabled={Boolean(busy)} onClick={() => load(tailored ? 'scratch' : 'reference')}>
              {busy ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> : null}{tailored ? 'Write a new one instead' : 'Tailor my letter instead'}
            </button>
          )}
          <button type="button" className="btn btn-quiet btn-sm" onClick={async () => { await navigator.clipboard.writeText(text).then(() => toast('ok', 'Copied.'), () => toast('bad', 'Your browser blocked copying. Select the text and copy it yourself.')); }}><Copy size={15} aria-hidden="true" />Copy</button>
          {letter && applicationId && (
            <button type="button" className="btn btn-quiet btn-sm" onClick={async () => {
              try { await api(`/api/tracker/${applicationId}`, 'PATCH', { cover_letter: text }); setSaved(true); toast('ok', 'Cover letter saved to this application.'); }
              catch (e) { toast('bad', e instanceof Error ? e.message : 'That did not save.'); }
            }}>{saved ? 'Saved to application' : 'Save to application'}</button>
          )}
        </span>
      </div>
      {error && <p role="alert" className="mt-2 text-sm font-semibold text-stop-strong">{error}</p>}
    </div>
  );
}
