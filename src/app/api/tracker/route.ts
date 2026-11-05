import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { one } from '@/lib/db';

/** Copies the job's details, so the record outlives the 30-day job history. */
export async function POST(req: Request) {
  const blocked = await guard();
  if (blocked) return blocked;
  const { jobId, status = 'Saved' } = await req.json().catch(() => ({}));
  const job = await one(`SELECT * FROM jobs WHERE id=$1`, [jobId]);
  if (!job) return NextResponse.json({ error: 'This job is no longer stored.' }, { status: 404 });
  const row = await one(
    `INSERT INTO applications (job_id, title, company, location, url, market, deadline, score, tier, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (job_id) WHERE job_id IS NOT NULL DO UPDATE SET updated_at=now() RETURNING id`,
    [job.id, job.title, job.company, job.location, job.url, job.market, job.deadline, job.score, job.tier, status]);
  return NextResponse.json({ ok: true, id: row?.id });
}
