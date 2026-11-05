import { NextResponse } from 'next/server';
import mammoth from 'mammoth';
import { isSignedIn } from '@/lib/auth';
import { decrypt } from '@/lib/crypto';
import { one } from '@/lib/db';

export async function GET() {
  if (!(await isSignedIn())) return NextResponse.json({ error: 'Sign in again to continue.' }, { status: 401 });
  const row = await one<{ file_enc: Buffer; mime: string; file_name: string }>('SELECT file_enc, mime, file_name FROM cv WHERE id = 1');
  if (!row) return NextResponse.json({ error: 'No CV is uploaded.' }, { status: 404 });
  const file = decrypt(row.file_enc);
  const base = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'SAMEORIGIN' };
  if (row.mime === 'application/pdf') {
    return new Response(new Uint8Array(file), { headers: { ...base, 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="cv.pdf"' } });
  }
  const { value } = await mammoth.convertToHtml({ buffer: file });
  const html = `<!doctype html><meta charset="utf-8"><style>body{font:15px/1.55 system-ui,sans-serif;max-width:720px;margin:24px auto;padding:0 20px;color:#17302a}</style>${value}`;
  return new Response(html, { headers: { ...base, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'self'" } });
}
