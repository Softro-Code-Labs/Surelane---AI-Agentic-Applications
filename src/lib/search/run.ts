import { aiEnabled, refineMatch, type Provider } from '../ai/provider';
import type { CandidateProfile } from '../cv/parse';
import { one, q } from '../db';
import { scoreJob, type MatchResult } from '../match/score';
import { sendRunEmail } from '../notify/email';
import { SCOPE_OFF, getCv, getSettings, recommendableAt, scopeSql, searchesOff, type Settings } from '../settings';
import { DETAILS_PER_RUN } from '../sources/career';
import { buildSources, enabledCareerPages, saveOutcome } from '../sources/registry';
import { SourceSkip } from '../sources/types';
import { checkPage } from '../sources/http';
import type { RawJob, SourceAdapter, SourceContext } from '../sources/types';
import { jobFingerprint } from '../text';
import { classify, rejectReason } from './classify';
import { plural } from '../plural';

export class Cancelled extends Error {}

export type Deps = {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  env?: Record<string, string | undefined>;
  provider?: Provider | null;
  now?: () => Date;
  sources?: SourceAdapter[];
  log?: (msg: string) => void;
  resolveHost?: SourceContext['resolveHost'];
};

export function searchKeywords(p: CandidateProfile, s: Pick<Settings, 'extra_keywords' | 'categories'>): string[] {
  const titles = p.targetTitles.map((t) => t.replace(/[()|].*$/, '').trim()).filter((t) => t.length > 2);
  return [...new Set([...s.extra_keywords, ...s.categories, ...titles, ...p.skills.slice(0, 3)])].slice(0, 6);
}

async function usedToday(id: string, now: Date): Promise<number> {
  const r = await one<{ n: string }>(
    `SELECT count(*) n FROM search_run_sources WHERE source = $1 AND status = 'success' AND checked_at > $2`,
    [id, new Date(now.getTime() - 86_400_000)],
  );
  return Number(r?.n ?? 0);
}

async function checkpoint(runId: string, now: Date) {
  const s = await one<{ agent_enabled: boolean }>('SELECT agent_enabled FROM settings WHERE id = 1');
  await q('UPDATE search_runs SET heartbeat_at = $2 WHERE id = $1', [runId, now]);
  if (!s?.agent_enabled) throw new Cancelled('The agent was switched off during this search.');
}

function mergeSql(raw: RawJob) {
  return JSON.stringify([{ source: raw.sourceLabel, url: raw.url }]);
}

/** Saves the job and its place in this run's results in one round trip to the database. */
async function saveJob(runId: string, raw: RawJob, c: ReturnType<typeof classify>, fp: string, m: MatchResult, version: string, now: Date, method: string) {
  return one<{ id: string; inserted: boolean }>(
    `WITH saved AS (INSERT INTO jobs (fingerprint, source, source_label, source_job_id, url, sources, title, company, location, country, market,
       work_mode, sl_eligibility, employment_type, category, salary, posted_at, deadline, description, company_info, requirements,
       verified_at, verify_method, first_seen_at, last_seen_at, score, tier, scored_by, matching_skills, missing_skills,
       mandatory_missing, explanation, suitability, profile_version)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$22,$22,$24,$25,'rules',$26,$27,$28,$29,$30,$31)
     ON CONFLICT (fingerprint) DO UPDATE SET
       last_seen_at = EXCLUDED.last_seen_at,
       verified_at = CASE WHEN jobs.status = 'active' THEN EXCLUDED.verified_at ELSE jobs.verified_at END,
       verify_method = CASE WHEN jobs.status = 'active' THEN EXCLUDED.verify_method ELSE jobs.verify_method END,
       deadline = COALESCE(EXCLUDED.deadline, jobs.deadline),
       salary = COALESCE(jobs.salary, EXCLUDED.salary),
       description = CASE WHEN length(EXCLUDED.description) > length(jobs.description) THEN EXCLUDED.description ELSE jobs.description END,
       sources = CASE WHEN jobs.sources @> EXCLUDED.sources THEN jobs.sources ELSE jobs.sources || EXCLUDED.sources END
     RETURNING id, (xmax = 0) AS inserted),
     listed AS (INSERT INTO search_results (run_id, job_id, is_new, score, created_at)
       SELECT $32, id, inserted, $24, $22 FROM saved ON CONFLICT (run_id, job_id) DO NOTHING)
     SELECT id, inserted FROM saved`,
    [fp, raw.source, raw.sourceLabel, raw.sourceJobId ?? null, raw.url, mergeSql(raw), raw.title, raw.company, raw.location, c.country, c.market,
      c.workMode, c.slEligibility, raw.employmentType ?? null, raw.category ?? null, raw.salary ?? null, raw.postedAt ?? null, raw.deadline ?? null,
      raw.description, raw.companyInfo ?? null, m.requirements, now, method, m.score, m.tier, m.matchingSkills, m.missingSkills,
      m.mandatoryMissing, m.explanation, m.suitability, version, runId],
  );
}

