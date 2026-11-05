import { processQueue } from '../lib/ai/tasks';
import { getProvider } from '../lib/ai/provider';
import { cleanupDue, runCleanup } from '../lib/cleanup';
import { one, q } from '../lib/db';
import { closedSlots, dueSlots } from '../lib/schedule';
import { executeSearch, type Deps } from '../lib/search/run';
import { getSettings } from '../lib/settings';

const STALE_MIN = 30;

export type WorkDue = { slots: number; manual: boolean; cleanup: boolean; aiTasks: boolean; any: boolean };

/** Read-only check, so an idle trigger spends no compute. */
export async function workDue(now: Date): Promise<WorkDue> {
  const s = await getSettings();
  const taken = await q<{ slot_date: string; slot_key: string }>(
    `SELECT to_char(slot_date,'YYYY-MM-DD') slot_date, slot_key FROM search_runs WHERE slot_key IS NOT NULL AND started_at > $1`,
    [new Date(now.getTime() - 86_400_000)]);
  const slots = dueSlots(now, s).filter((d) => !taken.some((t) => t.slot_date === d.date && t.slot_key === d.key)).length;
  const manual = s.agent_enabled && Boolean(await one(`SELECT id FROM search_requests WHERE status='pending' LIMIT 1`));
  const cleanup = await cleanupDue(now);
  const aiTasks = Boolean(await one(`SELECT id FROM ai_tasks WHERE status='queued' LIMIT 1`));
  return { slots, manual, cleanup, aiTasks, any: slots > 0 || manual || cleanup || aiTasks };
}

export async function failStaleRuns(now: Date) {
  await q(
    `UPDATE search_runs SET status='failed', finished_at=$1, summary='The worker stopped before finishing, for example because the runner was shut down.'
      WHERE status='running' AND heartbeat_at < $2`, [now, new Date(now.getTime() - STALE_MIN * 60_000)]);
}

async function recordMissed(now: Date) {
  const s = await getSettings();
  for (const slot of closedSlots(now, s)) {
    await q(
      `INSERT INTO search_runs (trigger, slot_key, slot_date, status, started_at, finished_at, summary)
       VALUES ('scheduled',$1,$2,'missed',$3,$3,'The trigger did not arrive during this time slot.') ON CONFLICT DO NOTHING`,
      [slot.key, slot.date, slot.at]);
  }
}

async function claimSlot(key: string, date: string, now: Date): Promise<string | null> {
  const r = await one<{ id: string }>(
    `INSERT INTO search_runs (trigger, slot_key, slot_date, status, started_at, heartbeat_at) VALUES ('scheduled',$1,$2,'running',$3,$3)
     ON CONFLICT DO NOTHING RETURNING id`, [key, date, now]);
  return r?.id ?? null;
}

async function claimManual(now: Date): Promise<{ runId: string } | null> {
  const req = await one<{ id: string }>(`SELECT id FROM search_requests WHERE status='pending' ORDER BY id LIMIT 1`);
  if (!req) return null;
  const run = await one<{ id: string }>(
    `INSERT INTO search_runs (trigger, status, started_at, heartbeat_at) VALUES ('manual','running',$1,$1) ON CONFLICT DO NOTHING RETURNING id`, [now]);
  if (!run) return null;
  await q(`UPDATE search_requests SET status='done', run_id=$1 WHERE status='pending'`, [run.id]);
  return { runId: run.id };
}

export async function tick(deps: Deps = {}) {
  const clock = deps.now ?? (() => new Date());
  const log = deps.log ?? console.log;
  const env = deps.env ?? process.env;
  await failStaleRuns(clock());
  await recordMissed(clock());
  const settings = await getSettings();

  if (!settings.agent_enabled) {
    await q(`UPDATE search_requests SET status='cancelled' WHERE status='pending'`);
    log('Agent is off. No search, no email.');
  } else {
    const provider = deps.provider !== undefined ? deps.provider : await getProvider(env, deps.fetch ?? fetch);
    if (env.AI_PROVIDER && env.AI_PROVIDER !== 'rules' && !provider) log(`AI provider "${env.AI_PROVIDER}" is not reachable. Using the built-in engine.`);
    for (const slot of dueSlots(clock(), settings)) {
      const runId = await claimSlot(slot.key, slot.date, clock());
      if (!runId) continue;
      log(`Starting ${slot.key} search (run ${runId})`);
      log(`Finished: ${await executeSearch({ runId, trigger: 'scheduled' }, { ...deps, provider })}`);
    }
    const manual = await claimManual(clock());
    if (manual) log(`Finished manual search: ${await executeSearch({ runId: manual.runId, trigger: 'manual' }, { ...deps, provider })}`);
    if (provider) await processQueue(provider, 240_000, log);
  }

  // Maintenance, not a search: it runs even while the agent is off.
  if (await cleanupDue(clock())) {
    const r = await runCleanup(clock());
    log(`Cleanup ${r.status}: ${r.total} records deleted${r.note ? ` (${r.note})` : ''}`);
  }
}
