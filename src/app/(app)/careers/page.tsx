import type { Metadata } from 'next';
import { AddCareerPages, CareerRow } from '@/components/CareerPages';
import { Empty, Page, PageHead, Section, Tag } from '@/components/ui';
import { q } from '@/lib/db';
import { formatColombo } from '@/lib/schedule';
import { MAX_CAREER_PAGES } from '@/lib/sources/career';

export const metadata: Metadata = { title: 'Career pages' };

export default async function Careers() {
  const rows = await q(`SELECT * FROM career_pages ORDER BY (last_status = 'not_allowed') DESC NULLS LAST, company`);
  const pages = rows.map((r) => ({ id: r.id, company: r.company, url: r.url, enabled: r.enabled, last_status: r.last_status, last_message: r.last_message, last_found: r.last_found, last_checked: r.last_checked_at ? formatColombo(r.last_checked_at) : null }));
  const refused = pages.filter((p) => p.last_status === 'not_allowed').length;
  return (
    <Page>
      <PageHead title="Career pages" intro="Add the companies you want to work for. Surelane checks their career pages at every search time." />
      <div className="mb-8"><AddCareerPages /></div>
      <Section title={`Your companies (${pages.length} of ${MAX_CAREER_PAGES})`} aside={refused > 0 ? <Tag tone="stop">{refused} not allowed</Tag> : undefined}>
        {pages.length ? <ul className="divide-y divide-line">{pages.map((p) => <CareerRow key={p.id} page={p} />)}</ul> : <Empty title="No companies yet">Paste a career page link above. Sites that use Lever, Greenhouse, Ashby, SmartRecruiters, Workable or Recruitee work best.</Empty>}
      </Section>
      <p className="measure text-sm text-soft">
        Surelane reads a page only if the site permits it, and never signs in or gets past an anti-bot check. It tests a site&apos;s robots rules and access controls, not its written terms of use, so a site could still forbid automated reading in its terms. Removing a company keeps its saved jobs in your applications.
      </p>
    </Page>
  );
}
