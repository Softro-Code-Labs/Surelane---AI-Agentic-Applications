import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { one, q } from '@/lib/db';
import { executeSearch } from '@/lib/search/run';
import { RECOMMENDABLE } from '@/lib/settings';
import { tick, workDue } from '@/worker/tick';
import { API_KEY, fakeResend, type Sent } from './fake-resend';
import { jobDescription, resetDb, source, withCv } from './helpers';

let inbox: Sent[] = [];
const env = () => ({ RESEND_API_KEY: API_KEY, EMAIL_FROM: 'Surelane <alerts@example.com>', APP_URL: 'https://app.example' });

const at8 = () => new Date('2026-11-04T02:31:00Z'); // 08:01 Colombo
const deps = (sources: any[], over = {}) => ({ sources, provider: null, env: env(), now: at8, sleep: async () => {}, log: () => {}, fetch: (async () => new Response('', { status: 404 })) as any, ...over });
const counts = async () => (await one(`SELECT count(*)::int n FROM search_runs`))!.n;

beforeEach(async () => {
  const resend = fakeResend(['example.com']);
  inbox = resend.inbox;
  vi.stubGlobal('fetch', resend.handler);
  await resetDb();
  await q(`UPDATE settings SET email_recipient='me@example.com'`);
});

afterEach(() => { vi.unstubAllGlobals(); });

describe('scheduled search end to end', () => {
  it('searches, saves, ranks and emails through Resend', async () => {
    await withCv();
    await tick(deps([source('a', [{ title: 'Senior Software Engineer' }, { title: 'Registered Nurse', description: 'Requirements\n• Patient care, nursing' }])]));
    const run = await one(`SELECT * FROM search_runs`);
    expect(run).toMatchObject({ status: 'completed', trigger: 'scheduled', slot_key: 'morning', jobs_found: 2, jobs_new: 1 });
    const jobs = await q(`SELECT * FROM jobs`);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ market: 'sri_lanka', scored_by: 'rules' });
    expect(jobs[0].notified_at).not.toBeNull();
    expect(inbox).toHaveLength(1);
    expect(inbox[0]!.to).toBe('me@example.com');
    expect(inbox[0]!.body).toContain('Senior Software Engineer');
    expect(await q(`SELECT * FROM notifications WHERE status='sent' AND kind='matches'`)).toHaveLength(1);
    expect(await q(`SELECT status FROM search_run_sources`)).toEqual([{ status: 'success' }]);
  });

  it('runs each slot once however many triggers fire', async () => {
    await withCv();
    const d = deps([source('a', [{}])]);
    await Promise.all([tick(d), tick(d)]);
    await tick(d);
    expect(await counts()).toBe(1);
    expect(inbox).toHaveLength(1);
  });

  it('does not run outside a slot', async () => {
    await withCv();
    await tick(deps([source('a', [{}])], { now: () => new Date('2026-11-04T05:00:00Z') }));
    expect((await q(`SELECT * FROM search_runs WHERE status <> 'missed'`))).toHaveLength(0);
  });

  it('respects each slot switch', async () => {
    await withCv();
    await q(`UPDATE settings SET slot_morning=false`);
    await tick(deps([source('a', [{}])]));
    expect(await counts()).toBe(0);
    await q(`UPDATE settings SET slot_morning=true, slot_midday=false`);
    await tick(deps([source('a', [{}])], { now: () => new Date('2026-11-04T07:05:00Z') }));
    expect(await q(`SELECT * FROM search_runs WHERE slot_key='midday'`)).toHaveLength(0);
    await tick(deps([source('a', [{}])], { now: () => new Date('2026-11-04T11:35:00Z') }));
    expect(await q(`SELECT * FROM search_runs WHERE slot_key='evening' AND status='completed'`)).toHaveLength(1);
  });

  it('logs a missed slot when no trigger arrived', async () => {
    await withCv();
    await tick(deps([source('a', [{}])], { now: () => new Date('2026-11-04T05:00:00Z') }));
    expect(await q(`SELECT slot_key, status FROM search_runs`)).toEqual([{ slot_key: 'morning', status: 'missed' }]);
  });

  it('skips with a clear reason when there is no CV', async () => {
    await tick(deps([source('a', [{}])]));
    expect(await one(`SELECT status, summary FROM search_runs`)).toMatchObject({ status: 'skipped' });
    expect(inbox).toHaveLength(0);
  });
});

