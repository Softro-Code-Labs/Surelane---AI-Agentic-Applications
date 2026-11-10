'use client';
import { FileUp, LoaderCircle, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState, type DragEvent } from 'react';
import { api } from './controls';
import { ConfirmButton, useToast } from './feedback';

const ACCEPT = '.pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain';
const MIN = 150;

function useLetterUpload() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const upload = async (file: File) => {
    setBusy(true); setError('');
    const form = new FormData();
    form.append('file', file);
    const res = await fetch('/api/cover-letter', { method: 'POST', body: form }).catch(() => null);
    const data = await res?.json().catch(() => ({}));
    setBusy(false);
    if (input.current) input.current.value = '';
    if (!res?.ok) return setError(data?.error ?? 'The upload failed. Check your connection and try again.');
    router.refresh();
  };
  return { input, busy, error, upload };
}

/** First time: upload a file or paste the text. */
export function CoverLetterAdd() {
  const router = useRouter();
  const { input, busy, error, upload } = useLetterUpload();
  const [over, setOver] = useState(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [pasteError, setPasteError] = useState('');
  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); if (e.dataTransfer.files[0]) upload(e.dataTransfer.files[0]); };
  return (
    <div className="space-y-6">
      <div>
        <label onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}
          className={`flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors ${over ? 'border-primary bg-info-soft' : 'border-line bg-surface hover:border-primary/50 hover:bg-sunken/60'}`}>
          <span className="brand-gradient flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-[0_10px_24px_-10px_var(--brand-glow)]">{busy ? <LoaderCircle size={26} className="animate-spin" aria-hidden="true" /> : <FileUp size={26} aria-hidden="true" />}</span>
          <span className="mt-4 font-display text-lg font-semibold">{busy ? 'Reading your cover letter' : 'Upload your cover letter'}</span>
          <span className="mt-1 text-sm text-soft">Choose a PDF, DOCX or text file, or drop it here.</span>
          <span className="btn btn-primary btn-sm mt-5" aria-hidden="true">Choose file</span>
          <input ref={input} type="file" accept={ACCEPT} className="sr-only" disabled={busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
        {error && <p role="alert" className="mt-2 font-semibold text-stop-strong">{error}</p>}
      </div>

      <div className="flex items-center gap-3 text-[12px] font-semibold uppercase tracking-wider text-soft" aria-hidden="true"><span className="divider flex-1" />or<span className="divider flex-1" /></div>

      <form className="card card-pad" onSubmit={async (e) => {
        e.preventDefault(); setSaving(true); setPasteError('');
        try { await api('/api/cover-letter', 'POST', { text }); router.refresh(); }
        catch (err) { setPasteError(err instanceof Error ? err.message : 'That did not save.'); }
        setSaving(false);
      }}>
        <label className="label">Or paste it
          <textarea className="field mt-1.5 leading-relaxed" rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder="Dear Hiring Manager, …" />
        </label>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-soft">{text.trim().length < MIN ? `At least ${MIN} characters.` : `${text.trim().length.toLocaleString()} characters.`}</span>
          <button className="btn btn-primary" disabled={saving || text.trim().length < MIN}>{saving && <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />}Save cover letter</button>
        </div>
        {pasteError && <p role="alert" className="mt-2 font-semibold text-stop-strong">{pasteError}</p>}
      </form>

      <p className="flex items-start gap-2 text-sm text-soft"><ShieldCheck size={18} className="mt-px shrink-0 text-safe-strong" aria-hidden="true" />Your cover letter is encrypted in your own database, like your CV. Template blanks such as [Company Name] are fine: Surelane fills them in for each job.</p>
    </div>
  );
}

/** After saving: edit the text, replace the file, or remove the letter. */
export function CoverLetterEditor({ initial }: { initial: string }) {
  const router = useRouter();
  const toast = useToast();
  const [text, setText] = useState(initial);
  const [saving, setSaving] = useState(false);
  const changed = text !== initial;
  return (
    <div>
      <textarea aria-label="Your cover letter" className="field leading-relaxed" rows={18} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-soft">{changed ? 'You have unsaved changes.' : 'Edit it here. Tailored letters use the saved version.'}</span>
        <span className="flex gap-2">
          {changed && <button type="button" className="btn btn-quiet btn-sm" onClick={() => setText(initial)}>Undo changes</button>}
          <button type="button" className="btn btn-primary btn-sm" disabled={!changed || saving || text.trim().length < MIN} onClick={async () => {
            setSaving(true);
            try { await api('/api/cover-letter', 'PATCH', { text }); toast('ok', 'Cover letter saved.'); router.refresh(); }
            catch (e) { toast('bad', e instanceof Error ? e.message : 'That did not save.'); }
            setSaving(false);
          }}>{saving ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> : <Save size={15} aria-hidden="true" />}Save changes</button>
        </span>
      </div>
    </div>
  );
}

export function CoverLetterReplace() {
  const { input, busy, error, upload } = useLetterUpload();
  return (
    <div>
      <label className={`btn btn-quiet ${busy ? 'opacity-60' : ''}`}>
        {busy ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <FileUp size={16} aria-hidden="true" />}
        {busy ? 'Reading your letter' : 'Replace with a file'}
        <input ref={input} type="file" accept={ACCEPT} className="sr-only" disabled={busy} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </label>
      {error && <p role="alert" className="mt-2 text-sm font-semibold text-stop-strong">{error}</p>}
    </div>
  );
}

export function CoverLetterRemove() {
  const router = useRouter();
  return (
    <ConfirmButton className="btn btn-danger-quiet" title="Remove your cover letter?" body="New cover letters will be written from your CV instead. Letters already saved to applications stay." confirm="Remove cover letter"
      onConfirm={async () => { await api('/api/cover-letter', 'DELETE'); router.refresh(); }}><Trash2 size={16} aria-hidden="true" />Remove cover letter</ConfirmButton>
  );
}
