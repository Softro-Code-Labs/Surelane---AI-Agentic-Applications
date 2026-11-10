import { ArrowRight, BookmarkCheck, BriefcaseBusiness, CircleAlert, CircleArrowRight, CircleCheck, Clock3, Gauge, Sparkles, Target, TrendingUp } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { JobRow } from '@/components/JobRow';
import { TodayLane } from '@/components/TodayLane';
import { Empty, Page, Section, Stat } from '@/components/ui';
import { one, q } from '@/lib/db';
import { recommended } from '@/lib/jobs';
import { RECOMMENDABLE, SCOPE_OFF, getCv, getSettings, scopeLabel, scopeSql, searchesOff } from '@/lib/settings';
import { SLOTS, atColombo, colomboDate, formatColombo, nextSlot } from '@/lib/schedule';
import { lastEmailProblem } from '@/lib/notify/email';
import { plural } from '@/lib/plural';

export const metadata: Metadata = { title: 'Today' };

const DAY_START = 7 * 60, DAY_END = 18 * 60;
const pos = (min: number) => Math.min(100, Math.max(0, ((min - DAY_START) / (DAY_END - DAY_START)) * 100));

type Step = { title: string; href?: string; done: boolean; note: string };

function FirstSteps({ steps }: { steps: Step[] }) {
  return (
    <section className="mb-6">
      <div className="mb-4">
        <h2 className="text-[1.15rem] font-semibold">Set up your lane</h2>
        <p className="text-sm text-soft">Three steps, then Surelane searches for you every day.</p>
      </div>
      <ol className="grid gap-3 md:grid-cols-3">
        {steps.map((s, i) => {
          const body = (
            <>
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-display font-bold ${s.done ? 'bg-safe-soft text-safe-strong' : 'brand-gradient text-white shadow-[0_6px_16px_-6px_var(--brand-glow)]'}`}>
                {s.done ? <CircleCheck size={18} aria-label="Done" /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className="block font-semibold">{s.title}</span>
                <span className="mt-0.5 block text-sm text-soft">{s.note}</span>
              </span>
              {s.href && !s.done && <ArrowRight size={18} className="ml-auto mt-2 shrink-0 text-soft" aria-hidden="true" />}
            </>
          );
          return (
            <li key={s.title} className={`card card-hover ${s.done ? 'opacity-80' : ''}`}>
              {s.href ? <Link href={s.href} className="flex h-full gap-3 rounded-2xl p-5">{body}</Link> : <div className="flex h-full gap-3 p-5">{body}</div>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Need({ href, tone, children }: { href: string; tone: 'do' | 'look' | 'stop'; children: ReactNode }) {
  const style = tone === 'do' ? 'bg-info-soft text-primary' : tone === 'look' ? 'bg-warn-soft text-warn' : 'bg-stop-soft text-stop';
  const Icon = tone === 'do' ? CircleArrowRight : CircleAlert;
  return (
    <li>
      <Link href={href} className="group flex items-center gap-3 rounded-xl px-2 py-2.5 text-sm font-semibold hover:bg-sunken">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${style}`}><Icon size={17} aria-hidden="true" /></span>
        <span className="flex-1">{children}</span>
        <ArrowRight size={16} className="shrink-0 text-soft transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </Link>
    </li>
  );
}

function greeting(now: Date) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Colombo' }).format(now));
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

export default async function Today() {
  const [s, cv] = await Promise.all([getSettings(), getCv()]);
  const now = new Date();
  const today = colomboDate(now);
  const runs = await q<{ slot_key: string; status: string }>(`SELECT slot_key, status FROM search_runs WHERE slot_date=$1 AND slot_key IS NOT NULL`, [today]);
  const midnight = atColombo(today, '00:00');
  const stats = (await one<Record<string, string>>(
    `SELECT (SELECT count(*) FROM jobs) total, count(*) FILTER (WHERE j.first_seen_at >= $2) today,
       count(*) FILTER (WHERE j.tier='Strong') strong, count(*) FILTER (WHERE j.tier='Good') good, count(*) FILTER (WHERE j.tier='Potential') potential
     FROM jobs j WHERE ${RECOMMENDABLE} ${scopeSql(s)} AND j.score >= $1`, [s.min_score, midnight]))!;
  const saved = Number((await one<{ n: string }>(`SELECT count(*) n FROM applications`))!.n);
  const closing = Number((await one<{ n: string }>(`SELECT count(*) n FROM applications WHERE status IN ('Saved','Interested') AND deadline >= now() AND deadline < now() + interval '7 days'`))!.n);
  const unreadable = Number((await one<{ n: string }>(`SELECT count(*) n FROM career_pages WHERE enabled AND last_status IN ('not_allowed','needs_browser','error')`))!.n);
  const last = await one<{ started_at: Date; status: string }>(`SELECT started_at, status FROM search_runs WHERE status NOT IN ('missed','running') ORDER BY started_at DESC LIMIT 1`);
  const emailProblem = await lastEmailProblem();
  const top = await recommended(s, {}, 3);
  const next = nextSlot(now, s);

  const nowMin = Math.round((now.getTime() - midnight.getTime()) / 60_000);
  const slots = SLOTS.map((slot) => {
    const [h, m] = slot.time.split(':').map(Number) as [number, number];
    const at = h * 60 + m;
    return { key: slot.key, field: slot.field, label: slot.label, enabled: Boolean(s[slot.field as keyof typeof s]), position: pos(at), passed: nowMin > at, result: runs.find((r) => r.slot_key === slot.key)?.status ?? null };
  });
  const title = !s.agent_enabled ? 'The agent is off' : !cv ? 'Upload your CV to start' : searchesOff(s) ? 'Local and Global are both off' : next ? `Next search at ${next.label}${colomboDate(next.at) === today ? '' : ' tomorrow'}` : 'All three searches are off';
  const area = scopeLabel(s);
  const subtitle = !s.agent_enabled ? 'No searches run and no job emails are sent until you turn it back on. Your schedule stays saved.' : !cv ? 'Surelane searches three times a day once it knows what fits you.' : searchesOff(s) ? SCOPE_OFF : !next ? 'Turn on a time below to resume automatic searches.' : `Sri Lanka time. Searching ${area}.`;
  const strong = Number(stats.strong);
  const setupDone = Boolean(cv) && Boolean(last);
  const steps: Step[] = [
    { title: 'Upload your CV', href: '/cv', done: Boolean(cv), note: 'Surelane reads it to learn what fits you.' },
    { title: 'Choose what to look for', href: '/settings#looking', done: s.preferred_locations.length + s.categories.length + s.extra_keywords.length > 0, note: 'Add locations, categories or keywords.' },
    { title: 'Run your first search', done: Boolean(last), note: cv ? 'Press Search at the top of the page, or wait for the next search time.' : 'You can do this once your CV is in.' },
  ];
  const lastBad = last && (last.status === 'failed' || last.status === 'partial');
  const needs = strong > 0 || closing > 0 || unreadable > 0 || lastBad || emailProblem;

  return (
    <Page>
      <section className="band band-grid mb-6 overflow-hidden rounded-3xl px-5 pb-5 pt-6 shadow-[var(--shadow-lg)] sm:px-8 sm:pt-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-sm font-medium text-on-band-soft">{greeting(now)} · {formatColombo(now, 'date')}</p>
            <h1 className="mt-1 text-[1.75rem] text-white sm:text-[2.25rem]">{title}</h1>
            <p className="mt-1.5 text-[15px] text-on-band-soft">{subtitle}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!cv ? <Link href="/cv" className="btn btn-band btn-lg">Upload your CV<ArrowRight size={16} aria-hidden="true" /></Link>
              : strong > 0 ? <Link href="/jobs?tier=Strong" className="btn btn-band">See {plural(strong, 'strong match', 'strong matches')}<ArrowRight size={16} aria-hidden="true" /></Link>
                : <Link href="/jobs" className="btn btn-band">Browse jobs<ArrowRight size={16} aria-hidden="true" /></Link>}
          </div>
        </div>
        <div className="mt-8 rounded-2xl border border-white/10 bg-white/[.04] px-4 pt-4 sm:px-8 sm:pt-6">
          <TodayLane slots={slots} agentOn={s.agent_enabled} now={pos(nowMin)} />
        </div>
      </section>

      {!setupDone ? <FirstSteps steps={steps} /> : (
        <>
          <dl className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {([
              ['Jobs discovered', stats.total, BriefcaseBusiness, 'info'], ['New today', stats.today, Sparkles, 'info'], ['Strong', stats.strong, Target, 'safe'],
              ['Good', stats.good, TrendingUp, 'info'], ['Potential', stats.potential, Gauge, 'plain'], ['Saved jobs', saved, BookmarkCheck, 'warn'],
            ] as const).map(([label, value, icon, tone]) => <Stat key={label} label={label} value={value} icon={icon} tone={tone} />)}
          </dl>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="min-w-0">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[1.15rem] font-semibold">Your best matches</h2>
                {top.length > 0 && <Link href="/jobs" className="inline-flex items-center gap-1 text-sm font-semibold text-road hover:underline">All jobs<ArrowRight size={14} aria-hidden="true" /></Link>}
              </div>
              {top.length ? <div className="space-y-3">{top.map((j) => <JobRow key={j.id} job={j} />)}</div>
                : <Empty title="No matches to show yet" icon={BriefcaseBusiness}>New matches appear here after the next search. A vacancy is shown only once it is confirmed open.</Empty>}
            </div>
            <div className="space-y-5">
              <Section title="Needs you" className="!mb-0">
                {needs ? (
                  <ul className="-mx-2 -mt-1 space-y-0.5">
                    {closing > 0 && <Need href="/tracker" tone="look">{plural(closing, 'saved job closes', 'saved jobs close')} within 7 days</Need>}
                    {strong > 0 && <Need href="/jobs?tier=Strong" tone="do">Review {plural(strong, 'strong match', 'strong matches')}</Need>}
                    {lastBad && <Need href="/history" tone="look">The last search had a problem</Need>}
                    {emailProblem && <Need href="/settings#email" tone="look">The last email could not be sent</Need>}
                    {unreadable > 0 && <Need href="/careers" tone="look">{plural(unreadable, 'career page', 'career pages')} can&apos;t be read</Need>}
                  </ul>
                ) : (
                  <p className="flex items-center gap-2 text-sm text-soft"><CircleCheck size={18} className="text-safe" aria-hidden="true" />All clear. Surelane keeps searching for you.</p>
                )}
              </Section>
              <div className="card card-pad">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sunken text-soft"><Clock3 size={18} aria-hidden="true" /></span>
                  <div>
                    <p className="text-[13px] text-soft">Last search</p>
                    <p className="font-semibold">{last ? formatColombo(last.started_at) : 'None yet'}</p>
                  </div>
                </div>
                <Link href="/sources" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-road hover:underline">See which sites are searched<ArrowRight size={14} aria-hidden="true" /></Link>
              </div>
            </div>
          </div>
        </>
      )}
    </Page>
  );
}
