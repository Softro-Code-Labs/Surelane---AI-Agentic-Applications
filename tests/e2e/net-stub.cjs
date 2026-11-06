// TEST ONLY. Loaded with --require to give the server simulated websites, because
// the test environment has no internet. The application never imports this.
const dns = require('dns');
const realLookup = dns.promises.lookup;
dns.promises.lookup = (host, opts) => (host.endsWith('.fixture.test') ? Promise.resolve([{ address: '93.184.216.34', family: 4 }]) : realLookup(host, opts));
const pages = {
  'https://open.fixture.test/robots.txt': [200, 'User-agent: *\nAllow: /'],
  'https://open.fixture.test/careers': [200, '<main><h1>Careers</h1><a href="/careers/se">Software Engineer</a><a href="/careers/qa">QA Engineer</a></main>'],
  'https://refuses.fixture.test/robots.txt': [200, 'User-agent: *\nDisallow: /'],
  'https://refuses.fixture.test/careers': [200, 'SHOULD NEVER BE READ'],
  'https://blocked.fixture.test/robots.txt': [404, ''],
  'https://blocked.fixture.test/careers': [403, 'Forbidden'],
  'https://script.fixture.test/robots.txt': [404, ''],
  'https://script.fixture.test/careers': [200, '<body><div id="root"></div></body>'],
};
// Resend, following its API reference. Only owner@example.com is on the test account.
const resend = (init) => {
  const json = (status, body) => Promise.resolve(Response.json(body, { status }));
  const mail = JSON.parse(init.body);
  const log = (result) => require('fs').appendFileSync(process.env.STUB_LOG + '.mail', JSON.stringify({ result, auth: init.headers.Authorization, agent: init.headers['User-Agent'], ...mail, html: mail.html.length }) + '\n');
  if (init.headers.Authorization !== 'Bearer re_e2e_key') { log('refused'); return json(401, { statusCode: 401, name: 'validation_error', message: 'API key is invalid' }); }
  if (mail.to !== 'owner@example.com') { log('refused'); return json(403, { statusCode: 403, name: 'validation_error', message: 'You can only send testing emails to your own email address (owner@example.com).' }); }
  log('sent');
  return json(200, { id: '49a3999c-0ce1-4ea6-ab68-afcd6dc2e794' });
};
const realFetch = globalThis.fetch;
globalThis.fetch = (url, init) => {
  const key = String(url?.url ?? url);
  if (key === 'https://api.resend.com/emails') return resend(init);
  const hit = pages[key];
  if (key.includes('.fixture.test')) {
    if (key.includes('refuses.fixture.test/careers')) require('fs').appendFileSync(process.env.STUB_LOG, key + '\n');
    return Promise.resolve(new Response(hit?.[1] ?? '', { status: hit?.[0] ?? 404, headers: { 'content-type': 'text/html' } }));
  }
  return realFetch(url, init);
};
