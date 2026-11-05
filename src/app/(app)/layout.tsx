export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { ToastProvider } from '@/components/feedback';
import { Shell } from '@/components/Shell';
import { isSignedIn, ownerExists } from '@/lib/auth';
import { one } from '@/lib/db';
import { RECOMMENDABLE, getCv, getSettings, scopeSql } from '@/lib/settings';

export default async function AppLayout({ children }: { children: ReactNode }) {
  if (!(await ownerExists())) redirect('/setup');
  if (!(await isSignedIn())) redirect('/login');
  const [s, cv] = await Promise.all([getSettings(), getCv()]);
  const counts = (await one<{ jobs: string; apps: string }>(
    `SELECT (SELECT count(*) FROM jobs j WHERE ${RECOMMENDABLE} ${scopeSql(s)} AND j.score >= $1) jobs, (SELECT count(*) FROM applications) apps`, [s.min_score]))!;
  const blocked = !s.agent_enabled ? 'Turn the agent on first, then you can search.' : !cv ? 'Upload your CV first, so Surelane knows what to look for.' : undefined;
  return (
    <ToastProvider>
      <a href="#main" className="skip">Skip to main content</a>
      <Shell agentOn={s.agent_enabled} blockedBecause={blocked} jobs={Number(counts.jobs)} apps={Number(counts.apps)}>
        <main id="main" tabIndex={-1} className="flex-1 outline-none">{children}</main>
      </Shell>
    </ToastProvider>
  );
}