/** Re-scores stored jobs with the built-in engine after a CV change. */
export async function rescoreStored(profile: CandidateProfile, version: string, s: Settings): Promise<number> {
  const rows = await q<{ id: string; title: string; description: string; location: string; work_mode: string; category: string | null }>(
    `SELECT id, title, description, location, work_mode, category FROM jobs WHERE status = 'active' AND profile_version IS DISTINCT FROM $1`, [version]);
  // One statement per 200 jobs, not one per job: a CV upload re-scores everything inside a single web request.
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200).map((j) => {
      const m = scoreJob({ title: j.title, description: j.description, location: j.location, workMode: j.work_mode, category: j.category }, profile, s);
      return { id: j.id, score: m.score, tier: m.tier, matching: m.matchingSkills, missing: m.missingSkills, mandatory: m.mandatoryMissing, explanation: m.explanation, suitability: m.suitability };
    });
    await q(
      `UPDATE jobs j SET score = x.score, tier = x.tier, scored_by = 'rules',
         matching_skills = ARRAY(SELECT jsonb_array_elements_text(x.matching)), missing_skills = ARRAY(SELECT jsonb_array_elements_text(x.missing)),
         mandatory_missing = ARRAY(SELECT jsonb_array_elements_text(x.mandatory)), explanation = x.explanation, suitability = x.suitability, profile_version = $2
       FROM jsonb_to_recordset($1::jsonb) AS x(id bigint, score integer, tier text, matching jsonb, missing jsonb, mandatory jsonb, explanation text, suitability text)
       WHERE j.id = x.id`, [JSON.stringify(batch), version]);
  }
  return rows.length;
}

const VERIFY_LIMIT = 40;
/** Sources read at the same time. Each is a different website. */
const SOURCE_CONCURRENCY = 4;

