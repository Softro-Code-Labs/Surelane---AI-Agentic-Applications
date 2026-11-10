import { beforeEach, describe, expect, it } from 'vitest';
import { attemptLogin, rowId } from '@/lib/auth';
import { hashPassword, verifyPassword } from '@/lib/crypto';
import { one, q } from '@/lib/db';
import { rejectReason } from '@/lib/search/classify';
import { scoreJob } from '@/lib/match/score';
import { checkPage, httpGet, isPrivateAddress } from '@/lib/sources/http';
import type { SourceContext } from '@/lib/sources/types';
import { mentions, mentionsPlace } from '@/lib/text';
import { profile, resetDb } from './helpers';

const t0 = new Date('2026-11-10T08:00:00Z');
const later = (min: number) => new Date(t0.getTime() + min * 60_000);

describe('sign-in throttling', () => {
  beforeEach(async () => {
    await resetDb();
    await q(`INSERT INTO users (id, email, name, password_hash) VALUES (1, 'me@example.com', 'Me', $1)`, [await hashPassword('correct horse battery')]);
  });

  it('signs the owner in, whatever the capitals in the email', async () => {
    expect(await attemptLogin(' Me@Example.com ', 'correct horse battery', '1.1.1.1', t0)).toBe('ok');
    expect(await one('SELECT 1 x FROM login_attempts')).toBeNull();
  });

  it('refuses a wrong password and a wrong email the same way', async () => {
    expect(await attemptLogin('me@example.com', 'nope', '1.1.1.1', t0)).toBe('bad');
    expect(await attemptLogin('other@example.com', 'correct horse battery', '1.1.1.1', t0)).toBe('bad');
  });

  it('locks one address after five wrong guesses, without locking the owner out', async () => {
    for (let i = 0; i < 5; i++) expect(await attemptLogin('me@example.com', 'guess', '6.6.6.6', t0)).toBe('bad');
    // The right password does not help the locked address...
    expect(await attemptLogin('me@example.com', 'correct horse battery', '6.6.6.6', later(1))).toBe('locked');
    // ...but the owner, somewhere else, still gets in.
    expect(await attemptLogin('me@example.com', 'correct horse battery', '1.1.1.1', later(1))).toBe('ok');
  });

  it('lets the address try again after 15 minutes', async () => {
    for (let i = 0; i < 6; i++) await attemptLogin('me@example.com', 'guess', '6.6.6.6', t0);
    expect(await attemptLogin('me@example.com', 'correct horse battery', '6.6.6.6', later(14))).toBe('locked');
    expect(await attemptLogin('me@example.com', 'correct horse battery', '6.6.6.6', later(16))).toBe('ok');
  });

  it('counts guesses made at the same moment', async () => {
    const results = await Promise.all(Array.from({ length: 12 }, () => attemptLogin('me@example.com', 'guess', '7.7.7.7', t0)));
    expect(results.filter((r) => r === 'bad').length).toBeLessThanOrEqual(5);
    expect(results).toContain('locked');
  });

  it('does not crash on a damaged password hash', async () => {
    expect(await verifyPassword('x', 'scrypt$AAAA$AAAA')).toBe(false);
  });
});

