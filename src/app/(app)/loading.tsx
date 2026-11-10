import { Page } from '@/components/ui';

export default function Loading() {
  return (
    <Page>
      <p className="sr-only" role="status">Loading</p>
      <div aria-hidden="true">
        <div className="skel mb-2 h-3 w-24" />
        <div className="skel mb-3 h-8 w-64" />
        <div className="skel mb-8 h-4 w-96 max-w-full" />
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card grid grid-cols-[64px_1fr] gap-4 p-5 sm:grid-cols-[84px_1fr] sm:p-6">
              <div className="skel aspect-square rounded-full" />
              <div className="space-y-3"><div className="skel h-5 w-3/5" /><div className="skel h-4 w-2/5" /><div className="flex gap-2"><div className="skel h-6 w-20 rounded-full" /><div className="skel h-6 w-24 rounded-full" /></div><div className="skel h-4 w-4/5" /></div>
            </div>
          ))}
        </div>
      </div>
    </Page>
  );
}
