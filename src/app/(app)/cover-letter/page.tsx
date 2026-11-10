import { ExternalLink } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { CoverLetterAdd, CoverLetterEditor, CoverLetterRemove, CoverLetterReplace } from '@/components/CoverLetterForms';
import { Page, PageHead, Section } from '@/components/ui';
import { getCoverLetter } from '@/lib/cover-letter';
import { formatColombo } from '@/lib/schedule';

export const metadata: Metadata = { title: 'Cover letter' };

function HowItWorks({ saved }: { saved: boolean }) {
  return (
    <Section title="How Surelane uses it">
      <ul className="list-disc space-y-1.5 pl-5 text-[15px]">
        <li>On any job, choose <strong>Tailor my cover letter</strong>. Surelane starts from your letter and changes what the job needs: the role and company, and how your experience fits what they ask for.</li>
        <li>Your experience, facts and way of writing stay. Nothing is invented.</li>
        <li>With an AI model set up, it rewrites your letter for the job. Without one, it keeps your letter and changes only the opening and one line about the skills you share with the job.</li>
        <li>You can still choose <strong>Write a new one</strong>, which writes a letter from your CV instead.</li>
        {!saved && <li>Until you save a letter here, cover letters are written from your CV.</li>}
      </ul>
      <p className="mt-3 text-sm text-soft">Your contact details are removed before anything is sent to a cloud AI model. Always read a letter before sending it.</p>
    </Section>
  );
}

export default async function CoverLetterPage() {
  const letter = await getCoverLetter();
  if (!letter) return (
    <Page width="narrow">
      <PageHead title="Cover letter" intro="Save your own cover letter, and Surelane tailors it to each job in your own words. Without one, it writes a new letter from your CV." />
      <CoverLetterAdd />
      <div className="mt-8"><HowItWorks saved={false} /></div>
    </Page>
  );
  const source = letter.file_name ? letter.file_name : 'Pasted text';
  const edited = letter.updated_at.getTime() - letter.uploaded_at.getTime() > 1000;
  return (
    <Page>
      <PageHead title="Cover letter" intro={`${source}, saved ${formatColombo(letter.uploaded_at)}${edited ? `, edited ${formatColombo(letter.updated_at)}` : ''}. It is encrypted in your database.`} action={<CoverLetterReplace />} />
      <div className="grid gap-x-12 gap-y-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <Section title="Your letter" aside={letter.file_name ? <a href={`/api/cover-letter/file?v=${letter.version}`} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1 text-[15px]">Open original file<ExternalLink size={14} aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a> : undefined}>
            <CoverLetterEditor key={letter.version} initial={letter.text} />
          </Section>
          <div className="mb-6"><CoverLetterRemove /></div>
        </div>
        <div className="min-w-0">
          <HowItWorks saved />
          <p className="text-[15px]">Find a job on <Link href="/jobs" className="link">Jobs</Link>, open it, and use the cover letter section.</p>
        </div>
      </div>
    </Page>
  );
}
