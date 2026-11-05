import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth';
import { one, q } from '@/lib/db';
import { MAX_CAREER_PAGES, inspectCareerPage, parseEntry, type CareerPage } from '@/lib/sources/career';
import { liveContext, saveOutcome } from '@/lib/sources/registry';

const body = z.object({ entries: z.string().max(20000), default_location: z.string().trim().min(2).max(100).default('Sri Lanka') });

/** Adds pages and checks permission straight away, so a refusal shows at once. */
export async function POST(req: Request) {
  const blocked = await guard();
  if (blocked) return blocked;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Paste at least one career page link.' }, { status: 400 });
  const lines = parsed.data.entries.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return NextResponse.json({ error: 'Paste at least one career page link.' }, { status: 400 });
  // One typo must not lose a long pasted list: add what is valid, report the rest.
  const entries = lines.flatMap((l) => parseEntry(l) ?? []);
  const invalid = lines.filter((l) => !parseEntry(l));
  if (!entries.length) return NextResponse.json({ error: `This is not a valid link: ${invalid[0]}` }, { status: 400 });
  const count = Number((await one<{ n: string }>('SELECT count(*) n FROM career_pages'))!.n);
  if (count + entries.length > MAX_CAREER_PAGES) return NextResponse.json({ error: `The list holds ${MAX_CAREER_PAGES} companies, and you have ${count}.` }, { status: 400 });

  const added: CareerPage[] = [];
  for (const e of entries) {
    const row = await one<CareerPage>(
      `INSERT INTO career_pages (company, url, default_location) VALUES ($1,$2,$3) ON CONFLICT (url) DO NOTHING RETURNING id, company, url, default_location`,
      [e.company, e.url, parsed.data.default_location]);
    if (row) added.push(row);
  }

  // Quick look only: job pages are opened during searches. Anything over the
  // time limit stays "Not checked yet" and is checked at the next search.
  const ctx = liveContext();
  const stop = Date.now() + 40_000;
  const results: { company: string; status: string; message: string }[] = [];
  const queue = [...added];
  await Promise.all([1, 2, 3, 4].map(async () => {
    for (let p = queue.shift(); p && Date.now() < stop; p = queue.shift()) {
      const o = await inspectCareerPage(p, ctx, 0);
      await saveOutcome(p.id, o, new Date());
      results.push({ company: p.company, status: o.status, message: o.message });
    }
  }));
  return NextResponse.json({ ok: true, added: added.length, skipped: entries.length - added.length, invalid, results });
}

export async function GET() {
  const blocked = await guard();
  return blocked ?? NextResponse.json(await q('SELECT * FROM career_pages ORDER BY company'));
}