/** Re-checks stored jobs that were not confirmed by a provider during this run. */
async function verifyStored(sources: SourceAdapter[], ctx: SourceContext, min: number, now: Date, log: (m: string) => void) {
  const rows = await q<{ id: string; source: string; source_job_id: string | null; url: string }>(
    `SELECT id, source, source_job_id, url FROM jobs
      WHERE status = 'active' AND tier IS NOT NULL AND score >= $1
        AND (verified_at IS NULL OR verified_at < $2 OR verify_method = 'feed_listing')
      ORDER BY score DESC NULLS LAST LIMIT $3`, [min, new Date(now.getTime() - 3_600_000), VERIFY_LIMIT]);
  const closed: string[] = [];
  const confirm = async (id: string, method: string) => q('UPDATE jobs SET verified_at=$2, verify_method=$3 WHERE id=$1', [id, now, method]);

  const bySource = new Map<string, typeof rows>();
  for (const r of rows) bySource.set(r.source, [...(bySource.get(r.source) ?? []), r]);
  for (const [sourceId, jobs] of bySource) {
    const adapter = sources.find((a) => a.id === sourceId);
    if (adapter?.verify) {
      const states = await adapter.verify(jobs.map((j) => ({ id: Number(j.id), sourceJobId: j.source_job_id, url: j.url })), ctx).catch((e) => {
        log(`${adapter.label}: status check failed: ${e.message}`);
        return new Map();
      });
      for (const j of jobs) {
        const state = states.get(Number(j.id));
        if (state === 'closed') closed.push(j.id);
        else if (state === 'active') await confirm(j.id, 'source_status');
      }
      continue;
    }
    if (sourceId === 'jooble' || sourceId === 'manual' || adapter?.completeListing) continue;
    for (const j of jobs) {
      const state = await checkPage(ctx, j.url);
      if (state === 'closed') closed.push(j.id);
      else if (state === 'active') await confirm(j.id, 'page_check');
      await ctx.sleep(400);
    }
  }
  if (closed.length) {
    await q(`UPDATE jobs SET status='closed', status_reason='The original listing is closed or removed', last_seen_at=last_seen_at WHERE id = ANY($1::bigint[])`, [closed]);
  }
  return closed.length;
}

async function refineTop(provider: Provider, profile: CandidateProfile, version: string, s: Settings, env: Record<string, string | undefined>, sleep: Deps['sleep'], log: (m: string) => void, now: Date) {
  // A local model is limited by the time budget below; a cloud model by its daily free allowance.
  const maxJobs = Number(env.AI_MAX_JOBS_PER_RUN || (provider.cloud ? 20 : 12));
  const deadline = Date.now() + Number(env.AI_TIME_BUDGET_SECONDS || 420) * 1000;
  const rows = await q<{ id: string; title: string; company: string; description: string; score: number; matching_skills: string[]; missing_skills: string[] }>(
    `SELECT id, title, company, description, score, matching_skills, missing_skills FROM jobs j
      WHERE ${recommendableAt('$4::timestamptz')} ${scopeSql(s)} AND score >= $1 AND scored_by = 'rules' AND profile_version = $2
      ORDER BY score DESC LIMIT $3`, [s.min_score, version, maxJobs, now]);
  let done = 0;
  for (const j of rows) {
    if (Date.now() > deadline) { log(`AI time budget reached after ${done} of ${rows.length} jobs`); break; }
    try {
      const r = await refineMatch(provider, profile, j, { score: j.score, matchingSkills: j.matching_skills, missingSkills: j.missing_skills });
      await q('UPDATE jobs SET score=$2, tier=$3, explanation=$4, scored_by=$5 WHERE id=$1', [j.id, r.score, r.tier, r.explanation, provider.id]);
      done++;
    } catch (e) {
      log(`AI scoring skipped for job ${j.id}: ${e instanceof Error ? e.message : e}`);
    }
    if (provider.paceMs) await sleep?.(provider.paceMs);
  }
  return done;
}

export type RunOptions = { runId: string; trigger: 'scheduled' | 'manual' };

