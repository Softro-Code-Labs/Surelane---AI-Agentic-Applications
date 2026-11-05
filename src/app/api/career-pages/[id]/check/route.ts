import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { one } from '@/lib/db';
import { inspectCareerPage, type CareerPage } from '@/lib/sources/career';
import { liveContext, saveOutcome } from '@/lib/sources/registry';

/** Looks at the page now, without saving any jobs. */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const blocked = await guard();
  if (blocked) return blocked;
  const page = await one<CareerPage>('SELECT id, company, url, default_location FROM career_pages WHERE id=$1', [(await params).id]);
  if (!page) return NextResponse.json({ error: 'This company is no longer on your list.' }, { status: 404 });
  const o = await inspectCareerPage(page, liveContext(), 0);
  await saveOutcome(page.id, o, new Date());
  return NextResponse.json({ status: o.status, message: o.message, titles: o.jobs.slice(0, 5).map((j) => j.title) });
}
