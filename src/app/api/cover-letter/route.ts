import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/auth';
import { cleanLetter, letterProblem, removeCoverLetter, storeCoverLetter, updateCoverLetterText } from '@/lib/cover-letter';
import { MAX_CV_BYTES, extractText, sniffType } from '@/lib/cv/parse';

const pasted = z.object({ text: z.string().max(50_000) });

/** Saves your cover letter: a PDF, DOCX or text file, or text you pasted. */
export async function POST(req: Request) {
  const blocked = await guard();
  if (blocked) return blocked;

  if (req.headers.get('content-type')?.includes('application/json')) {
    const parsed = pasted.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Paste your cover letter first.' }, { status: 400 });
    const text = cleanLetter(parsed.data.text);
    const problem = letterProblem(text);
    if (problem) return NextResponse.json({ error: problem }, { status: 422 });
    await storeCoverLetter(text);
    return NextResponse.json({ ok: true });
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a PDF, DOCX or text file.' }, { status: 400 });
  if (file.size > MAX_CV_BYTES) return NextResponse.json({ error: 'That file is over 4 MB. Save a smaller copy and try again.' }, { status: 413 });
  const buf = Buffer.from(await file.arrayBuffer());
  const isText = /\.txt$/i.test(file.name) && !buf.includes(0);
  const mime = sniffType(buf) ?? (isText ? 'text/plain' : null);
  if (!mime) return NextResponse.json({ error: 'Only PDF, DOCX and text files can be uploaded.' }, { status: 415 });
  let text: string;
  try {
    text = cleanLetter(mime === 'text/plain' ? buf.toString('utf8') : await extractText(buf, mime));
  } catch {
    return NextResponse.json({ error: 'This file could not be read. It may be damaged or password protected.' }, { status: 422 });
  }
  if (!text) return NextResponse.json({ error: 'No readable text was found. A scanned letter needs converting to a text PDF or DOCX, or paste the text instead.' }, { status: 422 });
  const problem = letterProblem(text);
  if (problem) return NextResponse.json({ error: problem }, { status: 422 });
  await storeCoverLetter(text, { buf, mime, name: file.name.replace(/[^\w.\- ()]/g, '_').slice(0, 120) });
  return NextResponse.json({ ok: true });
}

/** Saves edits to the letter's text. */
export async function PATCH(req: Request) {
  const blocked = await guard();
  if (blocked) return blocked;
  const parsed = pasted.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'That request was not valid.' }, { status: 400 });
  const text = cleanLetter(parsed.data.text);
  const problem = letterProblem(text);
  if (problem) return NextResponse.json({ error: problem }, { status: 422 });
  if (!(await updateCoverLetterText(text))) return NextResponse.json({ error: 'Your cover letter was removed. Add it again.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const blocked = await guard();
  if (blocked) return blocked;
  await removeCoverLetter();
  return NextResponse.json({ ok: true });
}
