import { ChevronRight, CircleAlert, CircleArrowRight, CircleCheck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { JobRow } from '@/components/JobRow';
import { TodayLane } from '@/components/TodayLane';
import { Empty, Page, Section } from '@/components/ui';
import { one, q } from '@/lib/db';
import { recommended } from '@/lib/jobs';
import { RECOMMENDABLE, getCv, getSettings, scopeSql } from '@/lib/settings';
import { SLOTS, atColombo, colomboDate, formatColombo, nextSlot } from '@/lib/schedule';
import { plural } from '@/lib/plural';

export const metadata: Metadata = { title: 'Today' };

const DAY_START = 7 * 60, DAY_END = 18 * 60;
const pos = (min: number) => Math.min(100, Math.max(0, ((min - DAY_START) / (DAY_END - DAY_START)) * 100));

type Step = { title: string; href?: string; done: boolean; note: string };

function FirstSteps({ steps }: { steps: Step[] }) {
  return (
    <Section title="Set up your lane" hint="Three steps, then Surelane searches for you every day.">
      <ol className="grid gap-px overflow-hidden rounded-lg bg-line sm:grid-cols-3">
        {steps.map((s, i) => {
          const body = (
            <>
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full pt-0.5 font-bold ${s.done ? 'bg-safe-soft text-safe-strong' : 'bg-primary text-on-primary'}`}>{s.done ? <CircleCheck size={18} aria-label="Done" /> : i + 1}</span>
              <span><span className="block font-bold">{s.title}</span><span className="text-[15px] text-soft">{s.note}</span></span>
            </>
          );
          return <li key={s.title} className="bg-surface">{s.href ? <Link href={s.href} className="flex h-full gap-3 p-4 hover:bg-sunken">{body}</Link> : <div className="flex h-full gap-3 p-4">{body}</div>}</li>;
        })}
      </ol>
    </Section>
  );
}

function Need({ href, tone, children }: { href: string; tone: 'do' | 'look' | 'stop'; children: ReactNode }) {
  const color = tone === 'do' ? 'text-road' : tone === 'look' ? 'text-warn' : 'text-stop';
  const Icon = tone === 'do' ? CircleArrowRight : CircleAlert;
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 py-3 font-semibold hover:text-road">
        <Icon size={20} className={`-mt-0.5 shrink-0 ${color}`} aria-hidden="true" />
        <span className="flex-1">{children}</span>
        <ChevronRight size={18} className="shrink-0 text-soft" aria-hidden="true" />
      </Link>
    </li>
  );
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
  const top = await recommended(s, {}, 3);
  const next = nextSlot(now, s);

  const nowMin = Math.round((now.getTime() - midnight.getTime()) / 60_000);
  const slots = SLOTS.map((slot) => {
    const [h, m] = slot.time.split(':').map(Number) as [number, number];
    const at = h * 60 + m;
    return { key: slot.key, field: slot.field, label: slot.label, enabled: Boolean(s[slot.field as keyof typeof s]), position: pos(at), passed: nowMin > at, result: runs.find((r) => r.slot_key === slot.key)?.status ?? null };
  });
  const title = !s.agent_enabled ? 'The agent is off' : !cv ? 'Upload your CV to start' : next ? `Next search at ${next.label}${colomboDate(next.at) === today ? '' : ' tomorrow'}` : 'All three searches are off';
  const area = s.global_enabled ? 'Sri Lanka and international' : 'Sri Lanka only';
  const subtitle = !s.agent_enabled ? 'No searches run and no job emails are sent until you turn it back on. Your schedule stays saved.' : !cv ? 'Surelane searches three times a day once it knows what fits you.' : !next ? 'Turn on a time below to resume automatic searches.' : `Sri Lanka time. Searching ${area}.`;
  const strong = Number(stats.strong);
  const figures: [string, string | number][] = [['Jobs discovered', stats.total!], ['New today', stats.today!], ['Strong', stats.strong!], ['Good', stats.good!], ['Potential', stats.potential!], ['Saved jobs', saved]];
  const setupDone = Boolean(cv) && Boolean(last);
  const steps: Step[] = [
    { title: 'Upload your CV', href: '/cv', done: Boolean(cv), note: 'Surelane reads it to learn what fits you.' },
    { title: 'Choose what to look for', href: '/settings#looking', done: s.preferred_locations.length + s.categories.length + s.extra_keywords.length > 0, note: 'Add locations, categories or keywords.' },
    { title: 'Run your first search', done: Boolean(last), note: cv ? 'Press Search at the top of the page, or wait for the next search time.' : 'You can do this once your CV is in.' },
  ];
  const lastBad = last && (last.status === 'failed' || last.status === 'partial');

  return (
    <>
      <section className="band overflow-x-clip pb-5 sm:pb-3">
        <div className="mx-auto max-w-[1120px] px-4 sm:px-6">
          <div className="pb-4 pt-6 sm:pb-6 sm:pt-8">
            <h1 className="text-[2rem] sm:text-[2.5rem]">{title}</h1>
            <p className="mt-1 text-on-band-soft">{subtitle}</p>
            {!cv && <Link href="/cv" className="btn btn-band mt-4">Upload your CV</Link>}
          </div>
          <TodayLane slots={slots} agentOn={s.agent_enabled} now={pos(nowMin)} />
        </div>
      </section>

      <Page>
        {!setupDone ? <FirstSteps steps={steps} /> : (
          <div className="grid gap-x-12 lg:grid-cols-[minmax(0,1fr)_300px] lg:grid-rows-[auto_1fr]">
            <div className="lg:col-start-2 lg:row-start-1">
              <Section title="Needs you">
                {(strong > 0 || closing > 0 || unreadable > 0 || lastBad) ? (
                  <ul className="-mt-2 divide-y divide-line">
                    {closing > 0 && <Need href="/tracker" tone="look">{plural(closing, 'saved job closes', 'saved jobs close')} within 7 days</Need>}
                    {strong > 0 && <Need href="/jobs?tier=Strong" tone="do">Review {plural(strong, 'strong match', 'strong matches')}</Need>}
                    {lastBad && <Need href="/history" tone="look">The last search had a problem</Need>}
                    {unreadable > 0 && <Need href="/careers" tone="look">{plural(unreadable, 'career page', 'career pages')} can&apos;t be read</Need>}
                  </ul>
                ) : <p className="text-soft">Nothing right now. Surelane keeps searching for you.</p>}
              </Section>
            </div>
            <div className="min-w-0 lg:col-start-1 lg:row-span-2 lg:row-start-1">
              <Section title="Your best matches" aside={top.length > 0 ? <Link href="/jobs" className="link text-[15px]">All jobs</Link> : undefined}>
                {top.length ? <div className="-mt-3">{top.map((j) => <JobRow key={j.id} job={j} />)}</div>
                  : <Empty title="No matches to show yet">New matches appear here after the next search. A vacancy is shown only once it is confirmed open.</Empty>}
              </Section>
            </div>
            <div className="lg:col-start-2 lg:row-start-2">
              <Section title="Your numbers">
                <dl className="grid grid-cols-3 gap-x-3 gap-y-4 lg:grid-cols-2">
                  {figures.map(([label, value]) => <div key={label} className="flex flex-col-reverse"><dt className="text-sm text-soft">{label}</dt><dd className="text-[1.75rem] font-bold leading-none tabular">{value}</dd></div>)}
                </dl>
                <p className="mt-4 text-sm text-soft">Last search: {last ? formatColombo(last.started_at) : 'none yet'}. <Link href="/sources" className="link">See which sites are searched</Link></p>
              </Section>
            </div>
          </div>
        )}
      </Page>
    </>
  );
}
