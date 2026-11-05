import { Check, Clock3, Minus, TriangleAlert, X } from 'lucide-react';
import type { ReactNode } from 'react';

export function Page({ children, width = 'wide' }: { children: ReactNode; width?: 'wide' | 'narrow' }) {
  return <div className={`mx-auto w-full px-4 py-6 sm:px-6 sm:py-8 ${width === 'wide' ? 'max-w-[1120px]' : 'max-w-3xl'}`}>{children}</div>;
}

export function PageHead({ title, intro, action }: { title: string; intro?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="max-w-2xl">
        <h1 className="text-[1.75rem] sm:text-[2rem]">{title}</h1>
        {intro && <p className="mt-1 text-soft">{intro}</p>}
      </div>
      {action}
    </div>
  );
}

export function Section({ title, hint, aside, children, id }: { title: string; hint?: ReactNode; aside?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="mb-9">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-[1.3rem]">{title}</h2>
        {aside}
      </div>
      {hint && <p className="measure -mt-2 mb-3 text-[15px] text-soft">{hint}</p>}
      {children}
    </section>
  );
}

/** A settings group: what it is on the left, the controls on the right. */
export function SettingGroup({ title, hint, children, id }: { title: string; hint?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="grid gap-x-10 gap-y-3 border-t border-line py-7 lg:grid-cols-[260px_minmax(0,1fr)]">
      <div>
        <h2 className="text-[1.2rem]">{title}</h2>
        {hint && <p className="mt-1 text-[15px] text-soft">{hint}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-lg bg-sunken px-5 py-9 text-center">
      <p className="text-lg font-bold">{title}</p>
      {children && <div className="mx-auto mt-1 max-w-lg text-soft">{children}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

const TONE = {
  safe: 'bg-safe-soft text-safe-strong', info: 'bg-info-soft text-info-strong', warn: 'bg-warn-soft text-warn-strong',
  stop: 'bg-stop-soft text-stop-strong', plain: 'bg-sunken text-soft',
} as const;
export type Tone = keyof typeof TONE;

export function Tag({ tone = 'plain', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded px-2 pb-px pt-[3px] text-[13px] font-semibold leading-[18px] ${TONE[tone]}`}>{children}</span>;
}

/** Banner messages. The word and the icon carry the meaning, so colour is never alone. */
export function Notice({ tone, children, role }: { tone: 'safe' | 'warn' | 'stop' | 'info'; children: ReactNode; role?: 'alert' | 'status' }) {
  const Icon = tone === 'safe' ? Check : tone === 'stop' ? X : tone === 'warn' ? TriangleAlert : Clock3;
  return (
    <div role={role} className={`flex gap-2.5 rounded-md px-3.5 pb-2 pt-2.5 ${TONE[tone]}`}>
      <Icon size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

const TIER = { Strong: { on: 3, text: 'text-safe-strong' }, Good: { on: 2, text: 'text-road' }, Potential: { on: 1, text: 'text-soft' } } as const;

/** The logo's three chevrons, turned to the direction of travel. Three is strong, two good, one potential. */
export function Chevrons({ on, className }: { on: number; className?: string }) {
  return (
    <svg viewBox="0 0 46 16" className={className} aria-hidden="true">
      {[0, 1, 2].map((i) => <path key={i} d={`M${i * 15 + 3} 2 l8 6 -8 6`} fill="none" stroke="currentColor" strokeWidth="4" opacity={i < on ? 1 : 0.2} />)}
    </svg>
  );
}

export function MatchMeter({ score, tier, size = 'sm' }: { score: number; tier: keyof typeof TIER; size?: 'sm' | 'lg' }) {
  const t = TIER[tier];
  return (
    <div role="img" aria-label={`${score}% match, ${tier}`} className={t.text}>
      <div className={`font-bold leading-none tabular ${size === 'lg' ? 'text-[2.4rem] sm:text-[3rem]' : 'text-[1.7rem] sm:text-[2rem]'}`}>{score}<span className="text-[0.55em]">%</span></div>
      <Chevrons on={t.on} className={`mt-1.5 ${size === 'lg' ? 'h-4' : 'h-3'} w-auto`} />
      <div className="mt-1 text-[13px] font-semibold">{tier}<span className="max-sm:hidden"> match</span></div>
    </div>
  );
}

export function SkillList({ label, items, tone }: { label: string; items: string[]; tone: 'safe' | 'warn' | 'stop' }) {
  if (!items.length) return null;
  return (
    <div className="mb-4">
      <div className="mb-1.5 text-sm font-bold">{label}</div>
      <div className="flex flex-wrap gap-1.5">{items.map((s) => <Tag key={s} tone={tone}>{s}</Tag>)}</div>
    </div>
  );
}

export function StatusText({ status }: { status: string }) {
  // Each status has its own icon too: green and red can look alike with colour blindness.
  const map: Record<string, [string, Tone, typeof Check]> = {
    completed: ['Completed', 'safe', Check], partial: ['Partly completed', 'warn', TriangleAlert], failed: ['Failed', 'stop', X], running: ['Running', 'info', Clock3],
    cancelled: ['Cancelled', 'plain', Minus], skipped: ['Skipped', 'plain', Minus], missed: ['Missed', 'stop', X], success: ['Checked', 'safe', Check],
  };
  const [text, tone, Icon] = map[status] ?? [status, 'plain' as const, Minus];
  return <Tag tone={tone}><Icon size={13} aria-hidden="true" className="-mt-px" />{text}</Tag>;
}
