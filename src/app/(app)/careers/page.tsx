import type { Metadata } from 'next';
import { AddCareerPages, CareerRow } from '@/components/CareerPages';
import { Empty, Page, PageHead, Section, SubGroup, Tag } from '@/components/ui';
import { NO_CATEGORY, groupByCategory } from '@/lib/career-categories';
import { q } from '@/lib/db';
import { formatColombo } from '@/lib/schedule';
import { MAX_CAREER_PAGES } from '@/lib/sources/career';
import { existingCategories } from '@/lib/sources/registry';

export const metadata: Metadata = { title: 'Career pages' };

export default async function Careers() {
  const [rows, categories] = await Promise.all([
    q(`SELECT * FROM career_pages ORDER BY (last_status = 'not_allowed') DESC NULLS LAST, company`),
    existingCategories(),
  ]);
  const pages = rows.map((r) => ({ id: r.id, company: r.company, url: r.url, enabled: r.enabled, category: r.category, last_status: r.last_status, last_message: r.last_message, last_found: r.last_found, last_checked: r.last_checked_at ? formatColombo(r.last_checked_at) : null }));
  const refused = pages.filter((p) => p.last_status === 'not_allowed').length;
  const groups = groupByCategory(pages);
  // With no categories in use, a lone "No category" heading would only add noise.
  const showHeadings = groups.some((g) => g.category !== null);
  const rowsOf = (list: typeof pages) => <ul className="divide-y divide-line">{list.map((p) => <CareerRow key={p.id} page={p} categories={categories} />)}</ul>;
  return (
    <Page>
      <PageHead title="Career pages" eyebrow="Search setup" intro="Add the companies you want to work for. Surelane checks their career pages at every search time." />
      <div className="mb-5"><AddCareerPages categories={categories} /></div>
      <Section title={`Your companies (${pages.length} of ${MAX_CAREER_PAGES})`} aside={refused > 0 ? <Tag tone="stop">{refused} not allowed</Tag> : undefined}>
        {pages.length ? (
          <div className="grid gap-7">
            {groups.map((g) => (
              showHeadings
                ? <SubGroup key={g.category ?? ''} title={g.category ?? NO_CATEGORY} count={g.pages.length} noun={['company', 'companies']}>{rowsOf(g.pages)}</SubGroup>
                : <div key="all">{rowsOf(g.pages)}</div>
            ))}
          </div>
        ) : <Empty title="No companies yet">Paste a career page link above. Sites that use Lever, Greenhouse, Ashby, SmartRecruiters, Workable or Recruitee work best.</Empty>}
      </Section>
      <p className="measure px-1 text-[13px] text-soft">
        Surelane reads a page only if the site permits it, and never signs in or gets past an anti-bot check. It tests a site&apos;s robots rules and access controls, not its written terms of use, so a site could still forbid automated reading in its terms. Removing a company keeps its saved jobs in your applications.
      </p>
    </Page>
  );
}
