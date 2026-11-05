import { NextResponse } from 'next/server';
import { safeEqual } from '@/lib/crypto';
import { triggerWorker } from '@/lib/dispatch';
import { workDue } from '@/worker/tick';

/** Called by the free timing service at each slot. Holds no search logic itself. */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  if (!secret || !safeEqual(given, secret)) return NextResponse.json({ error: 'Not authorised.' }, { status: 401 });
  const due = await workDue(new Date());
  return NextResponse.json({ due, started: due.any ? await triggerWorker() : false });
}
