import { lookup } from 'node:dns/promises';
import robotsParser from 'robots-parser';
import { SourceError, type SourceContext, type VerifyState } from './types';

export const USER_AGENT = 'Surelane/1.0 (single-user job alerts)';

const CLOSED_TEXT = /(applications? (?:are |is |have |has )?(?:now )?closed|no longer (?:accepting|available|open|active)|position (?:has been |is )?(?:filled|closed)|vacancy (?:has |is )?(?:been )?(?:closed|filled|expired)|this job (?:has |is )?(?:been )?(?:closed|expired|removed)|job (?:post|posting|listing)? ?(?:has )?expired|(?:this )?listing has expired|expired on \d|closing date has passed)/i;

export function looksClosed(text: string): boolean {
  return CLOSED_TEXT.test(text);
}

// ── Safety: some links come from outside (typed in, or listed in a feed) ────
const PRIVATE_V4 = /^(0\.|10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|192\.0\.0\.|198\.1[89]\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|(22[4-9]|2[3-5]\d)\.)/;

/** True for loopback, private, link-local (cloud metadata), carrier NAT, multicast and reserved addresses. */
export function isPrivateAddress(ip: string): boolean {
  const a = ip.trim().toLowerCase();
  const mapped = a.match(/^::ffff:(.+)$/);
  // An IPv4 address written inside IPv6. The hex spelling is refused rather than decoded.
  if (mapped) return mapped[1]!.includes('.') ? PRIVATE_V4.test(mapped[1]!) : true;
  if (a.includes(':')) return a === '::1' || a === '::' || /^(f[cd]|fe[89ab]|ff)/.test(a) || a.startsWith('64:ff9b:');
  return PRIVATE_V4.test(a);
}

/** The link points at a private address. Never retried. */
export class BlockedAddress extends SourceError {}

export async function assertPublic(url: string, ctx: Pick<SourceContext, 'resolveHost'>) {
  const u = new URL(url);
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new BlockedAddress('Only web links can be read.');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new BlockedAddress('Private network addresses cannot be read.');
  const resolve = ctx.resolveHost ?? (async (h: string) => (await lookup(h, { all: true })).map((a) => a.address));
  const ips = await resolve(host).catch(() => { throw new SourceError(`The website ${host} could not be found.`); });
  if (!ips.length || ips.some(isPrivateAddress)) throw new BlockedAddress('Private network addresses cannot be read.');
}

/** Follows redirects by hand, so each hop is checked before it is opened. */
async function publicFetch(ctx: SourceContext, start: string, init: RequestInit): Promise<Response> {
  let url = start;
  for (let hop = 0; hop < 5; hop++) {
    await assertPublic(url, ctx);
    const res = await ctx.fetch(url, { ...init, redirect: 'manual' });
    const next = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;
    if (!next) return res;
    url = new URL(next, url).toString();
  }
  throw new SourceError(`${new URL(start).host}: this link redirects too many times`);
}

/**
 * `untrusted` is for links that came from outside: your own feeds, and job
 * links listed by a feed. Those may only reach public addresses, redirects included.
 */
export async function httpGet(ctx: SourceContext, url: string, init: RequestInit & { retries?: number; timeoutMs?: number; untrusted?: boolean } = {}): Promise<Response> {
  const { retries = 2, timeoutMs = 20_000, untrusted = false, ...rest } = init;
  let last = 'request failed';
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt) await ctx.sleep(1500 * 2 ** (attempt - 1));
    try {
      const req: RequestInit = {
        ...rest,
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json, application/rss+xml, application/xml, text/html', ...rest.headers },
      };
      const res = untrusted ? await publicFetch(ctx, url, req) : await ctx.fetch(url, { ...req, redirect: 'follow' });
      if (res.status !== 429 && res.status < 500) return res;
      last = `HTTP ${res.status}`;
    } catch (e) {
      if (e instanceof BlockedAddress) throw e;
      last = e instanceof Error ? e.message : String(e);
    }
  }
  throw new SourceError(`${new URL(url).host}: ${last}`);
}

export async function getJson<T = any>(ctx: SourceContext, url: string, init: RequestInit = {}): Promise<T> {
  const res = await httpGet(ctx, url, init);
  if (!res.ok) throw new SourceError(`${new URL(url).host}: HTTP ${res.status}`);
  try {
    return (await res.json()) as T;
  } catch {
    throw new SourceError(`${new URL(url).host}: the response was not valid JSON`);
  }
}

/**
 * Honours robots.txt. If the rules cannot be read, nothing is fetched, and the
 * error says so rather than wrongly claiming that the site forbids access.
 */
export async function robotsAllow(ctx: SourceContext, url: string): Promise<boolean> {
  const origin = new URL(url).origin;
  if (!ctx.robotsCache.has(origin)) {
    ctx.robotsCache.set(origin, (async () => {
      const robotsUrl = `${origin}/robots.txt`;
      const res = await publicFetch(ctx, robotsUrl, { signal: AbortSignal.timeout(10_000), headers: { 'User-Agent': USER_AGENT } }).catch(() => null);
      if (!res || res.status >= 500) throw new SourceError(`${new URL(origin).host}: its robots rules could not be read, so it was not checked`);
      if (!res.ok) return { isAllowed: () => true };
      return robotsParser(robotsUrl, await res.text());
    })());
  }
  const rules = await ctx.robotsCache.get(origin)!;
  return rules.isAllowed(url, USER_AGENT) !== false;
}

/** Opens a job page to confirm it is still live. Never bypasses a block. */
export async function checkPage(ctx: SourceContext, url: string): Promise<VerifyState> {
  try {
    if (!(await robotsAllow(ctx, url))) return 'unknown';
    const res = await httpGet(ctx, url, { retries: 1, timeoutMs: 15_000, untrusted: true });
    if (res.status === 404 || res.status === 410) return 'closed';
    if (!res.ok) return 'unknown';
    return looksClosed((await res.text()).slice(0, 200_000)) ? 'closed' : 'active';
  } catch {
    return 'unknown';
  }
}
