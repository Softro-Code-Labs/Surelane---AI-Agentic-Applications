import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth';
import { searchProfile } from '@/lib/cv-terms';
import { rescoreStored } from '@/lib/search/run';
import { getCv, getSettings, updateSettings } from '@/lib/settings';

const body = z.object({ keyword: z.string().trim().min(1).max(200), hidden: z.boolean() }).strict();

/** Hides a role or skill read from your CV from searches and match scores, or brings it back. */
export async function POST(req: Request) {
  const blocked = await guard();
  if (blocked) return blocked;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'That change could not be saved.' }, { status: 400 });
  const { keyword, hidden } = parsed.data;
  const before = await getSettings();
  const others = (before.hidden_keywords ?? []).filter((k) => k.toLowerCase() !== keyword.toLowerCase());
  let settings;
  try {
    settings = await updateSettings({ hidden_keywords: hidden ? [...others, keyword].slice(-50) : others });
  } catch {
    return NextResponse.json({ error: 'This needs a database update first. Run npm run db:migrate, then try again.' }, { status: 503 });
  }
  // Jobs already found are scored again, so the Jobs page reflects the change straight away.
  const cv = await getCv();
  if (cv) await rescoreStored(searchProfile(cv.profile, settings), String(cv.profile_version), settings);
  return NextResponse.json({ ok: true });
}
