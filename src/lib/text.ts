import * as cheerio from 'cheerio';
import { sha256 } from './crypto';

export function htmlToText(html: string | null | undefined): string {
  if (!html) return '';
  // Some APIs double-escape their HTML.
  const unescaped = /&lt;\/?[a-z]/i.test(html) ? cheerio.load(`<x>${html}</x>`).text() : html;
  const $ = cheerio.load(unescaped.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6]|ul|ol|tr)>/gi, '\n'));
  $('script,style,noscript,iframe').remove();
  $('li').each((_, el) => { $(el).prepend('• '); });
  return $.root().text().replace(/[ \t ]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Accepts http(s) only, so a hostile feed cannot plant a javascript: link. */
export function safeUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    u.hash = '';
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|ref$|source$)/i.test(k)) u.searchParams.delete(k);
    }
    return u.toString();
  } catch {
    return null;
  }
}

function norm(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9+#]+/g, ' ').trim();
}

const COMPANY_SUFFIX = /\b(pvt|private|ltd|limited|plc|inc|llc|gmbh|corp|corporation|company|co|lanka)\b/g;
const TITLE_NOISE = /\b(job ref\s*\S+|urgent|hiring|vacancy|immediate|new)\b/g;

function cityOf(location: string, workMode: string): string {
  if (workMode === 'remote') return 'remote';
  const first = norm(location.split(/[,/|-]/)[0] ?? '').replace(/\bsri lanka\b/, '').trim();
  return first || 'sri lanka';
}

/** Same role, same employer, same city = same vacancy, whichever site listed it. */
export function jobFingerprint(j: { title: string; company: string; location: string; workMode: string }): string {
  const title = norm(j.title).replace(TITLE_NOISE, ' ').replace(/\s+/g, ' ').trim();
  const company = norm(j.company).replace(COMPANY_SUFFIX, ' ').replace(/\s+/g, ' ').trim();
  return sha256(`${title}|${company}|${cityOf(j.location, j.workMode)}`);
}

export function parseDate(v: unknown): Date | null {
  if (v === null || v === undefined || v === '') return null;
  let d: Date;
  if (typeof v === 'number' || /^\d{9,13}$/.test(String(v))) {
    const n = Number(v);
    d = new Date(n < 1e11 ? n * 1000 : n); // seconds or milliseconds
  } else {
    d = new Date(String(v));
  }
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * A deadline with no time means the whole of that day, in Sri Lanka time.
 * Parsing it as midnight would hide a job during its final day.
 */
export function parseDeadline(v: unknown): Date | null {
  const s = String(v ?? '').trim();
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})(?:T00:00(?::00)?)?$/);
  if (iso) return new Date(`${iso[1]}T23:59:59+05:30`);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)) return new Date(`${s}+05:30`);
  const d = parseDate(s);
  if (!d || /\d:\d/.test(s)) return d;
  const pad = (n: number) => String(n).padStart(2, '0');
  return new Date(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T23:59:59+05:30`);
}

export function escapeHtml(s: string | null | undefined): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`;
}

/** Removes contact details before text leaves for a cloud AI service. */
export function redactPii(text: string, name?: string | null): string {
  let out = text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/(\+?\d[\d\s().-]{7,}\d)/g, '[phone]')
    .replace(/https?:\/\/\S+/g, '[link]')
    .replace(/\b(?:linkedin\.com|github\.com)\/\S+/gi, '[link]');
  if (name) {
    for (const part of name.split(/\s+/).filter((p) => p.length > 2)) {
      out = out.replace(new RegExp(`\\b${part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), '[name]');
    }
  }
  return out;
}