export async function executeSearch({ runId, trigger }: RunOptions, deps: Deps = {}) {
  const env = deps.env ?? process.env;
  const clock = deps.now ?? (() => new Date());
  const sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const log = deps.log ?? ((m) => console.log(`[run ${runId}] ${m}`));
  const stats = { found: 0, fresh: 0, outdated: 0, duplicates: 0, irrelevant: 0 };
  const errors: string[] = [];
  const finish = async (status: string, summary: string) => {
    const t = await one<{ strong: string; good: string; potential: string }>(
      `SELECT count(*) FILTER (WHERE r.score >= 75) strong, count(*) FILTER (WHERE r.score >= 60 AND r.score < 75) good,
              count(*) FILTER (WHERE r.score < 60) potential FROM search_results r WHERE r.run_id = $1`, [runId]);
    const strong = Number(t?.strong ?? 0), good = Number(t?.good ?? 0), potential = Number(t?.potential ?? 0);
    await q(
      `UPDATE search_runs SET status=$2, summary=$3, finished_at=$4, jobs_found=$5, jobs_new=$6, matches=$7, strong=$8, good=$9, potential=$10,
         filtered_outdated=$11, duplicates=$12, errors=$13::jsonb WHERE id=$1`,
      [runId, status, summary, clock(), stats.found, stats.fresh, strong + good + potential, strong, good, potential, stats.outdated, stats.duplicates, JSON.stringify(errors)]);
    return status;
  };

  try {
    const now = clock();
    await checkpoint(runId, now);
    const cv = await getCv();
    if (!cv) return await finish('skipped', 'No CV uploaded, so there was nothing to match against.');
    const settings = await getSettings();
    if (searchesOff(settings)) return await finish('skipped', SCOPE_OFF);
    // 'global' meant Sri Lanka and international before Local had its own switch, so both-on keeps that value.
    await q('UPDATE search_runs SET mode=$2 WHERE id=$1', [runId, settings.global_enabled ? (settings.local_enabled ? 'global' : 'global_only') : 'local']);

    const profile = cv.profile;
    const version = String(cv.profile_version);
    await rescoreStored(profile, version, settings);

    const ctx: SourceContext = {
      fetch: deps.fetch ?? fetch, sleep, now, keywords: searchKeywords(profile, settings),
      settings, env, robotsCache: new Map(), resolveHost: deps.resolveHost,
      detailBudget: { left: DETAILS_PER_RUN },
      knownJobs: new Map((await q(`SELECT url, title, description, location, deadline, posted_at, employment_type, salary, country, work_mode FROM jobs WHERE source LIKE 'page:%' AND status = 'active'`)).map((j) => [j.url, j])),
    };
    const sources = deps.sources ?? buildSources(settings, await enabledCareerPages());
    let tried = 0, failed = 0;

    const record = (source: SourceAdapter, status: string, n: number, error: string | null, ms = 0) => q(
      `INSERT INTO search_run_sources (run_id, source, label, status, jobs_found, error, duration_ms, checked_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [runId, source.id, source.label, status, n, error, ms, clock()]);

    // Step 1: decide which sources run at all.
    const due: SourceAdapter[] = [];
    for (const source of sources) {
      if (source.scope === 'global' && !settings.global_enabled) { await record(source, 'skipped', 0, 'Global job opportunities are off'); continue; }
      if (source.scope === 'local' && !settings.local_enabled) { await record(source, 'skipped', 0, 'Local job opportunities are off'); continue; }
      const missing = source.missingConfig?.(ctx);
      if (missing) { await record(source, 'skipped', 0, missing); continue; }
      if (source.maxPerDay && (await usedToday(source.id, now)) >= source.maxPerDay) {
        await record(source, 'skipped', 0, `Daily limit of ${source.maxPerDay} requests reached`); continue;
      }
      due.push(source);
    }

    // Step 2: read them a few at a time. Most of a search is waiting on other
    // people's servers, so this is where the time goes. Each source is a
    // different website, so no site sees more traffic than before.
    type Fetched = { ms: number; raws?: RawJob[]; error?: unknown };
    const fetched = new Map<SourceAdapter, Fetched>();
    let next = 0;
    let stop: unknown = null;
    await Promise.all(Array.from({ length: Math.min(SOURCE_CONCURRENCY, due.length) }, async () => {
      while (!stop && next < due.length) {
        const source = due[next++]!;
        const started = Date.now();
        try {
          await checkpoint(runId, clock());
          const raws = await source.search(ctx);
          fetched.set(source, { raws, ms: Date.now() - started });
        } catch (e) {
          if (e instanceof Cancelled) stop = e; else fetched.set(source, { error: e, ms: Date.now() - started });
        }
      }
    }));
    if (stop) throw stop;

    // Step 3: save what came back, one source at a time and in the usual order.
    for (const source of due) {
      await checkpoint(runId, clock());
      const got = fetched.get(source)!;
      tried++;
      if (!got.raws) {
        const e = got.error;
        const msg = e instanceof Error ? e.message : String(e);
        if (source.careerPageId) await saveOutcome(source.careerPageId, source.outcome ?? { status: 'error', message: msg, jobs: [] }, clock());
        if (e instanceof SourceSkip) {
          // Being told no is respected, and does not count against the search.
          tried--;
          await record(source, 'skipped', 0, msg, got.ms);
          continue;
        }
        failed++;
        errors.push(`${source.label}: ${msg}`);
        await record(source, 'failed', 0, msg, got.ms);
        continue;
      }
      const raws = got.raws;
      if (source.careerPageId && source.outcome) await saveOutcome(source.careerPageId, source.outcome, clock());

      const listed = new Set<string>();
      let kept = 0;
      for (const raw of raws) {
        stats.found++;
        const c = classify(raw);
        const fp = jobFingerprint({ title: raw.title, company: raw.company, location: raw.location, workMode: c.workMode });
        listed.add(fp);
        const rejected = rejectReason(raw, c.market, c.workMode, c.slEligibility, settings, clock());
        if (rejected) {
          if (['expired', 'closed', 'outdated'].includes(rejected.kind)) {
            stats.outdated++;
            await q(`UPDATE jobs SET status=$2, status_reason=$3 WHERE fingerprint=$1 AND status='active'`,
              [fp, rejected.kind, rejected.reason]);
          }
          continue;
        }
        const m = scoreJob({ title: raw.title, description: raw.description, location: raw.location, workMode: c.workMode, category: raw.category }, profile, settings);
        if (!m.relevant || !m.tier) { stats.irrelevant++; continue; }

        const method = source.completeListing ? 'employer_board' : 'feed_listing';
        const saved = await saveJob(runId, raw, c, fp, m, version, clock(), method);
        if (!saved) continue;
        if (saved.inserted) stats.fresh++; else stats.duplicates++;
        kept++;
      }

      if (source.completeListing && (raws.length > 0 || source.emptyMeansClosed !== false)) {
        await q(
          `UPDATE jobs SET status='closed', status_reason='No longer on the employer''s job board'
            WHERE source=$1 AND status='active' AND NOT (fingerprint = ANY($2::text[]))`, [source.id, [...listed]]);
      }
      await record(source, 'success', raws.length, null, got.ms);
      log(`${source.label}: ${raws.length} listed, ${kept} relevant`);
    }

    if (tried > 0 && failed === tried) return await finish('failed', 'Every source failed, so no jobs were checked. See the source errors below.');
    if (tried === 0) return await finish('failed', 'No sources were available to search.');

    await checkpoint(runId, clock());
    const closed = await verifyStored(sources, ctx, settings.min_score, clock(), log);
    stats.outdated += closed;

    await checkpoint(runId, clock());
    const provider = deps.provider;
    if (provider && aiEnabled(env)) await refineTop(provider, profile, version, settings, env, sleep, log, clock());
    await q(`UPDATE search_results r SET score = j.score FROM jobs j WHERE r.job_id = j.id AND r.run_id = $1`, [runId]);

    await checkpoint(runId, clock());
    const status = failed ? 'partial' : 'completed';
    const summary = `Found ${plural(stats.found, 'listing')} and ${plural(stats.fresh, 'new match', 'new matches')}. Left out ${stats.outdated} expired or closed and ${stats.irrelevant} not relevant.`
      + (failed ? ` ${failed} of ${tried} sources failed.` : '');
    await finish(status, summary);

    if (trigger === 'scheduled') await sendRunEmail(runId, { env, now: clock });
    return status;
  } catch (e) {
    if (e instanceof Cancelled) return finish('cancelled', e.message);
    const msg = e instanceof Error ? e.message : String(e);
    errors.push(msg);
    return finish('failed', `The search stopped: ${msg}`);
  }
}
