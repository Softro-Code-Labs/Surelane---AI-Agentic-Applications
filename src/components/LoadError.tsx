'use client';
import { RotateCw } from 'lucide-react';
import { Page } from './ui';

/** Shown when a page can't load. Most often that is the free database having paused. */
export function LoadError({ retry }: { retry: () => void }) {
  return (
    <Page width="narrow">
      <h1 className="text-[1.75rem]">This page could not load</h1>
      <p className="mt-2 text-soft">This can be a brief connection problem, so try again first. If it keeps happening and you haven&apos;t opened Surelane for a while, your free Supabase database may be paused. Open Supabase, restore it, and try again.</p>
      <button type="button" className="btn btn-primary mt-4" onClick={() => retry()}><RotateCw size={16} aria-hidden="true" />Try again</button>
    </Page>
  );
}
