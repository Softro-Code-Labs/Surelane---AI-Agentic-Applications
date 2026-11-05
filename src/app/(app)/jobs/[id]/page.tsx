import { ArrowLeft, ExternalLink, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { AiPanel } from '@/components/AiPanel';
import { SaveJob } from '@/components/controls';
import { Checked, Deadline } from '@/components/JobRow';
import { Empty, MatchMeter, Notice, Page, Section, SkillList, Tag } from '@/components/ui';
import { one } from '@/lib/db';
import { MARKET_LABEL, MODE_LABEL, VERIFY_LABEL, type JobRow } from '@/lib/jobs';
import { formatColombo } from '@/lib/schedule';

function Back() {
  return <Link href="/jobs" className="mb-4 inline-flex items-center gap-1.5 text-[15px] font-semibold text-road hover:underline"><ArrowLeft size={16} aria-hidden="true" className="-mt-0.5" />All jobs</Link>;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const j = /^\d+$/.test(id) ? await one<{ title: string }>('SELECT title FROM jobs WHERE id=$1', [id]) : null;
  return { title: j?.title ?? 'Job' };
}

export default async function JobDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return <Page><Back /><Empty title="This job could not be found" /></Page>;
  const j = await one<JobRow>(`SELECT j.*, a.id application_id FROM jobs j LEFT JOIN applications a ON a.job_id=j.id WHERE j.id=$1`, [id]);
  if (!j) return <Page><Back /><Empty title="This job is no longer stored">Job history is kept for 30 days. Anything you saved is still in your <Link href="/tracker" className="link">applications</Link>.</Empty></Page>;
  const closed = j.status !== 'active' || (j.deadline && new Date(j.deadline) < new Date());
  const eligibility = { yes: 'Open to applicants in Sri Lanka', no: 'Not open to applicants in Sri Lanka', unknown: 'Eligibility for Sri Lanka not stated' }[j.sl_eligibility];
  const facts: [string, string | null][] = [
    ['Location', j.location], ['Country', j.country], ['Salary', j.salary ?? 'Not stated'], ['Employment type', j.employment_type ?? 'Not stated'], ['Work arrangement', MODE_LABEL[j.work_mode]],
    ['Posted', j.posted_at ? formatColombo(j.posted_at, 'date') : 'Not stated'], ['Deadline', j.deadline ? formatColombo(j.deadline, 'date') : 'Not stated'],
  ];
  const actions = (
    <>
      {!closed && <a href={j.url} target="_blank" rel="noopener noreferrer" className="btn btn-primary flex-1 sm:flex-none">Apply on site<ExternalLink size={15} aria-hidden="true" /><span className="sr-only">(opens in a new tab)</span></a>}
      <SaveJob jobId={j.id} saved={Boolean(j.application_id)} />
    </>
  );
  return (
    <Page>
      <Back />
      {closed && <div className="mb-5"><Notice tone="stop" role="alert">This vacancy is no longer open. {j.status_reason}</Notice></div>}
      <header className="mb-7 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-5 sm:gap-x-8">
        <div className="min-w-0 max-w-2xl">
          <h1 className="text-[1.75rem] sm:text-[2.1rem]">{j.title}</h1>
          <p className="mt-1 text-lg text-soft">{j.company}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {!closed && <Checked job={j} />}
            {j.deadline && !closed && <Deadline date={j.deadline} />}
            <Tag tone={j.market === 'international' ? 'info' : 'plain'}>{MARKET_LABEL[j.market]}</Tag>
          </div>
          <div className="mt-4 hidden flex-wrap gap-2 sm:flex">{actions}</div>
        </div>
        <div className="justify-self-end"><MatchMeter score={j.score} tier={j.tier} size="lg" /></div>
      </header>
      <div className="grid gap-x-12 gap-y-2 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <Section title="How you match">
            <p className="measure mb-2">{j.explanation}</p>
            <p className="measure mb-4 font-semibold">{j.suitability}</p>
            <SkillList label="Skills you have" items={j.matching_skills} tone="safe" />
            <SkillList label="Skills to add" items={j.missing_skills} tone="warn" />
            <SkillList label="Required, and not on your CV" items={j.mandatory_missing} tone="stop" />
            <p className="text-sm text-soft">{j.scored_by === 'rules' ? 'Scored by the built-in engine.' : `Scored with ${j.scored_by.split(':').slice(1).join(':')}.`}</p>
          </Section>
          <Section title="Plain-language summary"><AiPanel kind="job_summary" jobId={j.id} cta="Summarise this job" /></Section>
          <Section title="Cover letter"><AiPanel kind="cover_letter" jobId={j.id} cta="Write a cover letter" applicationId={j.application_id} /></Section>
          {j.requirements.length > 0 && <Section title="Requirements"><ul className="measure list-disc space-y-1 pl-5">{j.requirements.map((r, i) => <li key={i}>{r}</li>)}</ul></Section>}
          <Section title="Full description"><div className="measure whitespace-pre-line break-words">{j.description}</div></Section>
          {j.company_info && <Section title={`About ${j.company}`}><p className="measure whitespace-pre-line">{j.company_info}</p></Section>}
        </div>
        <aside className="max-lg:order-first lg:sticky lg:top-[84px] lg:self-start">
          <div className="mb-6 rounded-lg bg-surface p-4">
            <h2 className="flex items-center gap-2 text-[1.1rem]"><ShieldCheck size={20} className="-mt-0.5 text-safe-strong" aria-hidden="true" />What Surelane checked</h2>
            <dl className="mt-3 space-y-2.5">
              <div><dt className="text-sm text-soft">Still open?</dt><dd className="font-semibold">{j.verify_method ? VERIFY_LABEL[j.verify_method] : 'Not checked'}</dd>{j.verified_at && <dd className="text-sm text-soft">{formatColombo(j.verified_at)}</dd>}</div>
              <div><dt className="text-sm text-soft">Listed on</dt><dd className="font-semibold">{j.source_label}</dd>
                {j.sources.filter((x) => x.url !== j.url).map((x) => <dd key={x.url}><a className="link text-sm" rel="noopener noreferrer" target="_blank" href={x.url}>Also on {x.source}<span className="sr-only"> (opens in a new tab)</span></a></dd>)}
              </div>
              <div><dt className="text-sm text-soft">Can you apply from Sri Lanka?</dt><dd className="font-semibold">{eligibility}</dd></div>
            </dl>
            <p className="mt-3 border-t border-line pt-3 text-sm text-soft">Surelane checks that a listing is live, not that an employer is honest. Never pay a fee to apply, and keep your NIC and bank details private until you have met the employer.</p>
          </div>
          <dl className="mb-6 space-y-2.5 max-lg:grid max-lg:grid-cols-2 max-lg:gap-3 max-lg:space-y-0">
            {facts.filter(([, v]) => v).map(([k, v]) => <div key={k}><dt className="text-sm text-soft">{k}</dt><dd className="font-semibold">{v}</dd></div>)}
          </dl>
        </aside>
      </div>
      <div className="savebar -mx-4 flex gap-2 border-t border-line bg-surface px-4 py-2.5 sm:hidden">{actions}</div>
    </Page>
  );
}
