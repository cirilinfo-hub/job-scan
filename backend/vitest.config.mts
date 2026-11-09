import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

// Uses the same server as local development, but always a separate *_test database.
const fileEnv = loadEnv('', process.cwd(), '');
export default defineConfig({
  test: {
    environment: 'node', include: ['tests/**/*.test.ts'], globalSetup: ['tests/global-setup.ts'],
    fileParallelism: false, testTimeout: 30000, hookTimeout: 60000,
    env: { ...fileEnv, NODE_ENV: 'test', DB_NAME: process.env.TEST_DB_NAME ?? 'rolewise_test', SCHEDULER_ENABLED: 'false', AI_PROVIDER: 'none', STORAGE_DIR: './.test-storage', JWT_SECRET: fileEnv.JWT_SECRET || 'test-secret-test-secret-test-secret-1234' },
  },
});
