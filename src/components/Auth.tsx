import { CircleCheck, MapPin, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { Logo } from './brand';

const PROMISES = ['Only jobs from sources that allow it.', 'Every job confirmed open before you see it.', 'Your CV stays encrypted in your own database.'];

/** A sample of what Surelane shows, so the sign-in screen explains the product at a glance. */
function Preview() {
  const r = 26, c = 2 * Math.PI * r;
  return (
    <div aria-hidden="true" className="relative mt-10 max-w-sm rounded-2xl border border-white/12 bg-white/[.07] p-4 shadow-[0_30px_60px_-20px_rgba(0,0,0,.6)] backdrop-blur-md">
      <div className="flex items-center gap-4">
        <div className="relative h-16 w-16 shrink-0">
          <svg viewBox="0 0 64 64" className="-rotate-90"><circle cx="32" cy="32" r={r} fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="6" /><circle cx="32" cy="32" r={r} fill="none" stroke="#6ee7b7" strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * 0.08} /></svg>
          <span className="absolute inset-0 flex items-center justify-center font-display text-lg font-bold">92</span>
        </div>
        <div className="min-w-0">
          <p className="truncate font-display font-semibold">Senior Software Engineer</p>
          <p className="mt-0.5 flex items-center gap-1 text-[13px] text-on-band-soft"><MapPin size={13} />Colombo · Hybrid</p>
          <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-200"><CircleCheck size={12} />Checked today: still open</p>
        </div>
      </div>
    </div>
  );
}

/** One screen, two jobs: say what Surelane promises, then get out of the way. */
export function AuthScreen({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <aside className="band band-grid relative overflow-hidden px-6 py-6 sm:px-10 lg:flex lg:flex-col lg:justify-between lg:py-12">
        <Logo size={34} className="text-white" />
        <div className="relative z-10 mt-6 hidden lg:block">
          <p className="max-w-md font-display text-[2.6rem] font-bold leading-[1.08] tracking-[-0.03em]">Your clear, safe lane to <span className="bg-gradient-to-r from-indigo-200 to-violet-200 bg-clip-text text-transparent">real jobs</span>.</p>
          <ul className="mt-7 space-y-3 text-on-band-soft">
            {PROMISES.map((p) => <li key={p} className="flex items-start gap-3"><span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10"><CircleCheck size={15} className="text-safe-bright" aria-hidden="true" /></span>{p}</li>)}
          </ul>
          <Preview />
        </div>
        <p className="mt-10 hidden items-center gap-2 text-[13px] text-on-band-soft lg:flex"><ShieldCheck size={15} aria-hidden="true" />Private by design. One owner, no public sign-up.</p>
      </aside>
      <main className="flex items-center justify-center bg-canvas p-6 sm:p-10">
        <div className="card w-full max-w-md p-6 shadow-[var(--shadow-lg)] sm:p-8">
          <h1 className="text-[1.7rem]">{title}</h1>
          <p className="mb-7 mt-1.5 text-sm text-soft">{intro}</p>
          {children}
        </div>
      </main>
    </div>
  );
}
