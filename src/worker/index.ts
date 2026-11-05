import { appendFileSync } from 'node:fs';
import { closePool } from '../lib/db';
import { tick, workDue } from './tick';

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--check')) {
    const due = await workDue(new Date());
    console.log(JSON.stringify(due));
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(process.env.GITHUB_OUTPUT, `due=${due.any}\nsearch=${due.slots > 0 || due.manual || due.aiTasks}\n`);
    }
    return closePool();
  }
  if (args.includes('--loop')) {
    // For an always-on machine: no external scheduler needed.
    for (;;) {
      await tick().catch((e) => console.error('Tick failed:', e));
      await new Promise((r) => setTimeout(r, 60_000));
    }
  }
  await tick();
  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
