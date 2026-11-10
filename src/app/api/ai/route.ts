import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth';
import { requestTask } from '@/lib/ai/tasks';
import { triggerWorker } from '@/lib/dispatch';

const body = z.object({
  kind: z.enum(['cover_letter', 'job_summary', 'cv_improve', 'career_recs']), jobId: z.union([z.string(), z.number()]).nullish(),
  basis: z.enum(['reference', 'scratch']).optional(),
});

export async function POST(req: Request) {
  const blocked = await guard();
  if (blocked) return blocked;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'That request was not valid.' }, { status: 400 });
  try {
    const task = await requestTask(parsed.data.kind, parsed.data.jobId ? String(parsed.data.jobId) : null, process.env, { basis: parsed.data.basis });
    if (task?.status === 'queued') await triggerWorker();
    return NextResponse.json(task);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'That could not be generated.' }, { status: 409 });
  }
}
