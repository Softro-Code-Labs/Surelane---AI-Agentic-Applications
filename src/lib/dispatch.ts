/** Asks GitHub Actions to start the worker now. Without credentials the next trigger picks the work up. */
export async function triggerWorker(env: Record<string, string | undefined> = process.env, f: typeof fetch = fetch): Promise<boolean> {
  const { GITHUB_DISPATCH_TOKEN: token, GITHUB_REPO: repo } = env;
  if (!token || !repo) return false;
  const res = await f(`https://api.github.com/repos/${repo}/actions/workflows/agent.yml/dispatches`, {
    method: 'POST', signal: AbortSignal.timeout(8000),
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'surelane' },
    body: JSON.stringify({ ref: env.GITHUB_REF_NAME ?? 'main' }),
  }).catch(() => null);
  return res?.status === 204;
}
