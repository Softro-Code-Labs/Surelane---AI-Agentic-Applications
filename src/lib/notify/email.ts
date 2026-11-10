import { randomUUID } from 'node:crypto';
import { q, one } from '../db';
import { formatColombo } from '../schedule';
import { getSettings, isLocalMarket, recommendableAt, searchesOff, type Scope } from '../settings';
import { escapeHtml as e, truncate } from '../text';

type Env = Record<string, string | undefined>;
type Opts = { env?: Env; now?: () => Date };

type Mail = { subject: string; html: string; text: string };

const RESEND_URL = 'https://api.resend.com/emails';
// Resend's shared test sender. It only reaches the address on your Resend account,
// which suits one person. Set EMAIL_FROM once you have verified a domain.
const TEST_SENDER = 'Surelane <onboarding@resend.dev>';

export function emailConfigured(env: Env = process.env) {
  return Boolean(env.RESEND_API_KEY);
}

/** `retry` says whether trying again could help. A wrong key stays wrong. */
class EmailError extends Error {
  constructor(message: string, readonly retry = false) { super(message); }
}

/** Turns Resend's replies into what happened and what to do about it. */
function explain(status: number, name = '', message = '') {
  if (/own email address/i.test(message)) return new EmailError("Resend's test sender can only reach the email on your Resend account. Use that address in Send alerts to, or verify a domain in Resend.");
  if (/not verified/i.test(message)) return new EmailError('The domain in EMAIL_FROM is not verified. Verify it in Resend, or leave EMAIL_FROM empty to use the test sender.');
  if (status === 401 || /api.?key/i.test(`${name} ${message}`)) return new EmailError('Resend did not accept the API key. Check RESEND_API_KEY in Vercel and in GitHub.');
  if (name === 'daily_quota_exceeded') return new EmailError("You have reached Resend's daily email limit. It resets at 5:30 AM Sri Lanka time.");
  if (name === 'monthly_quota_exceeded') return new EmailError("You have reached Resend's monthly email limit.");
  if (status === 429 || status >= 500 || name === 'concurrent_idempotent_requests') return new EmailError('Resend is busy or unavailable right now. Try again shortly.', true);
  return new EmailError(`Resend refused this email: ${message || `error ${status}`}`);
}

/** Pass the same `onceOnly` key on a retry, and Resend won't send that email twice. */
async function send(env: Env, to: string, mail: Mail, onceOnly?: string) {
  const res = await fetch(RESEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'User-Agent': 'Surelane/1.0',
      ...(onceOnly ? { 'Idempotency-Key': onceOnly } : {}),
    },
    body: JSON.stringify({ from: env.EMAIL_FROM?.trim() || TEST_SENDER, to, ...mail }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => { throw new EmailError('Surelane could not reach Resend. Try again shortly.', true); });
  if (res.ok) return;
  const body = (await res.json().catch(() => ({}))) as { name?: string; message?: string };
  throw explain(res.status, body.name, body.message);
}

const reason = (err: unknown) => (err instanceof Error ? err.message : String(err));

export type EmailJob = {
  id: string; title: string; company: string; location: string; country: string | null; market: string; work_mode: string;
  salary: string | null; employment_type: string | null; posted_at: Date | null; deadline: Date | null; score: number; tier: string;
  explanation: string | null; matching_skills: string[]; missing_skills: string[]; mandatory_missing: string[]; url: string; source_label: string;
};

// Obsidian Iris, as in the app. Email clients ignore stylesheets, so the values are written out.
const INK = '#0e0c1c', MUTED = '#55516b', PETROL = '#0e0c1c', ROAD = '#4f3bd6', LINE = '#e3e0ee';
const TIER: Record<string, string> = { Strong: '#047857', Good: '#4f3bd6', Potential: '#55516b' };
const MODE: Record<string, string> = { remote: 'Remote', hybrid: 'Hybrid', onsite: 'On-site', unknown: 'Work mode not stated' };

