// TEST ONLY. Stands in for https://api.resend.com/emails, following Resend's published
// API reference, because tests must never send real email. The application never imports this.
export type Sent = { to: string; from: string; subject: string; html: string; text: string; body: string };
type Canned = 'server_error' | 'unreachable' | 'dropped_after_sending' | 'daily_quota' | 'monthly_quota' | 'rate_limited';

export const ACCOUNT_EMAIL = 'me@example.com';
export const API_KEY = 're_test_key';
export const RESEND_URL = 'https://api.resend.com/emails';

const fail = (status: number, name: string, message: string) => new Response(JSON.stringify({ statusCode: status, name, message }), { status, headers: { 'content-type': 'application/json' } });

export function fakeResend(verifiedDomains: string[] = []) {
  const inbox: Sent[] = [];
  const calls: { url: string; method: string; headers: Headers; body: string }[] = [];
  const queue: Canned[] = [];
  const seen = new Map<string, { body: string; id: string }>();

  const accept = (mail: any, raw: string, key: string | null) => {
    const id = crypto.randomUUID();
    inbox.push({ ...mail, body: `${mail.subject}\n${mail.html}\n${mail.text}` });
    if (key) seen.set(key, { body: raw, id });
    return id;
  };

  const handler = async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    const headers = new Headers(init.headers);
    const raw = String(init.body ?? '');
    calls.push({ url, method: init.method ?? 'GET', headers, body: raw });
    if (url !== RESEND_URL) throw new Error(`Unexpected request to ${url}`);

    if (!headers.get('user-agent')) return fail(403, 'application_error', 'error code: 1010');
    const auth = headers.get('authorization');
    if (!auth) return fail(401, 'missing_api_key', 'Missing API key in the authorization header.');
    if (auth !== `Bearer ${API_KEY}`) return fail(401, 'validation_error', 'API key is invalid');

    const mail = JSON.parse(raw);
    for (const field of ['from', 'to', 'subject']) if (!mail[field]) return fail(422, 'missing_required_field', `Missing \`${field}\` field.`);

    const key = headers.get('idempotency-key');
    const earlier = key ? seen.get(key) : undefined;
    if (earlier) return earlier.body === raw ? Response.json({ id: earlier.id }) : fail(409, 'invalid_idempotent_request', 'This idempotency key has already been used on a request that had a different payload.');

    const canned = queue.shift();
    if (canned === 'unreachable') throw new TypeError('fetch failed');
    if (canned === 'server_error') return fail(500, 'application_error', 'An unexpected error occurred.');
    if (canned === 'daily_quota') return fail(429, 'daily_quota_exceeded', 'You have reached your daily email sending quota.');
    if (canned === 'monthly_quota') return fail(429, 'monthly_quota_exceeded', 'You have reached your monthly email sending quota.');
    if (canned === 'rate_limited') return fail(429, 'rate_limit_exceeded', 'Too many requests.');

    const domain = /@([^>\s]+)>?$/.exec(mail.from)?.[1] ?? '';
    if (domain === 'resend.dev' && mail.to !== ACCOUNT_EMAIL) return fail(403, 'validation_error', `You can only send testing emails to your own email address (${ACCOUNT_EMAIL}).`);
    if (domain !== 'resend.dev' && !verifiedDomains.includes(domain)) return fail(403, 'validation_error', `The ${domain} domain is not verified. Please, add and verify your domain on https://resend.com/domains`);

    const id = accept(mail, raw, key);
    if (canned === 'dropped_after_sending') throw new TypeError('fetch failed');
    return Response.json({ id });
  };

  return { handler: handler as typeof fetch, inbox, calls, queue };
}
