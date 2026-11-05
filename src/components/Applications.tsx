'use client';
import { ChevronsRight, ExternalLink, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { STAGES } from '@/lib/stages';
import { api } from './controls';
import { ConfirmButton, useToast } from './feedback';

const NEXT: Record<string, string> = { Saved: 'Applied', Interested: 'Applied', Applied: 'Interview', Interview: 'Shortlisted', Shortlisted: 'Offer Received' };

export function ApplicationControls({ id, title, status, notes, url }: { id: string; title: string; status: string; notes: string; url: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [stage, setStage] = useState(status);
  const [text, setText] = useState(notes);
  const [note, setNote] = useState(notes);
  const move = async (to: string) => {
    const was = stage;
    setStage(to);
    try { await api(`/api/tracker/${id}`, 'PATCH', { status: to }); toast('ok', `Moved to ${to}.`); router.refresh(); }
    catch (e) { setStage(was); toast('bad', e instanceof Error ? e.message : 'That did not save.'); }
  };
  const next = NEXT[stage];
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-[190px_minmax(0,1fr)]">
      <select aria-label={`Stage for ${title}`} className="field" value={stage} onChange={(e) => move(e.target.value)}>
        {[...STAGES, 'Rejected'].map((s) => <option key={s}>{s}</option>)}
      </select>
      <input aria-label={`Notes for ${title}`} className="field" placeholder="Add a note, it saves by itself" value={text} onChange={(e) => setText(e.target.value)}
        onBlur={async () => {
          if (text === note) return;
          try { await api(`/api/tracker/${id}`, 'PATCH', { notes: text }); setNote(text); toast('ok', 'Note saved.'); }
          catch (e) { toast('bad', e instanceof Error ? e.message : 'That note did not save.'); }
        }} />
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
        {next && <button type="button" className="btn btn-primary btn-sm" onClick={() => move(next)}><ChevronsRight size={16} aria-hidden="true" />Move to {next}</button>}
        {url && <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-quiet btn-sm"><span>Open<span className="max-[419px]:sr-only"> listing</span></span><ExternalLink size={14} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a>}
        <ConfirmButton className="btn btn-quiet btn-sm btn-icon ml-auto" label={`Remove ${title}`} title="Remove this application?" body={`${title} and your notes on it will be deleted. This cannot be undone.`} confirm="Remove"
          onConfirm={async () => { await api(`/api/tracker/${id}`, 'DELETE'); toast('ok', 'Application removed.'); router.refresh(); }}><Trash2 size={16} aria-hidden="true" /></ConfirmButton>
      </div>
    </div>
  );
}
