import { decrypt, encrypt } from './crypto';
import { one, q } from './db';

/*
 * Your own cover letter. It is the starting point for tailored letters: Surelane
 * keeps your voice and facts, and changes what each job needs. Stored encrypted,
 * like your CV, and kept until you remove it.
 */

export const LETTER_MIN = 150;
export const LETTER_MAX = 12_000;

export type CoverLetter = { text: string; version: string; file_name: string | null; mime: string | null; uploaded_at: Date; updated_at: Date };

/** Tidies text from a file or a paste: plain line breaks, no runs of blank lines or trailing spaces. */
export function cleanLetter(raw: string): string {
  return raw.replace(/\r\n?/g, '\n').replace(/[ \t ]+$/gm, '').replace(/[ \t ]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/** A CV uploaded here by mistake has several CV section headings, and usually runs long. */
export function looksLikeCv(text: string): boolean {
  const headings = text.split('\n').filter((l) => /^\s*(work |professional )?(experience|employment history|education|skills|certifications?|references|projects|languages)\s*:?\s*$/i.test(l)).length;
  return headings >= 3;
}

/** The reason a letter can't be saved, or null when it is fine. */
export function letterProblem(text: string): string | null {
  if (text.length < LETTER_MIN) return `That is too short for a cover letter. Add at least ${LETTER_MIN} characters.`;
  if (text.length > LETTER_MAX) return 'That is longer than a cover letter usually is. Keep it under 12,000 characters, about four pages.';
  if (looksLikeCv(text)) return 'This looks like a CV rather than a cover letter. Upload your CV on My CV, and your cover letter here.';
  return null;
}

export async function hasCoverLetter(): Promise<boolean> {
  return Boolean(await one('SELECT 1 FROM cover_letter WHERE id = 1'));
}

export async function getCoverLetter(): Promise<CoverLetter | null> {
  const row = await one<{ text_enc: Buffer; version: string; file_name: string | null; mime: string | null; uploaded_at: Date; updated_at: Date }>(
    'SELECT text_enc, version, file_name, mime, uploaded_at, updated_at FROM cover_letter WHERE id = 1');
  return row ? { text: decrypt(row.text_enc).toString('utf8'), version: String(row.version), file_name: row.file_name, mime: row.mime, uploaded_at: row.uploaded_at, updated_at: row.updated_at } : null;
}

/** Saves a letter. A file is kept so you can open the original. A new version makes earlier tailored letters out of date. */
export async function storeCoverLetter(text: string, file?: { buf: Buffer; mime: string; name: string }): Promise<string> {
  const v = (await one<{ v: string }>(`SELECT nextval('cover_letter_version_seq') v`))!.v;
  await q(
    `INSERT INTO cover_letter (id, file_name, mime, size_bytes, file_enc, text_enc, version, uploaded_at, updated_at)
     VALUES (1,$1,$2,$3,$4,$5,$6,now(),now())
     ON CONFLICT (id) DO UPDATE SET file_name=$1, mime=$2, size_bytes=$3, file_enc=$4, text_enc=$5, version=$6, uploaded_at=now(), updated_at=now()`,
    [file?.name ?? null, file?.mime ?? null, file?.buf.length ?? null, file ? encrypt(file.buf) : null, encrypt(text), v]);
  return v;
}

/** Saves your edits to the text. The original file, if any, stays as it was. */
export async function updateCoverLetterText(text: string): Promise<string | null> {
  const v = (await one<{ v: string }>(`SELECT nextval('cover_letter_version_seq') v`))!.v;
  const row = await one(`UPDATE cover_letter SET text_enc=$1, version=$2, updated_at=now() WHERE id=1 RETURNING id`, [encrypt(text), v]);
  return row ? v : null;
}

export async function removeCoverLetter() {
  await q('DELETE FROM cover_letter WHERE id = 1');
}
