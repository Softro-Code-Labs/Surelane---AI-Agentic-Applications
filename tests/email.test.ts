import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { one, q } from '@/lib/db';
import { lastEmailProblem, sendTestEmail } from '@/lib/notify/email';
import { tick } from '@/worker/tick';
import { ACCOUNT_EMAIL, API_KEY, fakeResend, RESEND_URL } from './fake-resend';
import { resetDb, source, withCv } from './helpers';

const at8 = () => new Date('2026-11-04T02:31:00Z'); // 08:01 Colombo
const at1230 = () => new Date('2026-11-04T07:01:00Z'); // 12:31 Colombo
const env = { RESEND_API_KEY: API_KEY, APP_URL: 'https://app.example' };
const engineer = () => [source('a', [{ title: 'Senior Software Engineer' }])];
const deps = (over = {}) => ({ sources: engineer(), provider: null, env, now: at8, sleep: async () => {}, log: () => {}, fetch: (async () => new Response('', { status: 404 })) as typeof fetch, ...over });

let resend: ReturnType<typeof fakeResend>;
const use = (fake: ReturnType<typeof fakeResend>) => { resend = fake; vi.stubGlobal('fetch', fake.handler); };
const logged = () => q<{ status: string; kind: string; error: string | null }>(`SELECT status, kind, error FROM notifications ORDER BY id`);
const unsent = async () => (await one<{ n: string }>(`SELECT count(*) n FROM jobs WHERE notified_at IS NULL`))!.n;

