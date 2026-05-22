import { defineConfig, devices } from '@playwright/test'

const CI = !!process.env.CI

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'react',
      testMatch: 'e2e/react/**/*.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:4173',
      },
    },
    {
      name: 'legacy',
      testMatch: 'e2e/legacy/**/*.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:4174',
      },
    },
  ],

  webServer: [
    {
      // Requires a prior `npm run build` — see e2e/README.md
      command: 'npm run preview',
      url: 'http://localhost:4173/Vorcelab/app/',
      reuseExistingServer: !CI,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    {
      command: 'node e2e/legacy-server.mjs',
      url: 'http://localhost:4174/legacy.html',
      reuseExistingServer: !CI,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  ],
})
