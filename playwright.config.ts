import { defineConfig } from '@playwright/test';
import type { ApiTestOptions } from './tests/support/users';

const baseURL = process.env.API_BASE_URL ?? 'http://127.0.0.1:3000';

export default defineConfig<ApiTestOptions>({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: [
    ['list'],
    [
      'html',
      {
        outputFolder: 'playwright-report',
        open: 'never',
        title: 'User Management API E2E Test Report',
      },
    ],
  ],
  use: {
    baseURL,
    // API-only suite: no browser is launched, every request goes through APIRequestContext.
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [
    {
      name: 'dev',
      use: { environmentName: 'dev' },
    },
    {
      name: 'prod',
      use: { environmentName: 'prod' },
    },
  ],
});
