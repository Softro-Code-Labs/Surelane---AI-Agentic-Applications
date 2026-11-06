import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { emailConfigured, sendTestEmail } from '@/lib/notify/email';
import { getSettings } from '@/lib/settings';

export async function POST() {
  const blocked = await guard();
  if (blocked) return blocked;
  const s = await getSettings();
  if (!s.email_recipient) return NextResponse.json({ error: 'Enter a recipient email and save it first.' }, { status: 400 });
  if (!emailConfigured()) return NextResponse.json({ error: 'Email sending is not set up yet. Add RESEND_API_KEY from the setup guide.' }, { status: 409 });
  try {
    await sendTestEmail(s.email_recipient);
    return NextResponse.json({ ok: true, recipient: s.email_recipient });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'The test email could not be sent.' }, { status: 502 });
  }
}
