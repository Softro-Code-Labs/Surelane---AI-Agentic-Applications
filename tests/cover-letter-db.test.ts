import { beforeEach, describe, expect, it } from 'vitest';
import { processQueue, requestTask } from '@/lib/ai/tasks';
import { getCoverLetter, removeCoverLetter, storeCoverLetter, updateCoverLetterText } from '@/lib/cover-letter';
import { one, q } from '@/lib/db';
import { resetDb, withCv } from './helpers';

const LETTER = `Dear Hiring Manager,

I am writing to express my interest in the Accountant position at [Company Name]. I have followed your growth for years.

Over six years at Ceylon Traders I closed the monthly books three days faster and led a team of four.

Kind regards,
Nimal Perera`;

async function job() {
  return (await one<{ id: string }>(
    `INSERT INTO jobs (fingerprint, source, source_label, url, sources, title, company, location, market, work_mode, sl_eligibility, description,
       verified_at, verify_method, score, tier, matching_skills)
     VALUES ('fp1','manual','Added by you','https://jobs.example/1','[]','Senior Accountant','Hayleys PLC','Colombo','sri_lanka','onsite','yes',
       'We need an ACCA qualified accountant with SAP.', now(), 'added_by_you', 80, 'Strong', ARRAY['SAP'])
     RETURNING id`))!.id;
}

beforeEach(async () => {
  await resetDb();
  await withCv();
});

describe('saved cover letter', () => {
  it('is stored encrypted and read back, and edits make a new version', async () => {
    const v1 = await storeCoverLetter(LETTER, { buf: Buffer.from(LETTER), mime: 'text/plain', name: 'letter.txt' });
    const row = await one<{ text_enc: Buffer }>('SELECT text_enc FROM cover_letter');
    expect(row!.text_enc.toString('utf8')).not.toContain('Ceylon Traders');
    expect(await getCoverLetter()).toMatchObject({ text: LETTER, version: v1, file_name: 'letter.txt' });
    const v2 = await updateCoverLetterText(`${LETTER}\n\nPS. I can start in January.`);
    expect(v2).not.toBe(v1);
    expect((await getCoverLetter())!.file_name).toBe('letter.txt');
  });
});

describe('cover letters for a job', () => {
  it('are written from your CV when you have no saved letter', async () => {
    const t = await requestTask('cover_letter', await job(), {});
    expect(t).toMatchObject({ basis: 'scratch', status: 'done', engine: 'rules' });
    expect(t!.result).toContain('Senior Accountant position at Hayleys PLC');
  });

  it('tailor your saved letter, or write a new one when you ask, and remember each choice', async () => {
    const id = await job();
    const v = await storeCoverLetter(LETTER);
    const tailored = await requestTask('cover_letter', id, {});
    expect(tailored).toMatchObject({ basis: `reference:${v}` });
    expect(tailored!.result).toContain('Over six years at Ceylon Traders');
    expect(tailored!.result).not.toContain('[Company Name]');
    const fresh = await requestTask('cover_letter', id, {}, { basis: 'scratch' });
    expect(fresh).toMatchObject({ basis: 'scratch' });
    expect(fresh!.result).not.toContain('Ceylon Traders');
    expect((await requestTask('cover_letter', id, {}))!.id).toBe(tailored!.id);
    // Editing your letter makes the next tailored version fresh.
    await updateCoverLetterText(`${LETTER}\n\nPS. I can start in January.`);
    expect((await requestTask('cover_letter', id, {}))!.id).not.toBe(tailored!.id);
  });

  it('are rewritten by the AI model from your letter, with contact details kept from a cloud model', async () => {
    const id = await job();
    await storeCoverLetter(`${LETTER}\nnimal@example.com | +94 77 123 4567`);
    const t = await requestTask('cover_letter', id, { AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'k' });
    expect(t).toMatchObject({ status: 'queued' });
    let prompt = '';
    const reply = 'Dear Hiring Manager,\n\nI am applying for the Senior Accountant role at Hayleys PLC, bringing six years of month-end work at Ceylon Traders.\n\nKind regards,\n[name] [name]';
    await processQueue({ id: 'gemini:test', cloud: true, paceMs: 0, complete: async (p) => { prompt = p; return reply; } }, 10_000, () => {});
    expect(prompt).toContain('<letter>');
    expect(prompt).toContain('Over six years at Ceylon Traders');
    expect(prompt).not.toContain('nimal@example.com');
    expect(prompt).not.toContain('123 4567');
    const done = await one<{ status: string; engine: string; result: string }>('SELECT status, engine, result FROM ai_tasks WHERE id=$1', [t!.id]);
    expect(done).toMatchObject({ status: 'done', engine: 'gemini:test' });
    expect(done!.result).not.toContain('[name]');
  });

  it('keep the quick version if your letter is removed before the model runs', async () => {
    const id = await job();
    await storeCoverLetter(LETTER);
    const t = await requestTask('cover_letter', id, { AI_PROVIDER: 'ollama' });
    await removeCoverLetter();
    await processQueue({ id: 'ollama:test', cloud: false, paceMs: 0, complete: async () => 'should not be used' }, 10_000, () => {});
    expect(await one('SELECT status, engine, error FROM ai_tasks WHERE id=$1', [t!.id])).toMatchObject({ status: 'done', engine: 'rules', error: expect.stringMatching(/changed/) });
    await q('SELECT 1');
  });
});
