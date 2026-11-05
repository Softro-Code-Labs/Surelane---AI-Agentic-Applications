import { Pool, type PoolClient, type QueryResultRow } from 'pg';

const g = globalThis as unknown as { __jobAgentPool?: Pool };

export function pool(): Pool {
  if (g.__jobAgentPool) return g.__jobAgentPool;
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL is not set. See README, step 2.');
  const url = new URL(raw);
  const isLocal = ['localhost', '127.0.0.1', '::1', 'db'].includes(url.hostname);
  // sslmode in the URL would override the ssl object below.
  url.searchParams.delete('sslmode');
  const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, '\n');
  g.__jobAgentPool = new Pool({
    connectionString: url.toString(),
    max: Number(process.env.DB_POOL_MAX ?? 3),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 15_000,
    // Traffic is always encrypted off-host. Certificate pinning needs Supabase's
    // CA, which is optional: set DATABASE_CA_CERT to turn on full verification.
    ssl: isLocal ? undefined : ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false },
  });
  // Poolers close idle connections. Without a listener that would crash the process.
  g.__jobAgentPool.on('error', (e) => console.error('Database connection dropped:', e.message));
  return g.__jobAgentPool;
}

export async function q<T extends QueryResultRow = any>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await pool().query<T>(text, params as any[])).rows;
}

export async function one<T extends QueryResultRow = any>(text: string, params: unknown[] = []): Promise<T | null> {
  return (await q<T>(text, params))[0] ?? null;
}

export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export async function closePool() {
  await g.__jobAgentPool?.end();
  g.__jobAgentPool = undefined;
}