function jobBlock(j: EmailJob, appUrl?: string) {
  const facts = [j.salary, j.employment_type, MODE[j.work_mode]].filter(Boolean).map((x) => e(x)).join(' &nbsp;|&nbsp; ');
  const dates = [j.posted_at ? `Posted ${formatColombo(j.posted_at, 'date')}` : null, j.deadline ? `Apply by ${formatColombo(j.deadline, 'date')}` : null].filter(Boolean).join(' &nbsp;|&nbsp; ');
  return `<tr><td style="padding:18px 0;border-top:1px solid ${LINE}">
    <div style="font-size:13px;font-weight:700;color:${TIER[j.tier] ?? INK}">${j.score}% ${e(j.tier)} match</div>
    <div style="font-size:18px;font-weight:700;color:${INK};margin:4px 0 2px">${e(j.title)}</div>
    <div style="font-size:14px;color:${INK}">${e(j.company)}, ${e(j.location || j.country || '')}</div>
    ${facts ? `<div style="font-size:13px;color:${MUTED};margin-top:4px">${facts}</div>` : ''}
    ${dates ? `<div style="font-size:13px;color:${MUTED};margin-top:2px">${dates}</div>` : ''}
    ${j.explanation ? `<p style="font-size:14px;line-height:1.5;color:${INK};margin:10px 0 6px">${e(truncate(j.explanation, 320))}</p>` : ''}
    ${j.matching_skills.length ? `<div style="font-size:13px;color:${INK};margin:3px 0"><b>You match:</b> ${e(j.matching_skills.slice(0, 8).join(', '))}</div>` : ''}
    ${j.missing_skills.length ? `<div style="font-size:13px;color:${INK};margin:3px 0"><b>Missing:</b> ${e(j.missing_skills.slice(0, 6).join(', '))}</div>` : ''}
    ${j.mandatory_missing.length ? `<div style="font-size:13px;color:#b91c1c;margin:3px 0"><b>Required, not on your CV:</b> ${e(j.mandatory_missing.join(', '))}</div>` : ''}
    <div style="margin-top:12px"><a href="${e(j.url)}" style="display:inline-block;background:${PETROL};color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:9px 16px;border-radius:6px">View and apply</a>
    ${appUrl ? `<a href="${e(`${appUrl}/jobs/${j.id}`)}" style="font-size:13px;color:${ROAD};margin-left:12px">See match details</a>` : ''}</div>
    <div style="font-size:12px;color:${MUTED};margin-top:8px">Listed on ${e(j.source_label)}</div>
  </td></tr>`;
}

function shell(title: string, body: string, appUrl?: string) {
  const logo = appUrl ? `<img src="${e(appUrl)}/icon-192.png" width="28" height="28" alt="" style="vertical-align:middle;border:0;margin-right:8px;border-radius:6px">` : '';
  return `<!doctype html><html><body style="margin:0;background:#f7f6fb;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:10px;overflow:hidden">
  <tr><td style="background:${PETROL};padding:14px 24px;color:#fff;font-size:18px;font-weight:600;letter-spacing:-0.01em">${logo}Surelane</td></tr>
  <tr><td style="padding:24px">
  <div style="font-size:21px;font-weight:700;color:${INK};line-height:1.3">${e(title)}</div>
  ${body}
  <p style="font-size:13px;line-height:1.5;color:${INK};background:#efecff;border-radius:6px;padding:10px 12px;margin:20px 0 0">Surelane checks that a listing is live, not that an employer is honest. Never pay a fee to apply.</p>
  <p style="font-size:12px;color:${MUTED};margin:14px 0 0">Sent by Surelane. ${appUrl ? `<a href="${e(appUrl)}/settings" style="color:${ROAD}">Change email settings</a>` : 'Change this in Search settings.'}</p>
  </td></tr></table></td></tr></table></body></html>`;
}

export const SECTION_TITLE = { local: 'Local Job Opportunities (Sri Lanka)', global: 'Global Job Opportunities (International)' } as const;

/** Local and global jobs are never mixed: each switched-on scope gets its own labelled section. */
export function emailSections(jobs: EmailJob[], scope: Scope) {
  return [
    ...(scope.local_enabled ? [{ key: 'local' as const, title: SECTION_TITLE.local, jobs: jobs.filter((j) => isLocalMarket(j.market)) }] : []),
    ...(scope.global_enabled ? [{ key: 'global' as const, title: SECTION_TITLE.global, jobs: jobs.filter((j) => !isLocalMarket(j.market)) }] : []),
  ];
}

