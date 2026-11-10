import { Building, CircleCheck, CircleDashed, ExternalLink, MapPin, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { MARKET_LABEL, MODE_LABEL, checkedLabel, deadlineLabel, type JobRow as Job } from '@/lib/jobs';
import { formatColombo } from '@/lib/schedule';
import { SaveJob } from './controls';
import { MatchMeter, Tag } from './ui';

/** The safety promise, shown where the decision is made rather than one page deeper. */
export function Checked({ job }: { job: Pick<Job, 'verify_method' | 'verified_at'> }) {
  const c = checkedLabel(job);
  return (
    <span className={`inline-flex items-center gap-1.5 text-[13px] font-semibold ${c.checked ? 'text-safe-strong' : 'text-soft'}`}>
      {c.checked ? <CircleCheck size={15} aria-hidden="true" /> : <CircleDashed size={15} aria-hidden="true" />}{c.text}
    </span>
  );
}

export function Deadline({ date }: { date: Date | string }) {
  const d = deadlineLabel(date);
  if (d.soon) return <Tag tone="warn"><TriangleAlert size={12} aria-hidden="true" />{d.text}</Tag>;
  return <span className="text-[13px] text-soft">{d.text}</span>;
}

// The title sits under whatever heading the list has, so the level comes from the page.
export function JobRow({ job, heading: Heading = 'h3' }: { job: Job; heading?: 'h2' | 'h3' }) {
  const facts = [job.category === 'Government' ? 'Government' : null, MARKET_LABEL[job.market], job.work_mode !== 'unknown' ? MODE_LABEL[job.work_mode] : null, job.employment_type, job.salary, job.posted_at ? `Posted ${formatColombo(job.posted_at, 'date')}` : null].filter(Boolean) as string[];
  return (
    <article className="card card-hover job">
      <MatchMeter score={job.score} tier={job.tier} />
      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <Heading className="min-w-0 text-[1.05rem] font-semibold leading-snug sm:text-[1.12rem]">
            <Link href={`/jobs/${job.id}`} className="hover:text-primary">{job.title}</Link>
          </Heading>
          <div className="flex flex-wrap items-center gap-1.5">
            {job.deadline && <Deadline date={job.deadline} />}
            {job.mandatory_missing.length > 0 && <Tag tone="stop"><TriangleAlert size={12} aria-hidden="true" />Missing a requirement</Tag>}
          </div>
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-soft">
          <span className="inline-flex items-center gap-1"><Building size={14} aria-hidden="true" />{job.company}</span>
          {job.location && <span className="inline-flex items-center gap-1"><MapPin size={14} aria-hidden="true" />{job.location}</span>}
        </p>
        {facts.length > 0 && <div className="mt-2.5 flex flex-wrap gap-1.5">{facts.map((f) => <Tag key={f}>{f}</Tag>)}</div>}
        {job.explanation && <p className="measure mt-3 line-clamp-2 text-sm leading-relaxed text-soft">{job.explanation}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Link href={`/jobs/${job.id}`} className="btn btn-primary btn-sm">View details<span className="sr-only">: {job.title}</span></Link>
          <a href={job.url} target="_blank" rel="noopener noreferrer" className="btn btn-quiet btn-sm">Apply on site<ExternalLink size={13} aria-hidden="true" /><span className="sr-only">(opens in a new tab)</span></a>
          <SaveJob jobId={job.id} saved={Boolean(job.application_id)} className="btn-sm" />
          <span className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-soft sm:ml-auto sm:w-auto">
            <Checked job={job} /><span>via {job.source_label}</span>
          </span>
        </div>
      </div>
    </article>
  );
}