beforeEach(async () => {
  use(fakeResend());
  await resetDb();
  await q(`UPDATE settings SET email_recipient=$1`, [ACCOUNT_EMAIL]);
  await withCv();
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('the request sent to Resend', () => {
  it('follows the published API', async () => {
    await tick(deps());
    expect(resend.calls).toHaveLength(1);
    const call = resend.calls[0]!;
    expect(call.url).toBe(RESEND_URL);
    expect(call.method).toBe('POST');
    expect(call.headers.get('authorization')).toBe(`Bearer ${API_KEY}`);
    expect(call.headers.get('content-type')).toBe('application/json');
    expect(call.headers.get('user-agent')).toBe('Surelane/1.0');
    expect(call.headers.get('idempotency-key')).toBeTruthy();
    const body = JSON.parse(call.body);
    expect(Object.keys(body).sort()).toEqual(['from', 'html', 'subject', 'text', 'to']);
    expect(body).toMatchObject({ from: 'Surelane <onboarding@resend.dev>', to: ACCOUNT_EMAIL, subject: '1 new job match, 1 strong' });
    expect(body.html).toContain('Senior Software Engineer');
    expect(body.text).toContain('Senior Software Engineer');
    expect(await logged()).toEqual([{ status: 'sent', kind: 'matches', error: null }]);
    expect(await unsent()).toBe('0');
  });

  it('uses your own domain once it is set, and can then reach any address', async () => {
    use(fakeResend(['surelane.example']));
    await q(`UPDATE settings SET email_recipient='anyone@elsewhere.example'`);
    await tick(deps({ env: { ...env, EMAIL_FROM: 'Surelane <alerts@surelane.example>' } }));
    expect(resend.inbox[0]).toMatchObject({ from: 'Surelane <alerts@surelane.example>', to: 'anyone@elsewhere.example' });
  });

  it('treats a blank sender, as GitHub passes it, as unset', async () => {
    await tick(deps({ env: { ...env, EMAIL_FROM: '   ' } }));
    expect(resend.inbox[0]!.from).toBe('Surelane <onboarding@resend.dev>');
  });
});

describe('when Resend refuses', () => {
  it('explains the test sender rule, and does not retry', async () => {
    await q(`UPDATE settings SET email_recipient='someone-else@example.com'`);
    await tick(deps());
    expect(resend.calls).toHaveLength(1);
    expect(resend.inbox).toHaveLength(0);
    expect((await logged())[0]!.error).toContain('Send alerts to');
    expect(await lastEmailProblem()).toContain('Send alerts to');
    expect(await unsent()).toBe('1');
  });

  it('explains a rejected key, and does not retry', async () => {
    await tick(deps({ env: { ...env, RESEND_API_KEY: 're_wrong_key' } }));
    expect(resend.calls).toHaveLength(1);
    expect((await logged())[0]!.error).toContain('RESEND_API_KEY');
  });

  it('explains an unverified domain, and does not retry', async () => {
    await tick(deps({ env: { ...env, EMAIL_FROM: 'Me <me@gmail.com>' } }));
    expect(resend.calls).toHaveLength(1);
    expect((await logged())[0]!.error).toContain('EMAIL_FROM');
  });

  it('explains the daily limit, gives the reset time, and does not retry', async () => {
    resend.queue.push('daily_quota');
    await tick(deps());
    expect(resend.calls).toHaveLength(1);
    expect((await logged())[0]!.error).toContain('5:30 AM');
    expect(await unsent()).toBe('1');
  });

  it('explains the monthly limit', async () => {
    resend.queue.push('monthly_quota');
    await tick(deps());
    expect((await logged())[0]!.error).toContain('monthly');
  });

  it('never stores the API key', async () => {
    await tick(deps({ env: { ...env, RESEND_API_KEY: 're_secret_value_123' } }));
    resend.queue.push('server_error', 'server_error');
    await tick(deps({ now: at1230 }));
    expect(JSON.stringify(await q(`SELECT * FROM notifications`))).not.toContain('re_secret_value_123');
    expect(JSON.stringify(await q(`SELECT * FROM notifications`))).not.toContain(API_KEY);
  });
});

describe('when something temporary goes wrong', () => {
  it.each(['server_error', 'rate_limited', 'unreachable'] as const)('retries once after %s, with the same key, and sends one email', async (problem) => {
    resend.queue.push(problem);
    await tick(deps());
    expect(resend.calls).toHaveLength(2);
    expect(resend.calls[0]!.headers.get('idempotency-key')).toBe(resend.calls[1]!.headers.get('idempotency-key'));
    expect(resend.inbox).toHaveLength(1);
    expect(await logged()).toEqual([{ status: 'sent', kind: 'matches', error: null }]);
    expect(await unsent()).toBe('0');
  });

  it('does not send twice if the connection drops after Resend accepted the email', async () => {
    resend.queue.push('dropped_after_sending');
    await tick(deps());
    expect(resend.calls).toHaveLength(2);
    expect(resend.inbox).toHaveLength(1);
    expect((await logged())[0]!.status).toBe('sent');
  });

  it('keeps the jobs for the next search if Resend stays down', async () => {
    resend.queue.push('server_error', 'server_error');
    await tick(deps());
    expect(resend.calls).toHaveLength(2);
    expect(resend.inbox).toHaveLength(0);
    expect((await logged())[0]!.error).toContain('busy or unavailable');
    expect(await unsent()).toBe('1');

    await tick(deps({ now: at1230 }));
    expect(resend.inbox).toHaveLength(1);
    expect(resend.inbox[0]!.body).toContain('Senior Software Engineer');
    expect(await unsent()).toBe('0');
  });

  it('reports when Resend cannot be reached at all', async () => {
    resend.queue.push('unreachable', 'unreachable');
    await tick(deps());
    expect((await logged())[0]!.error).toContain('could not reach Resend');
  });

  it('sends nothing if the agent is switched off between attempts', async () => {
    resend.queue.push('server_error');
    vi.stubGlobal('fetch', (async (url: string, init: RequestInit) => {
      const reply = await resend.handler(url, init);
      await q(`UPDATE settings SET agent_enabled=false`);
      return reply;
    }) as typeof fetch);
    await tick(deps());
    expect(resend.calls).toHaveLength(1);
    expect(resend.inbox).toHaveLength(0);
    expect(await unsent()).toBe('1');
  });
});

describe('when email is not set up', () => {
  const noKey = { APP_URL: env.APP_URL };

  it('reports a missing key instead of silently sending nothing', async () => {
    await tick(deps({ env: noKey }));
    expect(resend.calls).toHaveLength(0);
    expect((await logged())[0]).toMatchObject({ status: 'failed', kind: 'matches' });
    expect(await lastEmailProblem()).toContain('GitHub secrets');
    expect(await unsent()).toBe('1');
  });

  it('says nothing when there was no email to send', async () => {
    await q(`UPDATE settings SET email_no_results='silent'`);
    await tick(deps({ env: noKey, sources: [source('a', [])] }));
    expect(await logged()).toEqual([]);
  });

  it('says nothing when email is turned off or has no recipient', async () => {
    await q(`UPDATE settings SET email_enabled=false`);
    await tick(deps({ env: noKey }));
    await q(`UPDATE settings SET email_enabled=true, email_recipient=NULL`);
    await tick(deps({ env: noKey, now: at1230 }));
    expect(await logged()).toEqual([]);
    expect(resend.calls).toHaveLength(0);
  });
});

describe('the test email', () => {
  it('sends every time you press it, so a second press still proves it works', async () => {
    await sendTestEmail(ACCOUNT_EMAIL, env);
    await sendTestEmail(ACCOUNT_EMAIL, env);
    expect(resend.inbox).toHaveLength(2);
    expect(resend.calls[0]!.headers.get('idempotency-key')).toBeNull();
    expect((await logged()).map((n) => n.kind)).toEqual(['test', 'test']);
  });

  it('logs the plain reason and passes it on', async () => {
    await expect(sendTestEmail('someone-else@example.com', env)).rejects.toThrow('Send alerts to');
    expect((await logged())[0]).toMatchObject({ status: 'failed', kind: 'test' });
    expect((await logged())[0]!.error).not.toMatch(/^Error:/);
  });
});

describe('the email problem shown in the app', () => {
  it('starts empty', async () => {
    expect(await lastEmailProblem()).toBeNull();
  });

  it('clears once an email goes out again', async () => {
    await expect(sendTestEmail('someone-else@example.com', env)).rejects.toThrow();
    expect(await lastEmailProblem()).not.toBeNull();
    await sendTestEmail(ACCOUNT_EMAIL, env);
    expect(await lastEmailProblem()).toBeNull();
  });
});
