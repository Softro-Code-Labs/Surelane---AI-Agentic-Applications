import { CircleCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { Logo } from './brand';

const PROMISES = ['Only jobs from sources that allow it.', 'Every job confirmed open before you see it.', 'Your CV stays encrypted in your own database.'];

/** One screen, two jobs: say what Surelane promises, then get out of the way. */
export function AuthScreen({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <aside className="band relative overflow-hidden px-6 py-7 sm:px-10 lg:flex lg:flex-col lg:justify-between lg:py-12">
        <Logo className="h-8 w-auto self-start lg:h-10" />
        <div className="relative z-10 mt-6 hidden lg:block">
          <p className="max-w-md text-[2.4rem] font-bold leading-[1.1]">Your clear, safe lane to real jobs.</p>
          <ul className="mt-6 space-y-2.5 text-on-band-soft">
            {PROMISES.map((p) => <li key={p} className="flex items-start gap-2.5"><CircleCheck size={20} className="mt-0.5 shrink-0 text-safe-bright" aria-hidden="true" />{p}</li>)}
          </ul>
        </div>
        <div className="mt-8 hidden lg:block" aria-hidden="true"><div className="-mx-10 h-[60px] bg-band-deep" style={{ backgroundImage: 'repeating-linear-gradient(90deg, rgba(255,255,255,.55) 0 26px, transparent 26px 46px)', backgroundSize: '100% 2px', backgroundPosition: '0 50%', backgroundRepeat: 'no-repeat' }} /></div>
      </aside>
      <main className="flex items-center justify-center bg-surface p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <h1 className="text-[1.9rem]">{title}</h1>
          <p className="mb-6 mt-1 text-soft">{intro}</p>
          {children}
        </div>
      </main>
    </div>
  );
}
