'use client';
import { LoaderCircle, RotateCcw, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from './controls';
import { useToast } from './feedback';

/**
 * The roles and skills read from your CV that searches use. Any can be hidden, such as a past
 * job you don't want more of, and brought back later. Hidden ones still appear on your CV.
 */
export function CvKeywords({ keywords, hidden }: { keywords: string[]; hidden: string[] }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const hiddenSet = new Set(hidden.map((h) => h.toLowerCase()));
  const shown = keywords.filter((k) => !hiddenSet.has(k.toLowerCase()));
  const set = async (keyword: string, hide: boolean) => {
    setBusy(keyword);
    try {
      await api('/api/cv/keywords', 'POST', { keyword, hidden: hide });
      toast('ok', hide ? `"${keyword}" is no longer searched for.` : `"${keyword}" is searched for again.`);
      router.refresh();
    } catch (e) { toast('bad', e instanceof Error ? e.message : 'That change did not save.'); }
    setBusy(null);
  };
  return (
    <div>
      <p className="mb-3 text-sm text-soft">Roles and skills from your CV that searches use. Hide any you don&apos;t want jobs for, such as a past role. Your own keywords in Search settings come first.</p>
      {shown.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {shown.map((k) => (
            <li key={k} className="inline-flex items-center gap-0.5 rounded-full bg-sunken py-1 pl-3 pr-1 text-[13px] font-medium">
              {k}
              <button type="button" className="ml-0.5 grid h-6 w-6 place-items-center rounded-full text-soft hover:bg-surface hover:text-ink disabled:opacity-50"
                aria-label={`Stop searching for ${k}`} title="Don't search for this" disabled={busy !== null} onClick={() => set(k, true)}>
                {busy === k ? <LoaderCircle size={13} className="animate-spin" aria-hidden="true" /> : <X size={13} aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-soft">Every keyword from your CV is hidden. Searches use your keywords in Search settings.</p>}
      {hidden.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="eyebrow mb-2">Not searched</p>
          <ul className="flex flex-wrap gap-1.5">
            {hidden.map((k) => (
              <li key={k} className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-edge py-1 pl-3 pr-1 text-[13px] text-soft line-through decoration-soft/60">
                {k}
                <button type="button" className="ml-0.5 grid h-6 w-6 place-items-center rounded-full no-underline hover:bg-sunken hover:text-ink disabled:opacity-50"
                  aria-label={`Search for ${k} again`} title="Search for this again" disabled={busy !== null} onClick={() => set(k, false)}>
                  {busy === k ? <LoaderCircle size={13} className="animate-spin" aria-hidden="true" /> : <RotateCcw size={13} aria-hidden="true" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
