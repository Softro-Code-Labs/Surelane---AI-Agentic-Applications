import robotsParser from 'robots-parser';
import { SourceError, type SourceContext, type VerifyState } from './types';

export const USER_AGENT = 'Surelane/1.0 (single-user job alerts)';

const CLOSED_TEXT = /(applications? (?:are |is |have |has )?(?:now )?closed|no longer (?:accepting|available|open|active)|position (?:has been |is )?(?:filled|closed)|vacancy (?:has |is )?(?:been )?(?:closed|filled|expired)|this job (?:has |is )?(?:been )?(?:closed|expired|removed)|job (?:post|posting|listing)? ?(?:has )?expired|(?:this )?listing has expired|expired on \d|closing date has passed)/i;

export function looksClosed(text: string): boolean {
  return CLOSED_TEXT.test(text);
}

export async function httpGet(ctx: SourceContext, url: string, init: RequestInit & { retries?: number; timeoutMs?: number } = {}): Promise<Response> {
  const { retries = 2, timeoutMs = 20_000, ...rest } = init;
  let last = 'request failed';
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt) await ctx.sleep(1500 * 2 ** (attempt - 1));
    try {
      const res = await ctx.fetch(url, {
        ...rest,
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json, application/rss+xml, application/xml, text/html', ...rest.headers },
      });
      if (res.status !== 429 && res.status < 500) return res;
      last = `HTTP ${res.status}`;
    } catch (e) {
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
      const res = await ctx.fetch(robotsUrl, { signal: AbortSignal.timeout(10_000), headers: { 'User-Agent': USER_AGENT } }).catch(() => null);
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
    const res = await httpGet(ctx, url, { retries: 1, timeoutMs: 15_000 });
    if (res.status === 404 || res.status === 410) return 'closed';
    if (!res.ok) return 'unknown';
    return looksClosed((await res.text()).slice(0, 200_000)) ? 'closed' : 'active';
  } catch {
    return 'unknown';
  }
}
