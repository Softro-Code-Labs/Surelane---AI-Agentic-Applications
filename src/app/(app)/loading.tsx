import { Page } from '@/components/ui';

export default function Loading() {
  return (
    <Page>
      <p className="sr-only" role="status">Loading</p>
      <div aria-hidden="true">
        <div className="skel mb-3 h-9 w-64" />
        <div className="skel mb-8 h-5 w-96 max-w-full" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="grid grid-cols-[74px_1fr] gap-4 border-t border-line py-5 sm:grid-cols-[112px_1fr]">
            <div className="skel h-14" />
            <div className="space-y-2.5"><div className="skel h-6 w-3/5" /><div className="skel h-4 w-2/5" /><div className="skel h-4 w-4/5" /></div>
          </div>
        ))}
      </div>
    </Page>
  );
}
