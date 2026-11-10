import { BriefcaseBusiness, ExternalLink, Sparkles } from 'lucide-react';
import type { Metadata } from 'next';
import { CvDrop, CvRemove, CvReplace } from '@/components/Forms';
import { Page, PageHead, Section, Tag } from '@/components/ui';
import { formatColombo } from '@/lib/schedule';
import { getCv } from '@/lib/settings';
import { FAMILY_LABEL } from '@/lib/match/taxonomy';

export const metadata: Metadata = { title: 'My CV' };

function Block({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <Section title={title}>
      <ul className="space-y-2">{items.map((x) => <li key={x} className="flex gap-2.5 text-[15px]"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />{x}</li>)}</ul>
    </Section>
  );
}

function Tags({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return <Section title={title}><div className="flex flex-wrap gap-1.5">{items.map((x) => <Tag key={x}>{x}</Tag>)}</div></Section>;
}

const initials = (name: string | null) => (name ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';

export default async function CvPage() {
  const cv = await getCv();
  if (!cv) return (
    <Page width="narrow">
      <PageHead title="My CV" eyebrow="Your profile" intro="Upload one CV. Surelane reads it and uses it for every search." />
      <CvDrop />
    </Page>
  );
  const p = cv.profile;
  const fileUrl = `/api/cv/file?v=${cv.profile_version}`;
  return (
    <Page>
      <PageHead title="My CV" eyebrow="Your profile" intro={`${cv.file_name}, uploaded ${formatColombo(cv.uploaded_at)}. It is encrypted in your database.`} action={<CvReplace />} />
      <div className="grid gap-x-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <section className="card mb-5 overflow-hidden">
            <div className="band band-grid h-20" aria-hidden="true" />
            <div className="-mt-10 px-5 pb-6 sm:px-6">
              <span className="brand-gradient flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-surface font-display text-2xl font-bold text-white shadow-[var(--shadow-md)]">{initials(p.name)}</span>
              <p className="mt-3 font-display text-[1.5rem] font-bold leading-tight">{p.name ?? 'Name not found'}</p>
              <p className="text-soft">{p.headline || 'No job title found'}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Tag tone="info"><BriefcaseBusiness size={12} aria-hidden="true" />{p.yearsExperience} years</Tag>
                <Tag tone="info">{p.experienceLevel}</Tag>
                {p.families.map((f) => <Tag key={f}>{FAMILY_LABEL[f]}</Tag>)}
              </div>
              {p.summary && <p className="mt-4 text-[15px] leading-relaxed">{p.summary}</p>}
              <p className="mt-4 inline-flex items-center gap-1.5 text-[12px] text-soft"><Sparkles size={13} aria-hidden="true" />{cv.profile_engine === 'rules' ? 'Read by the built-in engine.' : `Improved by ${cv.profile_engine.split(':').slice(1).join(':')}.`}</p>
            </div>
          </section>
          <Section title="Skills">
            {p.skills.length ? <div className="flex flex-wrap gap-1.5">{p.skills.map((s) => <Tag key={s} tone="info">{s}</Tag>)}</div> : <p className="text-sm text-soft">No recognised skills found. Add a clear skills section to your CV.</p>}
          </Section>
          {p.workHistory.length > 0 && (
            <Section title="Work history">
              <ol className="relative space-y-5 border-l-2 border-line pl-5">
                {p.workHistory.map((w, i) => (
                  <li key={i} className="relative">
                    <span className="absolute -left-[27px] top-1.5 h-3 w-3 rounded-full border-2 border-surface bg-primary" aria-hidden="true" />
                    <p className="font-semibold">{w.title}</p>
                    {w.company && <p className="text-sm">{w.company}</p>}
                    <p className="text-[13px] text-soft">{w.period}</p>
                  </li>
                ))}
              </ol>
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
        <div className="min-w-0 lg:sticky lg:top-[88px] lg:self-start">
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <h2 className="text-[1.05rem] font-semibold">Preview</h2>
              <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">Open CV<ExternalLink size={14} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a>
            </div>
            <iframe key={cv.profile_version} title="CV preview" src={fileUrl} className="hidden h-[60vh] w-full bg-white sm:block lg:h-[calc(100dvh-190px)]" />
            <p className="p-5 text-sm text-soft sm:hidden">Phones can&apos;t always show a CV inside a page. Use Open CV to read it.</p>
          </div>
        </div>
      </div>
    </Page>
  );
}
