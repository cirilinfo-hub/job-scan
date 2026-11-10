import { defineConfig } from '@playwright/test';

// Expects the app at E2E_BASE_URL, serving API and frontend from one origin (SERVE_FRONTEND=true).
export default defineConfig({
  testDir: './tests',
  timeout: 90_000,
  workers: 1,
  reporter: [['list']],
  outputDir: './.results',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4000',
    channel: process.env.E2E_CHANNEL ?? 'chrome',
    screenshot: 'only-on-failure',
    acceptDownloads: true,
  },
});
