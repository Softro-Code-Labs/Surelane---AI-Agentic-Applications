import { ArrowLeft, Building, CalendarClock, Clock3, ExternalLink, FileText, Globe, MapPin, PenLine, ShieldCheck, Sparkles, Target, Wallet, BriefcaseBusiness, ListChecks } from 'lucide-react';
import Link from 'next/link';
import { AiPanel } from '@/components/AiPanel';
import { hasCoverLetter } from '@/lib/cover-letter';
import { SaveJob } from '@/components/controls';
import { Checked, Deadline } from '@/components/JobRow';
import { Empty, MatchMeter, Notice, Page, Section, SkillList, Tag } from '@/components/ui';
import { one } from '@/lib/db';
import { MARKET_LABEL, MODE_LABEL, VERIFY_LABEL, type JobRow } from '@/lib/jobs';
import { formatColombo } from '@/lib/schedule';

function Back() {
  return <Link href="/jobs" className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-soft hover:text-ink"><ArrowLeft size={16} aria-hidden="true" />All jobs</Link>;
}

function Title({ icon: Icon, children }: { icon: typeof Target; children: string }) {
  return <span className="inline-flex items-center gap-2"><Icon size={17} className="text-primary" aria-hidden="true" />{children}</span>;
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
  const facts: [string, string | null, typeof MapPin][] = [
    ['Location', j.location, MapPin], ['Country', j.country, Globe], ['Salary', j.salary ?? 'Not stated', Wallet], ['Employment type', j.employment_type ?? 'Not stated', BriefcaseBusiness],
    ['Work arrangement', MODE_LABEL[j.work_mode], Building], ['Posted', j.posted_at ? formatColombo(j.posted_at, 'date') : 'Not stated', Clock3], ['Deadline', j.deadline ? formatColombo(j.deadline, 'date') : 'Not stated', CalendarClock],
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
      <header className="card relative mb-6 overflow-hidden">
        <div className="brand-gradient h-1.5 w-full" aria-hidden="true" />
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-5 p-5 sm:gap-x-8 sm:p-7">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Tag tone={j.market === 'sri_lanka' ? 'plain' : 'info'}>{MARKET_LABEL[j.market]}</Tag>
              {j.category === 'Government' && <Tag tone="info">Government</Tag>}
              {j.deadline && !closed && <Deadline date={j.deadline} />}
            </div>
            <h1 className="text-[1.55rem] leading-tight sm:text-[2rem]">{j.title}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px] text-soft">
              <span className="inline-flex items-center gap-1.5"><Building size={16} aria-hidden="true" />{j.company}</span>
              {j.location && <span className="inline-flex items-center gap-1.5"><MapPin size={16} aria-hidden="true" />{j.location}</span>}
            </p>
            {!closed && <div className="mt-3"><Checked job={j} /></div>}
            <div className="mt-5 hidden flex-wrap gap-2 sm:flex">{actions}</div>
          </div>
          <div className="justify-self-end"><MatchMeter score={j.score} tier={j.tier} size="lg" /></div>
        </div>
      </header>
      <div className="grid gap-x-6 gap-y-0 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <Section title="How you match" aside={<span className="text-[12px] text-soft">{j.scored_by === 'rules' ? 'Built-in engine' : j.scored_by.split(':').slice(1).join(':')}</span>}>
            {j.explanation && <p className="measure mb-3 leading-relaxed">{j.explanation}</p>}
            {j.suitability && <p className="measure mb-5 rounded-xl bg-info-soft px-4 py-3 text-sm font-semibold text-info-strong">{j.suitability}</p>}
            <SkillList label="Skills you have" items={j.matching_skills} tone="safe" />
            <SkillList label="Skills to add" items={j.missing_skills} tone="warn" />
            <SkillList label="Required, and not on your CV" items={j.mandatory_missing} tone="stop" />
          </Section>
          <Section title="Plain-language summary" aside={<Sparkles size={16} className="text-primary" aria-hidden="true" />}><AiPanel kind="job_summary" jobId={j.id} cta="Summarise this job" /></Section>
          <Section title="Cover letter" aside={<PenLine size={16} className="text-primary" aria-hidden="true" />}><AiPanel kind="cover_letter" jobId={j.id} cta="Write a cover letter" applicationId={j.application_id} hasLetter={await hasCoverLetter()} /></Section>
          {j.requirements.length > 0 && (
            <Section title="Requirements" aside={<ListChecks size={16} className="text-primary" aria-hidden="true" />}>
              <ul className="measure space-y-2">{j.requirements.map((r, i) => <li key={i} className="flex gap-2.5 text-[15px]"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />{r}</li>)}</ul>
            </Section>
          )}
          <Section title="Full description" aside={<FileText size={16} className="text-primary" aria-hidden="true" />}><div className="measure whitespace-pre-line break-words text-[15px] leading-relaxed">{j.description}</div></Section>
          {j.company_info && <Section title={`About ${j.company}`}><p className="measure whitespace-pre-line text-[15px] leading-relaxed">{j.company_info}</p></Section>}
        </div>
        <aside className="max-lg:order-first lg:sticky lg:top-[88px] lg:self-start">
          <div className="card card-pad mb-5">
            <h2 className="flex items-center gap-2 text-[1.05rem] font-semibold"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-safe-soft text-safe-strong"><ShieldCheck size={17} aria-hidden="true" /></span>What Surelane checked</h2>
            <dl className="mt-4 space-y-3.5">
              <div><dt className="text-[12px] text-soft">Still open?</dt><dd className="text-sm font-semibold">{j.verify_method ? VERIFY_LABEL[j.verify_method] : 'Not checked'}</dd>{j.verified_at && <dd className="text-[12px] text-soft">{formatColombo(j.verified_at)}</dd>}</div>
              <div><dt className="text-[12px] text-soft">Listed on</dt><dd className="text-sm font-semibold">{j.source_label}</dd>
                {j.sources.filter((x) => x.url !== j.url).map((x) => <dd key={x.url}><a className="link text-[13px]" rel="noopener noreferrer" target="_blank" href={x.url}>Also on {x.source}<span className="sr-only"> (opens in a new tab)</span></a></dd>)}
              </div>
              <div><dt className="text-[12px] text-soft">Can you apply from Sri Lanka?</dt><dd className="text-sm font-semibold">{eligibility}</dd></div>
            </dl>
            <p className="mt-4 rounded-xl bg-sunken p-3 text-[12px] leading-relaxed text-soft">Surelane checks that a listing is live, not that an employer is honest. Never pay a fee to apply, and keep your NIC and bank details private until you have met the employer.</p>
          </div>
          <div className="card card-pad mb-5">
            <h2 className="mb-4 text-[1.05rem] font-semibold">Job facts</h2>
            <dl className="grid grid-cols-2 gap-3.5 lg:grid-cols-1">
              {facts.filter(([, v]) => v).map(([k, v, Icon]) => (
                <div key={k} className="flex items-start gap-2.5">
                  <Icon size={16} className="mt-0.5 shrink-0 text-soft" aria-hidden="true" />
                  <div className="min-w-0"><dt className="text-[12px] text-soft">{k}</dt><dd className="text-sm font-semibold">{v}</dd></div>
                </div>
              ))}
            </dl>
          </div>
        </aside>
      </div>
      <div className="savebar glass -mx-4 flex gap-2 border-t border-line px-4 py-3 sm:hidden">{actions}</div>
    </Page>
  );
}
