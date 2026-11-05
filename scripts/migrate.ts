import { readFileSync } from 'node:fs';
import { closePool, pool } from '../src/lib/db';

await pool().query(readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'));
console.log('Database is ready.');
await closePool();
