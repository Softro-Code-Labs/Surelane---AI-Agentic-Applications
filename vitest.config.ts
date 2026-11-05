import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['tests/**/*.test.ts'], fileParallelism: false, testTimeout: 30000, hookTimeout: 30000,
    env: { DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/agent_test', APP_SECRET: 'test-secret-test-secret-test-secret-1234' },
  },
});
