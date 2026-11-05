import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { getSettings, settingsPatch, updateSettings } from '@/lib/settings';
import { safeUrl } from '@/lib/text';

export async function GET() {
  const blocked = await guard();
  return blocked ?? NextResponse.json(await getSettings());
}

export async function PATCH(req: Request) {
  const blocked = await guard();
  if (blocked) return blocked;
  const parsed = settingsPatch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: `Check this field: ${parsed.error.issues[0]?.path.join('.') ?? 'form'}.` }, { status: 400 });
  const badFeed = parsed.data.custom_feeds?.find((u) => !safeUrl(u));
  if (badFeed) return NextResponse.json({ error: `"${badFeed}" is not a valid feed link.` }, { status: 400 });
  return NextResponse.json(await updateSettings(parsed.data));
}
