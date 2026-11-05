import { CircleCheck, CircleDashed, ExternalLink, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { MARKET_LABEL, MODE_LABEL, checkedLabel, deadlineLabel, type JobRow as Job } from '@/lib/jobs';
import { formatColombo } from '@/lib/schedule';
import { SaveJob } from './controls';
import { MatchMeter, Tag } from './ui';

/** The safety promise, shown where the decision is made rather than one page deeper. */
export function Checked({ job }: { job: Pick<Job, 'verify_method' | 'verified_at'> }) {
  const c = checkedLabel(job);
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${c.checked ? 'text-safe-strong' : 'text-soft'}`}>
      {c.checked ? <CircleCheck size={16} aria-hidden="true" className="-mt-0.5" /> : <CircleDashed size={16} aria-hidden="true" className="-mt-0.5" />}{c.text}
    </span>
  );
}

export function Deadline({ date }: { date: Date | string }) {
  const d = deadlineLabel(date);
  if (d.soon) return <Tag tone="warn"><TriangleAlert size={13} aria-hidden="true" className="-mt-px" />{d.text}</Tag>;
  return <span className="text-sm text-soft">{d.text}</span>;
}

// The title sits under whatever heading the list has, so the level comes from the page.
export function JobRow({ job, heading: Heading = 'h3' }: { job: Job; heading?: 'h2' | 'h3' }) {
  const facts = [MARKET_LABEL[job.market], job.work_mode !== 'unknown' ? MODE_LABEL[job.work_mode] : null, job.employment_type, job.salary, job.posted_at ? `Posted ${formatColombo(job.posted_at, 'date')}` : null].filter(Boolean);
  return (
    <article className="job">
      <MatchMeter score={job.score} tier={job.tier} />
      <div className="min-w-0">
        <Heading className="text-[1.15rem] sm:text-[1.25rem]"><Link href={`/jobs/${job.id}`} className="hover:text-road hover:underline">{job.title}</Link></Heading>
        <p className="text-soft">{job.company}{job.location ? `, ${job.location}` : ''}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
          <Checked job={job} />
          {job.deadline && <Deadline date={job.deadline} />}
          {job.mandatory_missing.length > 0 && <Tag tone="stop"><TriangleAlert size={13} aria-hidden="true" className="-mt-px" />Missing a requirement</Tag>}
        </div>
        <p className="mt-1.5 text-sm text-soft">{facts.map((f, i) => <span key={i}>{i > 0 && <span aria-hidden="true" className="mx-1.5 text-edge">/</span>}{f}</span>)}</p>
        {job.explanation && <p className="measure mt-2.5 line-clamp-3 text-[15px]">{job.explanation}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link href={`/jobs/${job.id}`} className="btn btn-primary btn-sm">View details<span className="sr-only">: {job.title}</span></Link>
          <a href={job.url} target="_blank" rel="noopener noreferrer" className="btn btn-quiet btn-sm">Apply on site<ExternalLink size={14} aria-hidden="true" /><span className="sr-only">(opens in a new tab)</span></a>
          <SaveJob jobId={job.id} saved={Boolean(job.application_id)} className="btn-sm" />
          <span className="text-[13px] text-soft sm:ml-auto">Listed on {job.source_label}</span>
        </div>
      </div>
    </article>
  );
}
