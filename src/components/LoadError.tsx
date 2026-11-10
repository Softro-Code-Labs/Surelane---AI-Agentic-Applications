'use client';
import { CloudOff, RotateCw } from 'lucide-react';
import { Page } from './ui';

/** Shown when a page can't load. Most often that is the free database having paused. */
export function LoadError({ retry }: { retry: () => void }) {
  return (
    <Page width="narrow">
      <div className="card p-8 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-warn-soft text-warn"><CloudOff size={26} aria-hidden="true" /></span>
        <h1 className="mt-5 text-[1.5rem]">This page could not load</h1>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-soft">This can be a brief connection problem, so try again first. If it keeps happening and you haven&apos;t opened Surelane for a while, your free Supabase database may be paused. Open Supabase, restore it, and try again.</p>
        <button type="button" className="btn btn-primary mt-6" onClick={() => retry()}><RotateCw size={16} aria-hidden="true" />Try again</button>
      </div>
    </Page>
  );
}
