'use client';
import {
  BriefcaseBusiness, Building, Database, FileText, Globe, LayoutDashboard, Lightbulb, PenLine, ScrollText, SlidersHorizontal, SquareKanban, TriangleAlert, UserRound,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, type ReactNode } from 'react';
import { Logo } from './brand';
import { AgentSwitch, SearchNow, SignOut } from './controls';

type Item = { href: string; label: string; icon: LucideIcon };
type Group = { title?: string; items: Item[] };

// Every page is one click away on a desk. On a phone, the five lanes sit in a tab bar.
const GROUPS: Group[] = [
  { items: [
    { href: '/', label: 'Today', icon: LayoutDashboard },
    { href: '/jobs', label: 'Jobs', icon: BriefcaseBusiness },
    { href: '/tracker', label: 'Applications', icon: SquareKanban },
  ] },
  { title: 'You', items: [
    { href: '/cv', label: 'My CV', icon: FileText },
    { href: '/cover-letter', label: 'Cover letter', icon: PenLine },
    { href: '/insights', label: 'Career insights', icon: Lightbulb },
  ] },
  { title: 'Search setup', items: [
    { href: '/settings', label: 'Search settings', icon: SlidersHorizontal },
    { href: '/careers', label: 'Career pages', icon: Building },
    { href: '/sources', label: 'Job sources', icon: Globe },
    { href: '/history', label: 'Search history', icon: ScrollText },
    { href: '/storage', label: 'Storage', icon: Database },
  ] },
];

type Lane = { href: string; label: string; icon: LucideIcon; tabs?: Item[] };
const LANES: Lane[] = [
  { href: '/', label: 'Today', icon: LayoutDashboard },
  { href: '/jobs', label: 'Jobs', icon: BriefcaseBusiness },
  { href: '/tracker', label: 'Applications', icon: SquareKanban },
  { href: '/cv', label: 'You', icon: UserRound, tabs: GROUPS[1]!.items },
  { href: '/settings', label: 'Setup', icon: SlidersHorizontal, tabs: GROUPS[2]!.items },
];