describe('master switch and email control', () => {
  it('OFF: no search, no email, manual requests cancelled', async () => {
    await withCv();
    await q(`UPDATE settings SET agent_enabled=false`);
    await q(`INSERT INTO search_requests DEFAULT VALUES`);
    let called = false;
    await tick(deps([source('a', [{}], { search: async () => { called = true; return []; } })]));
    expect(called).toBe(false);
    expect(await counts()).toBe(0);
    expect(inbox).toHaveLength(0);
    expect(await one(`SELECT status FROM search_requests`)).toEqual({ status: 'cancelled' });
  });

  it('switching OFF during a search cancels it and blocks its email', async () => {
    await withCv();
    const first = source('a', [{ title: 'Senior Software Engineer' }]);
    const original = first.search;
    first.search = async (c) => { const r = await original(c); await q(`UPDATE settings SET agent_enabled=false`); return r; };
    await tick(deps([first, source('b', [{ title: 'Backend Developer' }])]));
    expect(await one(`SELECT status FROM search_runs`)).toMatchObject({ status: 'cancelled' });
    expect(inbox).toHaveLength(0);
  });

  it('turning OFF after the search still blocks the email at send time', async () => {
    const { sendRunEmail } = await import('@/lib/notify/email');
    await withCv();
    const run = await one(`INSERT INTO search_runs (trigger,status) VALUES ('scheduled','completed') RETURNING id`);
    await q(`UPDATE settings SET agent_enabled=false`);
    expect(await sendRunEmail(run.id, { env: env() })).toBe('skipped');
    expect(inbox).toHaveLength(0);
  });

  it('turning back ON resumes searches', async () => {
    await withCv();
    await q(`UPDATE settings SET agent_enabled=false`);
    await tick(deps([source('a', [{}])]));
    await q(`UPDATE settings SET agent_enabled=true`);
    await tick(deps([source('a', [{}])]));
    expect(await one(`SELECT status FROM search_runs`)).toMatchObject({ status: 'completed' });
    expect(inbox).toHaveLength(1);
  });

  it('manual searches run but do not email; their jobs arrive with the next scheduled email', async () => {
    await withCv();
    await q(`INSERT INTO search_requests DEFAULT VALUES`);
    await tick(deps([source('a', [{ title: 'Senior Software Engineer' }])], { now: () => new Date('2026-11-04T05:00:00Z') }));
    expect(await one(`SELECT status FROM search_runs WHERE trigger='manual'`)).toMatchObject({ status: 'completed' });
    expect(inbox).toHaveLength(0);
    await tick(deps([source('a', [{ title: 'Senior Software Engineer' }])], { now: () => new Date('2026-11-04T07:01:00Z') }));
    expect(inbox).toHaveLength(1);
  });

  it('never emails the same job twice', async () => {
    await withCv();
    await tick(deps([source('a', [{ title: 'Senior Software Engineer' }])]));
    await q(`UPDATE settings SET email_no_results='silent'`);
    await tick(deps([source('a', [{ title: 'Senior Software Engineer' }])], { now: () => new Date('2026-11-04T07:01:00Z') }));
    expect(inbox).toHaveLength(1);
  });

  it('strong-only mode, minimum score and email-off are honoured', async () => {
    await withCv();
    await q(`UPDATE settings SET email_mode='strong', email_no_results='silent'`);
    await tick(deps([source('a', [{ title: 'QA Engineer', description: 'Requirements\n• Selenium, Cypress, Postman\n• TypeScript' }])]));
    expect(inbox).toHaveLength(0);
    await q(`UPDATE settings SET email_mode='all', email_enabled=false`);
    await tick(deps([source('a', [{ title: 'Senior Software Engineer' }])], { now: () => new Date('2026-11-04T07:01:00Z') }));
    expect(inbox).toHaveLength(0);
  });

  it('sends a short summary, or stays silent, when nothing matches', async () => {
    await withCv();
    await tick(deps([source('a', [])]));
    expect(inbox).toHaveLength(1);
    expect(inbox[0]!.body).toContain('No new job matches');
    await q(`UPDATE settings SET email_no_results='silent'`);
    await tick(deps([source('a', [])], { now: () => new Date('2026-11-04T07:01:00Z') }));
    expect(inbox).toHaveLength(1);
  });

  it('keeps a failed email for the next run', async () => {
    await withCv();
    await tick(deps([source('a', [{ title: 'Senior Software Engineer' }])], { env: { ...env(), RESEND_API_KEY: 're_wrong_key' } }));
    expect(await one(`SELECT status FROM notifications`)).toMatchObject({ status: 'failed' });
    expect((await one(`SELECT notified_at FROM jobs`)).notified_at).toBeNull();
    await tick(deps([source('a', [{ title: 'Senior Software Engineer' }])], { now: () => new Date('2026-11-04T07:01:00Z') }));
    expect(inbox).toHaveLength(1);
  });

  it('escapes hostile job content in email', async () => {
    await withCv();
    await tick(deps([source('a', [{ title: 'Software Engineer <script>alert(1)</script>' }])]));
    const html = inbox[0]!.html;
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('active-vacancy verification', () => {
  const scheduledDeps = (s: any[]) => deps(s, { now: () => new Date() });

  it('excludes expired listings from the database and from email', async () => {
    await withCv();
    await q(`INSERT INTO search_runs (trigger,status) VALUES ('manual','running')`);
    const run = await one(`SELECT id FROM search_runs`);
    await executeSearch({ runId: run.id, trigger: 'manual' }, deps([source('a', [
      { title: 'Senior Software Engineer', deadline: new Date(Date.now() - 86400000) },
      { title: 'Backend Developer', description: jobDescription('This position has been filled.') },
      { title: 'Full Stack Developer', postedAt: new Date(Date.now() - 90 * 86400000) },
      { title: 'React Developer', postedAt: new Date() },
    ])], { now: () => new Date() }));
    expect((await q(`SELECT title FROM jobs`)).map((j) => j.title)).toEqual(['React Developer']);
    expect(await one(`SELECT filtered_outdated FROM search_runs`)).toEqual({ filtered_outdated: 3 });
  });

  it('marks a stored job closed when its provider says so', async () => {
    await withCv();
    const a = source('a', [{ title: 'Senior Software Engineer', postedAt: new Date() }]);
    await q(`INSERT INTO search_runs (trigger,status) VALUES ('manual','running')`);
    await executeSearch({ runId: '1', trigger: 'manual' }, scheduledDeps([a]));
    a.search = async () => [];
    a.verify = async (rows) => new Map(rows.map((r) => [r.id, 'closed' as const]));
    await q(`UPDATE search_runs SET status='running' WHERE id=1`);
    await q(`UPDATE jobs SET verified_at = now() - interval '4 hours'`); // the gap between two slots
    await executeSearch({ runId: '1', trigger: 'manual' }, scheduledDeps([a]));
    expect(await one(`SELECT status FROM jobs`)).toMatchObject({ status: 'closed' });
    expect(await q(`SELECT 1 FROM jobs j WHERE ${RECOMMENDABLE}`)).toHaveLength(0);
  });

  it('closes a job once it disappears from an employer board', async () => {
    await withCv();
    const board = source('lever:x', [{ title: 'Senior Software Engineer', postedAt: new Date() }], { completeListing: true });
    await q(`INSERT INTO search_runs (trigger,status) VALUES ('manual','running')`);
    await executeSearch({ runId: '1', trigger: 'manual' }, scheduledDeps([board]));
    expect(await one(`SELECT status, verify_method FROM jobs`)).toEqual({ status: 'active', verify_method: 'employer_board' });
    board.search = async () => [];
    await q(`UPDATE search_runs SET status='running' WHERE id=1`);
    await executeSearch({ runId: '1', trigger: 'manual' }, scheduledDeps([board]));
    expect(await one(`SELECT status FROM jobs`)).toMatchObject({ status: 'closed' });
  });

  it('stops recommending once a deadline passes, even between searches', async () => {
    await withCv();
    await q(`INSERT INTO search_runs (trigger,status) VALUES ('manual','running')`);
    await executeSearch({ runId: '1', trigger: 'manual' }, scheduledDeps([source('a', [{ title: 'Senior Software Engineer', postedAt: new Date(), deadline: new Date(Date.now() + 3600000) }])]));
    expect(await q(`SELECT 1 FROM jobs j WHERE ${RECOMMENDABLE}`)).toHaveLength(1);
    await q(`UPDATE jobs SET deadline = now() - interval '1 minute'`);
    expect(await q(`SELECT 1 FROM jobs j WHERE ${RECOMMENDABLE}`)).toHaveLength(0);
  });

  it('keeps a job you added yourself, which no source can re-check', async () => {
    await q(`INSERT INTO jobs (fingerprint, source, source_label, url, title, company, market, tier, score, verified_at)
             VALUES ('m','manual','Added by you','https://x.test','T','C','sri_lanka','Good',70, now() - interval '20 days')`);
    expect(await q(`SELECT 1 FROM jobs j WHERE ${RECOMMENDABLE}`)).toHaveLength(1);
  });

  it('stops recommending a job nobody has confirmed for 72 hours', async () => {
    await withCv();
    await q(`INSERT INTO search_runs (trigger,status) VALUES ('manual','running')`);
    await executeSearch({ runId: '1', trigger: 'manual' }, scheduledDeps([source('a', [{ title: 'Senior Software Engineer', postedAt: new Date() }])]));
    await q(`UPDATE jobs SET verified_at = now() - interval '73 hours'`);
    expect(await q(`SELECT 1 FROM jobs j WHERE ${RECOMMENDABLE}`)).toHaveLength(0);
  });
});

describe('sources, duplicates and failures', () => {
  it('merges the same vacancy from two sources into one record', async () => {
    await withCv();
    await tick(deps([
      source('a', [{ title: 'Senior Software Engineer', company: 'Acme Pvt Ltd', location: 'Colombo' }]),
      source('b', [{ title: 'Senior Software Engineer', company: 'ACME (Private) Limited', location: 'Colombo, Sri Lanka' }]),
    ]));
    const jobs = await q(`SELECT sources FROM jobs`);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].sources).toHaveLength(2);
    expect(await one(`SELECT duplicates FROM search_runs`)).toEqual({ duplicates: 1 });
  });

  it('keeps going when a source fails, and reports it honestly', async () => {
    await withCv();
    await tick(deps([source('down', [], { search: async () => { throw new Error('HTTP 503'); } }), source('up', [{ title: 'Senior Software Engineer' }])]));
    const run = await one(`SELECT status, errors, summary FROM search_runs`);
    expect(run.status).toBe('partial');
    expect(run.errors[0]).toContain('HTTP 503');
    expect(await q(`SELECT label, status, error FROM search_run_sources ORDER BY id`)).toEqual([
      { label: 'down', status: 'failed', error: 'HTTP 503' }, { label: 'up', status: 'success', error: null }]);
    expect(inbox).toHaveLength(1);
  });

  it('says failed, not "no jobs", when every source fails', async () => {
    await withCv();
    await tick(deps([source('down', [], { search: async () => { throw new Error('boom'); } })]));
    expect(await one(`SELECT status FROM search_runs`)).toMatchObject({ status: 'failed' });
    expect(inbox).toHaveLength(0);
  });

  it('records global-only sources as skipped while Global is off, and uses them when on', async () => {
    await withCv();
    const g = source('global', [{ title: 'Senior Software Engineer', location: 'Berlin, Germany', country: 'Germany' }], { scope: 'global' });
    await tick(deps([g, source('a', [])]));
    expect(await one(`SELECT status, error FROM search_run_sources WHERE source='global'`)).toEqual({ status: 'skipped', error: 'Global job opportunities are off' });
    expect(await q(`SELECT 1 FROM jobs`)).toHaveLength(0);
    await q(`UPDATE settings SET global_enabled=true`);
    await tick(deps([g, source('a', [])], { now: () => new Date('2026-11-04T07:01:00Z') }));
    expect(await one(`SELECT market FROM jobs`)).toEqual({ market: 'international' });
    expect(await one(`SELECT mode FROM search_runs WHERE slot_key='midday'`)).toEqual({ mode: 'global' });
  });

  it('with Local off, skips Sri Lankan sources and keeps only global jobs', async () => {
    await withCv();
    await q(`UPDATE settings SET local_enabled=false, global_enabled=true`);
    const lk = source('lk', [{ title: 'Senior Software Engineer' }]);
    const both = source('both', [{ title: 'Senior Software Engineer', location: 'Colombo' }, { title: 'Senior Software Engineer', location: 'Berlin, Germany', country: 'Germany' }], { scope: 'both' });
    await tick(deps([lk, both]));
    expect(await one(`SELECT status, error FROM search_run_sources WHERE source='lk'`)).toEqual({ status: 'skipped', error: 'Local job opportunities are off' });
    expect(await q(`SELECT market FROM jobs`)).toEqual([{ market: 'international' }]);
    expect(await one(`SELECT mode FROM search_runs`)).toEqual({ mode: 'global_only' });
  });

  it('with Local and Global both off, does not search and sends nothing', async () => {
    await withCv();
    await q(`UPDATE settings SET local_enabled=false, global_enabled=false`);
    await tick(deps([source('a', [{ title: 'Senior Software Engineer' }])]));
    expect(await one(`SELECT status, summary FROM search_runs`)).toMatchObject({ status: 'skipped', summary: expect.stringMatching(/both off/) });
    expect(await q(`SELECT 1 FROM search_run_sources`)).toHaveLength(0);
    expect(inbox).toHaveLength(0);
  });

  it('emails local and global jobs in separate sections when both are on', async () => {
    await withCv();
    await q(`UPDATE settings SET global_enabled=true`);
    await tick(deps([source('both', [{ title: 'Senior Software Engineer', location: 'Colombo' }, { title: 'Senior Software Engineer', location: 'Berlin, Germany', country: 'Germany' }], { scope: 'both' })]));
    expect(inbox).toHaveLength(1);
    const body = inbox[0]!.body;
    expect(body.indexOf('Local Job Opportunities (Sri Lanka)')).toBeGreaterThan(-1);
    expect(body.indexOf('Colombo')).toBeLessThan(body.indexOf('Global Job Opportunities (International)'));
    expect(body.indexOf('Global Job Opportunities (International)')).toBeLessThan(body.indexOf('Berlin'));
  });

  it('respects a provider daily limit', async () => {
    await withCv();
    const limited = source('remotive', [], { maxPerDay: 2 });
    for (const when of ['2026-11-04T02:31:00Z', '2026-11-04T07:01:00Z', '2026-11-04T11:31:00Z']) {
      await tick(deps([limited, source('a', [])], { now: () => new Date(when) }));
    }
    expect((await q(`SELECT status FROM search_run_sources WHERE source='remotive' ORDER BY id`)).map((r) => r.status)).toEqual(['success', 'success', 'skipped']);
  });

  it('re-scores stored jobs when the CV is replaced', async () => {
    const { storeCv } = await import('@/lib/ai/tasks');
    const { analyseCv } = await import('@/lib/cv/parse');
    await withCv();
    await tick(deps([source('a', [{ title: 'Senior Software Engineer' }])]));
    const before = await one(`SELECT score, profile_version FROM jobs`);
    await storeCv(Buffer.from('x'), 'application/pdf', 'new.pdf', 'x', analyseCv('Sam\nGraduate Trainee\n\nSKILLS\nPython'));
    await tick(deps([source('a', [])], { now: () => new Date('2026-11-04T07:01:00Z') }));
    const after = await one(`SELECT score, profile_version FROM jobs`);
    expect(after.profile_version).not.toBe(before.profile_version);
    expect(after.score).toBeLessThan(before.score);
  });

  it('reports idle checks without doing work', async () => {
    await withCv();
    await tick(deps([source('a', [])]));
    expect(await workDue(at8())).toMatchObject({ slots: 0, manual: false });
    await q(`INSERT INTO search_requests DEFAULT VALUES`);
    expect((await workDue(at8())).manual).toBe(true);
  });

  it('recovers from a crashed worker', async () => {
    await withCv();
    await q(`INSERT INTO search_runs (trigger,status,heartbeat_at) VALUES ('manual','running', '2026-11-04T01:00:00Z')`);
    await tick(deps([source('a', [{}])]));
    expect(await one(`SELECT status FROM search_runs WHERE id=1`)).toMatchObject({ status: 'failed' });
    expect(await one(`SELECT status FROM search_runs WHERE slot_key='morning'`)).toMatchObject({ status: 'completed' });
  });
});

describe('AI provider', () => {
  const fake = (reply: string, onPrompt?: (p: string) => void) => ({ id: 'ollama:test', cloud: false, paceMs: 0, complete: async (p: string) => { onPrompt?.(p); return reply; } });
  it('refines the top matches and labels the engine honestly', async () => {
    await withCv();
    let prompt = '';
    await tick(deps([source('a', [{ title: 'Senior Software Engineer' }])], { provider: fake('{"score": 90, "explanation": "Strong fit for your payments work. Check their cloud stack."}', (p) => (prompt = p)), env: { ...env(), AI_PROVIDER: 'ollama' } }));
    const j = await one(`SELECT scored_by, explanation FROM jobs`);
    expect(j.scored_by).toBe('ollama:test');
    expect(j.explanation).toContain('payments');
    expect(prompt).toContain('untrusted data');
  });
  it('treats blank settings, as GitHub passes them, as unset', async () => {
    await withCv();
    await tick(deps([source('a', [{ title: 'Senior Software Engineer' }])], {
      provider: fake('{"score": 90, "explanation": "A good fit for your payments work overall."}'),
      env: { ...env(), AI_PROVIDER: 'ollama', AI_MAX_JOBS_PER_RUN: '', AI_TIME_BUDGET_SECONDS: '', EMAIL_FROM: '' },
    }));
    expect(await one(`SELECT scored_by FROM jobs`)).toEqual({ scored_by: 'ollama:test' });
    expect(inbox).toHaveLength(1);
  });
  it('falls back to the built-in score when the model returns nonsense', async () => {
    await withCv();
    await tick(deps([source('a', [{ title: 'Senior Software Engineer' }])], { provider: fake('I am not JSON'), env: { ...env(), AI_PROVIDER: 'ollama' } }));
    expect(await one(`SELECT scored_by FROM jobs`)).toEqual({ scored_by: 'rules' });
    expect(await one(`SELECT status FROM search_runs`)).toMatchObject({ status: 'completed' });
  });
  it('redacts contact details before anything reaches a cloud model', async () => {
    const { profileBrief } = await import('@/lib/ai/provider');
    const { redactPii } = await import('@/lib/text');
    const { profile, cvText } = await import('./helpers');
    const out = redactPii(cvText, 'Nimali Perera');
    expect(out).not.toMatch(/nimali|perera|\+94|example\.com/i);
    expect(profileBrief(profile(), true)).not.toMatch(/Nimali/);
  });
});