describe('links that come from outside', () => {
  const ctx = (fetchFn: typeof fetch, resolve: (h: string) => string[]): SourceContext => ({
    fetch: fetchFn, sleep: async () => {}, now: t0, keywords: [], settings: { local_enabled: true, global_enabled: true, custom_feeds: [] },
    env: {}, robotsCache: new Map(), resolveHost: async (h) => resolve(h),
  });

  it('knows private, metadata and disguised addresses', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.1.1', '172.20.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1',
      '::ffff:169.254.169.254', '::ffff:10.0.0.1', '::ffff:a9fe:a9fe', '224.0.0.1']) expect(isPrivateAddress(ip), ip).toBe(true);
    for (const ip of ['93.184.216.34', '8.8.8.8', '2606:4700::1111', '::ffff:8.8.8.8', '172.32.0.1']) expect(isPrivateAddress(ip), ip).toBe(false);
  });

  it('will not follow a job link that redirects to a private address', async () => {
    const opened: string[] = [];
    const f = (async (url: string) => {
      opened.push(url);
      if (url.endsWith('/robots.txt')) return new Response('', { status: 404 });
      return new Response('', { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } });
    }) as typeof fetch;
    const c = ctx(f, (h) => (h === '169.254.169.254' ? ['169.254.169.254'] : ['93.184.216.34']));
    expect(await checkPage(c, 'https://jobs.example/vacancy/1')).toBe('unknown');
    expect(opened.some((u) => u.includes('169.254'))).toBe(false);
  });

  it('refuses a feed that resolves to a private address, without retrying', async () => {
    let calls = 0;
    const c = ctx((async () => { calls++; return new Response('ok'); }) as typeof fetch, () => ['10.0.0.5']);
    await expect(httpGet(c, 'https://intranet.example/feed', { untrusted: true })).rejects.toThrow(/Private network/);
    expect(calls).toBe(0);
  });

  it('still follows ordinary redirects between public sites', async () => {
    const f = (async (url: string) => (url.includes('old') ? new Response('', { status: 301, headers: { location: 'https://new.example/feed' } }) : new Response('moved fine'))) as typeof fetch;
    const res = await httpGet(ctx(f, () => ['93.184.216.34']), 'https://old.example/feed', { untrusted: true });
    expect(await res.text()).toBe('moved fine');
  });
});

describe('preferences match whole words', () => {
  it('does not find "US" inside "Australia", and knows the usual spellings', () => {
    expect(mentions('Sydney, Australia', 'us')).toBe(false);
    expect(mentions('Looking for a C# and .NET developer', 'c#')).toBe(true);
    expect(mentions('We work with partners', 'IT')).toBe(false);
    expect(mentionsPlace('Remote, United States', 'USA')).toBe(true);
    expect(mentionsPlace('London, United Kingdom', 'uk')).toBe(true);
    expect(mentionsPlace('Austin, TX, US', 'usa')).toBe(true);
    expect(mentionsPlace('Singapore', 'Singapore')).toBe(true);
  });

  it('keeps a job in Australia out when only the US is preferred', () => {
    const job = { source: 'x', sourceLabel: 'x', url: 'https://e.example/1', title: 'Engineer', company: 'Acme', location: 'Sydney, Australia', description: 'A role.' };
    const s = { local_enabled: true, global_enabled: true, max_post_age_days: 30, remote_pref: 'any', preferred_countries: ['US'] };
    expect(rejectReason(job, 'international', 'onsite', 'unknown', s, t0)?.kind).toBe('preference');
    expect(rejectReason({ ...job, location: 'Austin, United States' }, 'international', 'onsite', 'unknown', { ...s, preferred_countries: ['USA'] }, t0)).toBeNull();
  });

  it('does not give every job the category bonus for a short category', () => {
    const job = { title: 'Software Engineer', description: 'Requirements\\n• 9+ years with Rust, Go, Kubernetes and Kafka\\n• Work with partners on position papers' };
    const plain = scoreJob(job, profile(), {}).score;
    expect(plain).toBeLessThan(90);
    expect(scoreJob(job, profile(), { categories: ['IT'] }).score).toBe(plain);
    expect(scoreJob({ ...job, category: 'IT' }, profile(), { categories: ['IT'] }).score).toBeGreaterThan(plain);
  });
});

describe('ids taken from links', () => {
  it('accepts database ids only', () => {
    expect(rowId('42')).toBe('42');
    for (const bad of ['', 'abc', '1; DROP TABLE jobs', '-1', '0', '1.5', '99999999999999999999', undefined]) expect(rowId(bad)).toBeNull();
  });
});