const inHref = (path: string, href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`));
const inLane = (path: string, l: Lane) => inHref(path, l.href) || Boolean(l.tabs?.some((t) => inHref(path, t.href)));

/** On a phone, the pages inside "You" and "Setup" as a row of pills. */
function SubTabs({ tabs, path }: { tabs: Item[]; path: string }) {
  const bar = useRef<HTMLElement>(null);
  useEffect(() => { bar.current?.querySelector('[aria-current]')?.scrollIntoView({ inline: 'center', block: 'nearest' }); }, [path]);
  return (
    <nav ref={bar} aria-label="In this section" className="flex gap-1.5 overflow-x-auto px-4 pb-3 [scrollbar-width:none] sm:px-6 lg:hidden">
      {tabs.map((t) => {
        const on = inHref(path, t.href);
        return (
          <Link key={t.href} href={t.href} aria-current={on ? 'page' : undefined}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors ${on ? 'border-primary bg-primary text-on-primary' : 'border-line bg-surface text-soft hover:text-ink'}`}>
            <t.icon size={14} aria-hidden="true" />{t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function Shell({ agentOn, blockedBecause, jobs, apps, children }: { agentOn: boolean; blockedBecause?: string; jobs: number; apps: number; children: ReactNode }) {
  const path = usePathname();
  const lane = LANES.find((l) => inLane(path, l));
  const counts: Record<string, number> = { '/jobs': jobs, '/tracker': apps };
  const group = GROUPS.find((g) => g.items.some((i) => inHref(path, i.href)));
  const page = group?.items.find((i) => inHref(path, i.href));
  return (
    <div className="tabbar-space flex min-h-dvh flex-col lg:pl-[260px]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[260px] flex-col border-r border-line bg-surface lg:flex">
        <div className="flex h-16 shrink-0 items-center px-5">
          <Link href="/" aria-label="Surelane, go to Today" className="rounded-lg"><Logo size={30} /></Link>
        </div>
        <nav aria-label="Main" className="flex-1 space-y-6 overflow-y-auto px-3 pb-4 pt-2">
          {GROUPS.map((g, gi) => (
            <div key={gi}>
              {g.title && <p className="eyebrow mb-1.5 px-2.5">{g.title}</p>}
              <ul className="space-y-0.5">
                {g.items.map((i) => {
                  const on = inHref(path, i.href);
                  return (
                    <li key={i.href}>
                      <Link href={i.href} aria-current={on ? 'page' : undefined} className="nav-item">
                        <i.icon size={18} strokeWidth={on ? 2.2 : 1.8} aria-hidden="true" />{i.label}
                        {counts[i.href] ? <span className="nav-count" aria-label={`${counts[i.href]} ${i.href === '/jobs' ? 'open matches' : 'saved applications'}`}>{counts[i.href]}</span> : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="space-y-2 border-t border-line p-3">
          <div className={`rounded-xl border p-3 ${agentOn ? 'border-safe/25 bg-safe-soft' : 'border-warn/25 bg-warn-soft'}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold">
                <span className={`mr-1.5 inline-block h-2 w-2 rounded-full align-middle ${agentOn ? 'bg-safe' : 'bg-warn'}`} aria-hidden="true" />
                {agentOn ? 'Agent is searching' : 'Agent is paused'}
              </span>
              <AgentSwitch enabled={agentOn} compact />
            </div>
            <p className="mt-1 text-[12px] text-soft">{agentOn ? 'Searches run 3 times a day.' : 'No searches or job emails.'}</p>
          </div>
          <SignOut className="nav-item w-full" />
        </div>
      </aside>

      <header className="glass sticky top-0 z-30 border-b border-line">
        <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-10">
          <Link href="/" aria-label="Surelane, go to Today" className="rounded-lg lg:hidden"><Logo size={28} /></Link>
          <p className="hidden min-w-0 truncate text-sm text-soft lg:block">
            {group?.title ? <>{group.title}<span className="mx-2 text-edge" aria-hidden="true">/</span><span className="font-semibold text-ink">{page?.label}</span></>
              : <span className="font-semibold text-ink">{page?.label ?? 'Job detail'}</span>}
          </p>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <div className="lg:hidden"><AgentSwitch enabled={agentOn} /></div>
            <SearchNow blockedBecause={blockedBecause} />
          </div>
        </div>
        {lane?.tabs && <SubTabs tabs={lane.tabs} path={path} />}
      </header>

      {/* Today says this in its own headline, so a banner there would only repeat it. */}
      {!agentOn && path !== '/' && (
        <div role="status" className="border-b border-warn/20 bg-warn-soft text-warn-strong">
          <p className="mx-auto flex max-w-[1240px] items-center gap-2 px-4 py-2.5 text-sm font-semibold sm:px-6 lg:px-10">
            <TriangleAlert size={16} className="shrink-0" aria-hidden="true" />The agent is off. No searches run and no job emails are sent until you turn it back on.
          </p>
        </div>
      )}
      {children}

      <nav aria-label="Main, phone" className="glass fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line pb-[env(safe-area-inset-bottom)] lg:hidden">
        {LANES.map((l) => {
          const on = inLane(path, l);
          return (
            <Link key={l.href} href={l.href} aria-current={on ? 'page' : undefined}
              className={`relative flex h-[64px] flex-col items-center justify-center gap-1 text-[11px] font-semibold ${on ? 'text-primary' : 'text-soft'}`}>
              <span className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${on ? 'bg-info-soft' : ''}`}>
                <l.icon size={20} aria-hidden="true" strokeWidth={on ? 2.3 : 1.9} />
              </span>
              {l.label}
              {counts[l.href] ? <span className="absolute right-[calc(50%-24px)] top-2 min-w-[18px] rounded-full bg-primary px-1 text-center text-[10px] leading-[18px] text-on-primary">{counts[l.href]}</span> : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
