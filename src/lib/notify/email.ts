import nodemailer from 'nodemailer';
import { q, one } from '../db';
import { formatColombo } from '../schedule';
import { RECOMMENDABLE, getSettings, scopeSql } from '../settings';
import { escapeHtml as e, truncate } from '../text';

type Env = Record<string, string | undefined>;
type Opts = { env?: Env; now?: () => Date };

export function smtpConfigured(env: Env = process.env) {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}

function transport(env: Env) {
  const port = Number(env.SMTP_PORT || 465);
  return nodemailer.createTransport({
    host: env.SMTP_HOST, port, secure: port === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    ...(env.SMTP_INSECURE_LOCAL === '1' ? { tls: { rejectUnauthorized: false }, ignoreTLS: true, secure: false } : {}),
  } as any);
}

export type EmailJob = {
  id: string; title: string; company: string; location: string; country: string | null; market: string; work_mode: string;
  salary: string | null; employment_type: string | null; posted_at: Date | null; deadline: Date | null; score: number; tier: string;
  explanation: string | null; matching_skills: string[]; missing_skills: string[]; mandatory_missing: string[]; url: string; source_label: string;
};

const INK = '#0f2a38', MUTED = '#46606c', PETROL = '#0f3f56', ROAD = '#14697a', LINE = '#d3dee2';
const TIER: Record<string, string> = { Strong: '#0a6e55', Good: '#14697a', Potential: '#46606c' };
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
    ${j.mandatory_missing.length ? `<div style="font-size:13px;color:#a12d22;margin:3px 0"><b>Required, not on your CV:</b> ${e(j.mandatory_missing.join(', '))}</div>` : ''}
    <div style="margin-top:12px"><a href="${e(j.url)}" style="display:inline-block;background:${PETROL};color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:9px 16px;border-radius:6px">View and apply</a>
    ${appUrl ? `<a href="${e(`${appUrl}/jobs/${j.id}`)}" style="font-size:13px;color:${ROAD};margin-left:12px">See match details</a>` : ''}</div>
    <div style="font-size:12px;color:${MUTED};margin-top:8px">Listed on ${e(j.source_label)}</div>
  </td></tr>`;
}

function shell(title: string, body: string, appUrl?: string) {
  const logo = appUrl ? `<img src="${e(appUrl)}/icon-192.png" width="28" height="28" alt="" style="vertical-align:middle;border:0;margin-right:8px;border-radius:6px">` : '';
  return `<!doctype html><html><body style="margin:0;background:#f3f6f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:10px;overflow:hidden">
  <tr><td style="background:${PETROL};padding:14px 24px;color:#fff;font-size:18px;font-weight:700">${logo}surelane</td></tr>
  <tr><td style="padding:24px">
  <div style="font-size:21px;font-weight:700;color:${INK};line-height:1.3">${e(title)}</div>
  ${body}
  <p style="font-size:13px;line-height:1.5;color:${INK};background:#ddf3ec;border-radius:6px;padding:10px 12px;margin:20px 0 0">Surelane checks that a listing is live, not that an employer is honest. Never pay a fee to apply.</p>
  <p style="font-size:12px;color:${MUTED};margin:14px 0 0">Sent by Surelane. ${appUrl ? `<a href="${e(appUrl)}/settings" style="color:${ROAD}">Change email settings</a>` : 'Change this in Search settings.'}</p>
  </td></tr></table></td></tr></table></body></html>`;
}

export function matchesEmail(jobs: EmailJob[], appUrl?: string) {
  const strong = jobs.filter((j) => j.tier === 'Strong').length;
  const subject = `${jobs.length} new job match${jobs.length === 1 ? '' : 'es'}${strong ? `, ${strong} strong` : ''}`;
  const html = shell(subject, `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px">${jobs.map((j) => jobBlock(j, appUrl)).join('')}</table>`, appUrl);
  const text = jobs.map((j) => `${j.score}% ${j.tier}: ${j.title} at ${j.company} (${j.location})\n${j.url}`).join('\n\n');
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

export async function sendTestEmail(recipient: string, env: Env = process.env) {
  const subject = 'Surelane can reach this inbox';
  const html = shell(subject, `<p style="font-size:14px;color:${INK}">Email alerts are working.</p>`);
  try {
    await transport(env).sendMail({ from: env.SMTP_FROM || env.SMTP_USER, to: recipient, subject, html, text: subject });
    await log(null, 'test', recipient, subject, 0, 'sent', null, new Date());
  } catch (err) {
    await log(null, 'test', recipient, subject, 0, 'failed', String(err), new Date());
    throw err;
  }
}

/** Every rule that can stop an email lives here, and is read at the moment of sending. */
export async function sendRunEmail(runId: string, { env = process.env, now = () => new Date() }: Opts = {}): Promise<'sent' | 'skipped' | 'failed'> {
  const s = await getSettings();
  if (!s.agent_enabled || !s.email_enabled || !s.email_recipient || !smtpConfigured(env)) return 'skipped';

  const jobs = await q<EmailJob>(
    `SELECT j.* FROM jobs j WHERE ${RECOMMENDABLE} ${scopeSql(s)}
       AND j.notified_at IS NULL AND j.score >= $1 ${s.email_mode === 'strong' ? `AND j.tier = 'Strong'` : ''}
     ORDER BY j.score DESC LIMIT 25`, [s.min_score]);
  const appUrl = env.APP_URL?.replace(/\/$/, '');

  if (!jobs.length) {
    if (s.email_no_results === 'silent') return 'skipped';
    const sources = await q(`SELECT label, status FROM search_run_sources WHERE run_id = $1`, [runId]);
    const mail = noResultsEmail(sources, appUrl);
    try {
      await transport(env).sendMail({ from: env.SMTP_FROM || env.SMTP_USER, to: s.email_recipient, ...mail });
      await log(runId, 'no_results', s.email_recipient, mail.subject, 0, 'sent', null, now());
      return 'sent';
    } catch (err) {
      await log(runId, 'no_results', s.email_recipient, mail.subject, 0, 'failed', String(err), now());
      return 'failed';
    }
  }

  const mail = matchesEmail(jobs, appUrl);
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const live = await one<{ agent_enabled: boolean }>('SELECT agent_enabled FROM settings WHERE id = 1');
    if (!live?.agent_enabled) return 'skipped';
    try {
      await transport(env).sendMail({ from: env.SMTP_FROM || env.SMTP_USER, to: s.email_recipient, ...mail });
      await q('UPDATE jobs SET notified_at = $2 WHERE id = ANY($1::bigint[])', [jobs.map((j) => j.id), now()]);
      await log(runId, 'matches', s.email_recipient, mail.subject, jobs.length, 'sent', null, now());
      return 'sent';
    } catch (err) {
      lastError = err;
    }
  }
  // notified_at stays empty, so these jobs go out with the next scheduled search.
  await log(runId, 'matches', s.email_recipient, mail.subject, jobs.length, 'failed', String(lastError), now());
  return 'failed';
}
