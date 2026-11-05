import { NextResponse } from 'next/server';
import { guard } from '@/lib/auth';
import { aiEnabled } from '@/lib/ai/provider';
import { storeCv } from '@/lib/ai/tasks';
import { MAX_CV_BYTES, analyseCv, extractText, sniffType } from '@/lib/cv/parse';
import { q } from '@/lib/db';
import { rescoreStored } from '@/lib/search/run';
import { getSettings } from '@/lib/settings';
import { triggerWorker } from '@/lib/dispatch';

export async function POST(req: Request) {
  const blocked = await guard();
  if (blocked) return blocked;
  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a PDF or DOCX file.' }, { status: 400 });
  if (file.size > MAX_CV_BYTES) return NextResponse.json({ error: 'That file is over 4 MB. Save a smaller copy and try again.' }, { status: 413 });
  const buf = Buffer.from(await file.arrayBuffer());
  const mime = sniffType(buf);
  if (!mime) return NextResponse.json({ error: 'Only PDF and DOCX files can be uploaded.' }, { status: 415 });
  let text: string;
  try {
    text = await extractText(buf, mime);
  } catch {
    return NextResponse.json({ error: 'This file could not be read. It may be damaged or password protected.' }, { status: 422 });
  }
  if (text.length < 80) {
    return NextResponse.json({ error: 'No readable text was found. A scanned CV needs converting to a text PDF or DOCX first.' }, { status: 422 });
  }
  const profile = analyseCv(text);
  const name = file.name.replace(/[^\w.\- ()]/g, '_').slice(0, 120);
  const version = await storeCv(buf, mime, name, text, profile);
  await rescoreStored(profile, version, await getSettings());
  if (aiEnabled()) {
    await q(`INSERT INTO ai_tasks (kind, profile_version, status) VALUES ('cv_profile',$1,'queued')`, [version]);
    await triggerWorker();
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const blocked = await guard();
  if (blocked) return blocked;
  await q('DELETE FROM cv WHERE id = 1');
  return NextResponse.json({ ok: true });
}
