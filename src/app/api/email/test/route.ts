import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { sendTestEmail, smtpConfigured } from '@/lib/notify/email';
import { getSettings } from '@/lib/settings';

export async function POST() {
  const blocked = await guard();
  if (blocked) return blocked;
  const s = await getSettings();
  if (!s.email_recipient) return NextResponse.json({ error: 'Enter a recipient email and save it first.' }, { status: 400 });
  if (!smtpConfigured()) return NextResponse.json({ error: 'Email sending is not set up yet. Add the SMTP values from the setup guide.' }, { status: 409 });
  try {
    await sendTestEmail(s.email_recipient);
    return NextResponse.json({ ok: true, recipient: s.email_recipient });
  } catch (e) {
    return NextResponse.json({ error: `The mail server refused it: ${e instanceof Error ? e.message : e}` }, { status: 502 });
  }
}
