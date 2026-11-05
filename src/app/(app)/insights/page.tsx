import type { Metadata } from 'next';
import Link from 'next/link';
import { AiPanel } from '@/components/AiPanel';
import { Empty, Page, PageHead, Section, Tag } from '@/components/ui';
import { careerPaths, skillGaps } from '@/lib/ai/drafts';
import { q } from '@/lib/db';
import { getCv } from '@/lib/settings';

export const metadata: Metadata = { title: 'Career insights' };

export default async function Insights() {
  const cv = await getCv();
  if (!cv) return <Page><PageHead title="Career insights" /><Empty title="Upload your CV to see insights" action={<Link href="/cv" className="btn btn-primary">Upload your CV</Link>} /></Page>;
  const jobs = await q<{ missing_skills: string[] }>(`SELECT missing_skills FROM jobs WHERE status='active' AND tier IS NOT NULL ORDER BY score DESC LIMIT 40`);
  const gaps = skillGaps(jobs);
  const most = Math.max(1, ...gaps.map((g) => g.jobs));
  return (
    <Page>
      <PageHead title="Career insights" intro="Advice based on your CV and the vacancies Surelane has found for you." />
      <Section title="Skills your matching jobs ask for">
        {gaps.length ? (
          <ul className="divide-y divide-line">
            {gaps.map((g) => (
              <li key={g.skill} className="grid gap-x-5 gap-y-1 py-3 md:grid-cols-[170px_minmax(0,1fr)_auto] sm:items-center">
                <span className="font-bold">{g.skill}</span>
                <span className="flex items-center gap-3">
                  <span className="h-2 flex-none rounded-r-sm bg-road" style={{ width: `${Math.round((g.jobs / most) * 160)}px` }} aria-hidden="true" />
                  <span className="text-sm whitespace-nowrap text-soft">Asked for in {g.jobs} {g.jobs === 1 ? 'job' : 'jobs'}</span>
                </span>
                <span className="flex flex-wrap gap-3 text-sm">{g.resources.map((r) => <a key={r.url} href={r.url} target="_blank" rel="noopener noreferrer" className="link">{r.label}<span className="sr-only"> (opens in a new tab)</span></a>)}</span>
              </li>
            ))}
          </ul>
        ) : <Empty title="No gaps to report yet">This fills in once Surelane has found matching jobs.</Empty>}
      </Section>
      <Section title="Career paths that fit you">
        <div className="grid gap-6 sm:grid-cols-2">
          {careerPaths(cv.profile).map((c) => (
            <div key={c.family}>
              <h3 className="text-[1.1rem]">{c.family}</h3>
              <p className="mb-2 text-[15px] text-soft">{c.fit}</p>
              <div className="flex flex-wrap gap-1.5">{c.roles.map((r) => <Tag key={r}>{r}</Tag>)}</div>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Improve your CV"><AiPanel kind="cv_improve" cta="Suggest CV improvements" /></Section>
    </Page>
  );
}
