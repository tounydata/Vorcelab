import { defineConfig, devices } from '@playwright/test'
import { AUTH_FILE } from './e2e/constants'
import { config as loadEnv } from 'dotenv'

// Charge .env.test si présent (variables de test : service key, email, password)
loadEnv({ path: '.env.test', override: false })

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
    // ── Auth setup (précondition des tests authentifiés) ──────────────────
    {
      name: 'setup',
      testMatch: 'e2e/auth.setup.ts',
      use: { baseURL: 'http://localhost:4173' },
    },

    // ── Tests publics (pas d'auth) ────────────────────────────────────────
    {
      name: 'react',
      testMatch: 'e2e/react/**/*.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:4173' },
    },
    {
      name: 'legacy',
      testMatch: 'e2e/legacy/**/*.spec.ts',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:4174' },
    },

    // ── Tests authentifiés (dépendent du setup) ───────────────────────────
    {
      name: 'react-auth',
      testMatch: 'e2e/react-auth/**/*.spec.ts',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'http://localhost:4173',
        storageState: AUTH_FILE,
      },
    },
  ],

  webServer: [
    {
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
