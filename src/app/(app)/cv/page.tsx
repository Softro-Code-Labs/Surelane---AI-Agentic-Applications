import { ExternalLink } from 'lucide-react';
import type { Metadata } from 'next';
import { CvDrop, CvRemove, CvReplace } from '@/components/Forms';
import { Page, PageHead, Section, Tag } from '@/components/ui';
import { formatColombo } from '@/lib/schedule';
import { getCv } from '@/lib/settings';
import { FAMILY_LABEL } from '@/lib/match/taxonomy';

export const metadata: Metadata = { title: 'My CV' };

function Block({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return <Section title={title}><ul className="list-disc space-y-1 pl-5">{items.map((x) => <li key={x}>{x}</li>)}</ul></Section>;
}

function Tags({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return <Section title={title}><div className="flex flex-wrap gap-1.5">{items.map((x) => <Tag key={x}>{x}</Tag>)}</div></Section>;
}

export default async function CvPage() {
  const cv = await getCv();
  if (!cv) return (
    <Page width="narrow">
      <PageHead title="My CV" intro="Upload one CV. Surelane reads it and uses it for every search." />
      <CvDrop />
    </Page>
  );
  const p = cv.profile;
  const fileUrl = `/api/cv/file?v=${cv.profile_version}`;
  return (
    <Page>
      <PageHead title="My CV" intro={`${cv.file_name}, uploaded ${formatColombo(cv.uploaded_at)}. It is encrypted in your database.`} action={<CvReplace />} />
      <div className="grid gap-x-12 gap-y-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <Section title="Your candidate profile">
            <p className="text-[1.5rem] font-bold leading-tight">{p.name ?? 'Name not found'}</p>
            <p className="text-soft">{p.headline || 'No job title found'}</p>
            <p className="mt-2">{p.yearsExperience} years of experience, {p.experienceLevel.toLowerCase()}.</p>
            {p.summary && <p className="mt-2">{p.summary}</p>}
            <p className="mt-2 text-sm text-soft">{p.families.length ? `Best fit: ${p.families.map((f) => FAMILY_LABEL[f]).join(', ')}. ` : ''}{cv.profile_engine === 'rules' ? 'Read by the built-in engine.' : `Improved by ${cv.profile_engine.split(':').slice(1).join(':')}.`}</p>
          </Section>
          <Section title="Skills">
            {p.skills.length ? <div className="flex flex-wrap gap-1.5">{p.skills.map((s) => <Tag key={s} tone="info">{s}</Tag>)}</div> : <p className="text-soft">No recognised skills found. Add a clear skills section to your CV.</p>}
          </Section>
          {p.workHistory.length > 0 && (
            <Section title="Work history">
              <ul className="space-y-2.5">{p.workHistory.map((w, i) => <li key={i}><span className="font-semibold">{w.title}</span>{w.company ? `, ${w.company}` : ''}<div className="text-sm text-soft">{w.period}</div></li>)}</ul>
            </Section>
          )}
          <Block title="Education" items={p.education} />
          <Block title="Certifications and training" items={[...p.certifications, ...p.qualifications.filter((q) => !p.certifications.some((c) => c.includes(q.split(' ')[0]!)))]} />
          <Block title="Achievements" items={p.achievements} />
          <Block title="Projects" items={p.projects} />
          <Tags title="Languages" items={p.languages} />
          <Tags title="Search keywords" items={p.keywords} />
          <div className="mb-6"><CvRemove /></div>
        </div>
        <div className="min-w-0 lg:sticky lg:top-[84px] lg:self-start">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-[1.3rem]">Preview</h2>
            <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1 text-[15px]">Open CV<ExternalLink size={14} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a>
          </div>
          <iframe key={cv.profile_version} title="CV preview" src={fileUrl} className="hidden h-[60vh] w-full rounded-lg border border-line bg-white sm:block lg:h-[calc(100dvh-170px)]" />
          <p className="text-[15px] text-soft sm:hidden">Phones can&apos;t always show a CV inside a page. Use Open CV to read it.</p>
        </div>
      </div>
    </Page>
  );
}
