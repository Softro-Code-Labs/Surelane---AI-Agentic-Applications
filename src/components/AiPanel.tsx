'use client';
import { Copy, LoaderCircle, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from './controls';
import { useToast } from './feedback';

type Task = { id: string; status: string; engine: string; result: string | null; error: string | null };

const engineLabel = (t: Task) => (t.engine === 'rules' ? 'Written by the built-in engine, no AI model used.' : `Written by ${t.engine.split(':').slice(1).join(':')}.`);

export function AiPanel({ kind, jobId, cta, applicationId }: { kind: string; jobId?: string; cta: string; applicationId?: string | null }) {
  const toast = useToast();
  const [task, setTask] = useState<Task | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [saved, setSaved] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const load = async () => {
    setBusy(true); setError('');
    try {
      const t: Task = await api('/api/ai', 'POST', { kind, jobId });
      setTask(t); setText(t.result ?? '');
      if (t.status === 'queued') {
        timer.current = setInterval(async () => {
          const u: Task = await api(`/api/ai/${t.id}`, 'GET');
          if (u.status !== 'queued') { clearInterval(timer.current!); setTask(u); setText(u.result ?? ''); }
        }, 6000);
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'That could not be generated.'); }
    setBusy(false);
  };

  if (!task) return (
    <div>
      <button type="button" className="btn btn-quiet" onClick={load} disabled={busy}>{busy ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <Sparkles size={16} aria-hidden="true" />}{cta}</button>
      {error && <p role="alert" className="mt-2 text-sm font-semibold text-stop-strong">{error}</p>}
    </div>
  );
  return (
    <div>
      <textarea aria-label={cta} rows={kind === 'cover_letter' ? 14 : 8} className="field leading-relaxed" value={text} onChange={(e) => setText(e.target.value)} readOnly={kind !== 'cover_letter'} />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-soft">
        <span>{task.status === 'queued' ? 'This is a quick draft. Your AI model is preparing a better version.' : engineLabel(task)}</span>
        <span className="flex gap-2">
          <button type="button" className="btn btn-quiet btn-sm" onClick={async () => { await navigator.clipboard.writeText(text).then(() => toast('ok', 'Copied.'), () => toast('bad', 'Your browser blocked copying. Select the text and copy it yourself.')); }}><Copy size={15} aria-hidden="true" />Copy</button>
          {kind === 'cover_letter' && applicationId && (
            <button type="button" className="btn btn-quiet btn-sm" onClick={async () => {
              try { await api(`/api/tracker/${applicationId}`, 'PATCH', { cover_letter: text }); setSaved(true); toast('ok', 'Cover letter saved to this application.'); }
              catch (e) { toast('bad', e instanceof Error ? e.message : 'That did not save.'); }
            }}>{saved ? 'Saved to application' : 'Save to application'}</button>
          )}
        </span>
      </div>
    </div>
  );
}
