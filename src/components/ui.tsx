import { Check, Clock3, Inbox, Minus, TriangleAlert, X, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function Page({ children, width = 'wide' }: { children: ReactNode; width?: 'wide' | 'narrow' }) {
  return <div className={`mx-auto w-full px-4 py-6 sm:px-6 sm:py-8 lg:px-10 ${width === 'wide' ? 'max-w-[1240px]' : 'max-w-3xl'}`}>{children}</div>;
}

export function PageHead({ title, intro, action, eyebrow }: { title: string; intro?: ReactNode; action?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 sm:mb-8">
      <div className="min-w-0 max-w-2xl">
        {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
        <h1 className="text-[1.6rem] sm:text-[1.95rem]">{title}</h1>
        {intro && <p className="mt-1.5 text-[15px] text-soft">{intro}</p>}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}

/** A titled block of content. A card by default; plain sits on the page itself. */
export function Section({ title, hint, aside, children, id, plain = false, className = '' }: { title: string; hint?: ReactNode; aside?: ReactNode; children: ReactNode; id?: string; plain?: boolean; className?: string }) {
  return (
    <section id={id} className={`${plain ? 'mb-8' : 'card card-pad mb-5'} ${className}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2 className="text-[1.05rem] font-semibold">{title}</h2>
        {aside}
      </div>
      {hint && <p className="measure -mt-2.5 mb-4 text-sm text-soft">{hint}</p>}
      {children}
    </section>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>;
}

/** A settings group: what it is on the left, the controls on the right. */
export function SettingGroup({ title, hint, children, id }: { title: string; hint?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="card card-pad mb-5 grid gap-x-10 gap-y-4 lg:grid-cols-[240px_minmax(0,1fr)]">
      <div>
        <h2 className="text-[1.05rem] font-semibold">{title}</h2>
        {hint && <p className="mt-1 text-sm text-soft">{hint}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function Empty({ title, children, action, icon: Icon = Inbox }: { title: string; children?: ReactNode; action?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface/60 px-6 py-12 text-center">
      <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-info-soft text-primary"><Icon size={22} aria-hidden="true" /></span>
      <p className="font-display text-[1.05rem] font-semibold">{title}</p>
      {children && <div className="mx-auto mt-1.5 max-w-md text-sm text-soft">{children}</div>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

const TONE = {
  safe: 'bg-safe-soft text-safe-strong', info: 'bg-info-soft text-info-strong', warn: 'bg-warn-soft text-warn-strong',
  stop: 'bg-stop-soft text-stop-strong', plain: 'bg-sunken text-soft',
} as const;
export type Tone = keyof typeof TONE;

export function Tag({ tone = 'plain', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] font-semibold leading-[18px] ${TONE[tone]}`}>{children}</span>;
}

/** Banner messages. The word and the icon carry the meaning, so colour is never alone. */
export function Notice({ tone, children, role }: { tone: 'safe' | 'warn' | 'stop' | 'info'; children: ReactNode; role?: 'alert' | 'status' }) {
  const Icon = tone === 'safe' ? Check : tone === 'stop' ? X : tone === 'warn' ? TriangleAlert : Clock3;
  return (
    <div role={role} className={`flex gap-3 rounded-xl border border-current/15 px-4 py-3 text-sm ${TONE[tone]}`}>
      <Icon size={18} className="mt-px shrink-0" aria-hidden="true" />
      <div className="min-w-0 leading-relaxed">{children}</div>
    </div>
  );
}

const TIER = {
  Strong: { on: 3, text: 'text-safe-strong', stroke: 'var(--safe)', soft: 'bg-safe-soft' },
  Good: { on: 2, text: 'text-road', stroke: 'var(--primary)', soft: 'bg-info-soft' },
  Potential: { on: 1, text: 'text-soft', stroke: 'var(--edge)', soft: 'bg-sunken' },
} as const;

/** Signal bars for a match tier: three is strong, two good, one potential. */
export function Chevrons({ on, className = '' }: { on: number; className?: string }) {
  return (
    <svg viewBox="0 0 14 12" className={className} aria-hidden="true">
      {[0, 1, 2].map((i) => <rect key={i} x={i * 5} y={8 - i * 4} width="3.4" height={4 + i * 4} rx="1" fill="currentColor" opacity={i < on ? 1 : 0.25} />)}
    </svg>
  );
}

/** The match score as a ring, with its tier underneath. */
export function MatchMeter({ score, tier, size = 'sm' }: { score: number; tier: keyof typeof TIER; size?: 'sm' | 'lg' }) {
  const t = TIER[tier];
  const px = size === 'lg' ? 108 : 64;
  const stroke = size === 'lg' ? 8 : 6;
  const r = (px - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div role="img" aria-label={`${score}% match, ${tier}`} className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: px, height: px }}>
        <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`} className="-rotate-90">
          <circle cx={px / 2} cy={px / 2} r={r} fill="none" stroke="var(--sunken)" strokeWidth={stroke} />
          <circle cx={px / 2} cy={px / 2} r={r} fill="none" stroke={t.stroke} strokeWidth={stroke} strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(100, score)) / 100)} />
        </svg>
        <span className={`absolute inset-0 flex items-center justify-center font-display font-bold tabular ${size === 'lg' ? 'text-[1.7rem]' : 'text-[1.05rem]'}`}>
          {score}<span className="text-[0.6em] font-semibold text-soft">%</span>
        </span>
      </div>
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${t.soft} ${t.text}`}>
        <Chevrons on={t.on} className="h-2.5 w-auto" />{tier}
      </span>
    </div>
  );
}

export function SkillList({ label, items, tone }: { label: string; items: string[]; tone: 'safe' | 'warn' | 'stop' }) {
  if (!items.length) return null;
  return (
    <div className="mb-4">
      <div className="mb-2 text-[13px] font-semibold text-soft">{label}</div>
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
  return <Tag tone={tone}><Icon size={12} strokeWidth={2.6} aria-hidden="true" />{text}</Tag>;
}

/** A single figure on a dashboard. */
export function Stat({ label, value, icon: Icon, tone = 'info', hint }: { label: string; value: ReactNode; icon?: LucideIcon; tone?: Tone; hint?: ReactNode }) {
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-soft">{label}</span>
        {Icon && <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${TONE[tone]}`}><Icon size={16} aria-hidden="true" /></span>}
      </div>
      <div className="mt-2 font-display text-[1.75rem] font-bold leading-none tabular">{value}</div>
      {hint && <div className="mt-1.5 text-[12px] text-soft">{hint}</div>}
    </div>
  );
}
