'use client';
import { BriefcaseBusiness, ClipboardList, Route, SlidersHorizontal, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, type ReactNode } from 'react';
import { Logo } from './brand';
import { AgentSwitch, SearchNow, SignOut } from './controls';

type Tab = { href: string; label: string };
type Lane = Tab & { icon: typeof Route; short?: string; tabs?: Tab[] };

// Five destinations. Everything else lives one step inside "You" or "Search setup".
const LANES: Lane[] = [
  { href: '/', label: 'Today', icon: Route },
  { href: '/jobs', label: 'Jobs', icon: BriefcaseBusiness },
  { href: '/tracker', label: 'Applications', icon: ClipboardList },
  { href: '/cv', label: 'You', icon: UserRound, tabs: [{ href: '/cv', label: 'My CV' }, { href: '/insights', label: 'Career insights' }] },
  {
    href: '/settings', label: 'Search setup', short: 'Setup', icon: SlidersHorizontal,
    tabs: [{ href: '/settings', label: 'Search settings' }, { href: '/careers', label: 'Career pages' }, { href: '/sources', label: 'Job sources' }, { href: '/history', label: 'Search history' }, { href: '/storage', label: 'Storage' }],
  },
];

const inHref = (path: string, href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`));
const inLane = (path: string, l: Lane) => inHref(path, l.href) || Boolean(l.tabs?.some((t) => inHref(path, t.href)));

function Count({ n, label }: { n?: number; label: string }) {
  if (!n) return null;
  return <span className="ml-1.5 rounded bg-white/18 px-1.5 pt-px text-[13px] font-semibold tabular" aria-label={label}>{n}</span>;
}

function SubTabs({ tabs, path }: { tabs: Tab[]; path: string }) {
  const bar = useRef<HTMLElement>(null);
  // On a phone the tabs scroll sideways, so bring the current one into view.
  useEffect(() => { bar.current?.querySelector('[aria-current]')?.scrollIntoView({ inline: 'center', block: 'nearest' }); }, [path]);
  return (
    <div className="border-b border-line bg-surface">
      <nav ref={bar} aria-label="In this section" className="mx-auto flex max-w-[1120px] gap-1 overflow-x-auto px-2 [scrollbar-width:none] sm:px-4">
        {tabs.map((t) => {
          const on = inHref(path, t.href);
          return (
            <Link key={t.href} href={t.href} aria-current={on ? 'page' : undefined}
              className={`relative shrink-0 px-3 pb-2.5 pt-3 text-[15px] ${on ? 'font-bold text-ink after:absolute after:inset-x-2 after:bottom-0 after:h-[3px] after:bg-primary' : 'text-soft hover:text-ink'}`}>
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function Shell({ agentOn, blockedBecause, jobs, apps, children }: { agentOn: boolean; blockedBecause?: string; jobs: number; apps: number; children: ReactNode }) {
  const path = usePathname();
  const lane = LANES.find((l) => inLane(path, l));
  const counts: Record<string, { n: number; label: string }> = {
    '/jobs': { n: jobs, label: `${jobs} open matches` }, '/tracker': { n: apps, label: `${apps} saved applications` },
  };
  return (
    <div className="tabbar-space flex min-h-dvh flex-col">
      <header className="band sticky top-0 z-30">
        <div className="mx-auto flex h-[60px] max-w-[1120px] items-center gap-3 px-4 sm:gap-6 sm:px-6">
            <Link href="/" aria-label="Surelane, go to Today" className="shrink-0"><Logo className="h-[24px] w-auto sm:h-7" /></Link>
            <nav aria-label="Main" className="hidden items-stretch gap-0.5 self-stretch lg:flex">
              {LANES.map((l) => {
                const on = inLane(path, l);
                return (
                  <Link key={l.href} href={l.href} aria-current={on ? 'page' : undefined}
                    className={`relative flex items-center px-3 pt-0.5 text-[15px] font-semibold ${on ? 'text-white after:absolute after:inset-x-3 after:bottom-0 after:h-1 after:bg-safe-bright' : 'text-on-band-soft hover:text-white'}`}>
                    {l.label}{counts[l.href] && <Count {...counts[l.href]!} />}
                  </Link>
                );
              })}
            </nav>
            <div className="ml-auto flex items-center gap-3">
              <AgentSwitch enabled={agentOn} />
              <SearchNow blockedBecause={blockedBecause} />
              <SignOut className="hidden items-center gap-1.5 text-sm font-semibold text-on-band-soft hover:text-white xl:inline-flex" />
            </div>
        </div>
      </header>
      {lane?.tabs && <SubTabs tabs={lane.tabs} path={path} />}
      {/* Today says this in its own headline, so a banner there would only repeat it. */}
      {!agentOn && path !== '/' && (
        <div role="status" className="bg-warn-soft text-warn-strong">
          <p className="mx-auto max-w-[1120px] px-4 pb-1.5 pt-2.5 text-[15px] font-semibold sm:px-6">The agent is off. No searches run and no job emails are sent until you turn it back on.</p>
        </div>
      )}
      {children}
      <nav aria-label="Main, phone" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        {LANES.map((l) => {
          const on = inLane(path, l);
          return (
            <Link key={l.href} href={l.href} aria-current={on ? 'page' : undefined}
              className={`relative flex h-16 flex-col items-center justify-center gap-0.5 text-[12px] leading-tight ${on ? 'font-bold text-primary before:absolute before:inset-x-4 before:top-0 before:h-[3px] before:bg-primary' : 'text-soft'}`}>
              <l.icon size={22} aria-hidden="true" strokeWidth={on ? 2.4 : 2} />{l.short ?? l.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
