// Calls every real source once and reports what came back. Writes nothing.
import { parseEntry } from '../src/lib/sources/career';
import { buildSources } from '../src/lib/sources/registry';
import { SourceSkip, type SourceContext } from '../src/lib/sources/types';

const pages = (process.env.CHECK_BOARDS ?? 'lever:aleph').split(',').flatMap((e, i) => {
  const p = parseEntry(e);
  return p ? [{ id: String(i), company: p.company, url: p.url, default_location: 'Sri Lanka' }] : [];
});
const settings = { local_enabled: true, global_enabled: true, custom_feeds: [] as string[] };
const ctx: SourceContext = {
  fetch, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), now: new Date(),
  keywords: (process.env.CHECK_KEYWORDS ?? 'software engineer,accountant').split(','),
  settings, env: process.env, robotsCache: new Map(),
};

let failures = 0;
for (const s of buildSources(settings, pages)) {
  const missing = s.missingConfig?.(ctx);
  if (missing) { console.log(`SKIP  ${s.label}: ${missing}`); continue; }
  try {
    const jobs = await s.search(ctx);
    const sample = jobs[0];
    console.log(`${jobs.length ? 'OK  ' : 'ZERO'}  ${s.label}: ${jobs.length} jobs${sample ? `, e.g. "${sample.title}" at ${sample.company}` : ''}`);
    if (!jobs.length) failures++;
  } catch (e) {
    // A site that refuses access is respected and reported, not counted as broken.
    if (e instanceof SourceSkip) { console.log(`SKIP  ${s.label}: ${e.message}`); continue; }
    failures++;
    console.log(`FAIL  ${s.label}: ${e instanceof Error ? e.message : e}`);
  }
}
process.exit(failures ? 1 : 0);