export function matchesEmail(jobs: EmailJob[], appUrl?: string, scope: Scope = { local_enabled: true, global_enabled: false }) {
  const sections = emailSections(jobs, scope);
  const shown = sections.flatMap((x) => x.jobs);
  const strong = shown.filter((j) => j.tier === 'Strong').length;
  const split = sections.length > 1 ? ` (${sections.map((x) => `${x.jobs.length} ${x.key}`).join(', ')})` : '';
  const subject = `${shown.length} new job match${shown.length === 1 ? '' : 'es'}${split}${strong ? `, ${strong} strong` : ''}`;
  const html = shell(subject, sections.map((x) => `
    <div style="font-size:17px;font-weight:700;color:${PETROL};margin:24px 0 2px">${e(x.title)}</div>
    <div style="font-size:13px;color:${MUTED}">${x.jobs.length ? `${x.jobs.length} new match${x.jobs.length === 1 ? '' : 'es'}` : `No new ${x.key} matches this time.`}</div>
    ${x.jobs.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px">${x.jobs.map((j) => jobBlock(j, appUrl)).join('')}</table>` : ''}`).join(''), appUrl);
  const text = sections.map((x) => `${x.title.toUpperCase()}\n${x.jobs.length
    ? x.jobs.map((j) => `${j.score}% ${j.tier}: ${j.title} at ${j.company} (${j.location})\n${j.url}`).join('\n\n')
    : `No new ${x.key} matches this time.`}`).join('\n\n\n');
  return { subject, html, text };
}

export function noResultsEmail(sources: { label: string; status: string }[], appUrl?: string) {
  const ok = sources.filter((s) => s.status === 'success').map((s) => s.label);
  const bad = sources.filter((s) => s.status === 'failed').map((s) => s.label);
  const body = `<p style="font-size:14px;line-height:1.5;color:${INK}">No new jobs matched your CV this time.</p>
    <p style="font-size:14px;line-height:1.5;color:${INK}">Checked: ${e(ok.join(', ') || 'none')}.${bad.length ? ` Could not reach: ${e(bad.join(', '))}.` : ''}</p>`;
  return { subject: 'No new job matches this time', html: shell('No new matches', body, appUrl), text: `No new matches. Checked: ${ok.join(', ')}.` };
}

async function log(runId: string | null, kind: string, recipient: string, subject: string, count: number, status: string, error: string | null, now: Date) {
  await q(`INSERT INTO notifications (run_id, kind, recipient, subject, job_count, status, error, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [runId, kind, recipient, subject, count, status, error, now]);
}

/** Why the most recent email failed, or null if it went out. A later success clears it. */
export async function lastEmailProblem() {
  const last = await one<{ status: string; error: string | null }>(`SELECT status, error FROM notifications ORDER BY created_at DESC, id DESC LIMIT 1`);
  return last?.status === 'failed' ? last.error ?? 'Resend did not accept it.' : null;
}

export async function sendTestEmail(recipient: string, env: Env = process.env) {
  const subject = 'Surelane can reach this inbox';
  const html = shell(subject, `<p style="font-size:14px;color:${INK}">Email alerts are working.</p>`);
  try {
    await send(env, recipient, { subject, html, text: subject });
    await log(null, 'test', recipient, subject, 0, 'sent', null, new Date());
  } catch (err) {
    await log(null, 'test', recipient, subject, 0, 'failed', reason(err), new Date());
    throw err;
  }
}

/** Every rule that can stop an email lives here, and is read at the moment of sending. */
export async function sendRunEmail(runId: string, { env = process.env, now = () => new Date() }: Opts = {}): Promise<'sent' | 'skipped' | 'failed'> {
  const s = await getSettings();
  if (!s.agent_enabled || !s.email_enabled || !s.email_recipient || searchesOff(s)) return 'skipped';

  // Each scope is picked separately, so a busy one cannot crowd the other out of the email.
  const pick = (market: string) => q<EmailJob>(
    `SELECT j.* FROM jobs j WHERE ${recommendableAt('$2::timestamptz')} AND ${market}
       AND j.notified_at IS NULL AND j.score >= $1 ${s.email_mode === 'strong' ? `AND j.tier = 'Strong'` : ''}
     ORDER BY j.score DESC LIMIT 25`, [s.min_score, now()]);
  const jobs = [
    ...(s.local_enabled ? await pick(`j.market = 'sri_lanka'`) : []),
    ...(s.global_enabled ? await pick(`j.market <> 'sri_lanka'`) : []),
  ];
  const appUrl = env.APP_URL?.replace(/\/$/, '');

  if (!jobs.length && s.email_no_results === 'silent') return 'skipped';

  const kind = jobs.length ? 'matches' : 'no_results';
  const mail = jobs.length ? matchesEmail(jobs, appUrl, s)
    : noResultsEmail(await q(`SELECT label, status FROM search_run_sources WHERE run_id = $1`, [runId]), appUrl);
  // Logged, not skipped: the key can be in Vercel but missing from GitHub, where this runs.
  if (!emailConfigured(env)) {
    await log(runId, kind, s.email_recipient, mail.subject, jobs.length, 'failed', 'RESEND_API_KEY is not set where searches run. Add it to your GitHub secrets.', now());
    return 'failed';
  }

  const onceOnly = randomUUID();
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const live = await one<{ agent_enabled: boolean }>('SELECT agent_enabled FROM settings WHERE id = 1');
    if (!live?.agent_enabled) return 'skipped';
    try {
      await send(env, s.email_recipient, mail, onceOnly);
      if (jobs.length) await q('UPDATE jobs SET notified_at = $2 WHERE id = ANY($1::bigint[])', [jobs.map((j) => j.id), now()]);
      await log(runId, kind, s.email_recipient, mail.subject, jobs.length, 'sent', null, now());
      return 'sent';
    } catch (err) {
      lastError = err;
      if (err instanceof EmailError && !err.retry) break;
    }
  }
  // notified_at stays empty, so these jobs go out with the next scheduled search.
  await log(runId, kind, s.email_recipient, mail.subject, jobs.length, 'failed', reason(lastError), now());
  return 'failed';
}
