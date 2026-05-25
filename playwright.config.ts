import { defineConfig, devices } from '@playwright/test'
import { config } from 'dotenv'
import { AUTH_FILE } from './e2e/constants'

config({ path: '.env.test' })

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'react',
      testMatch: /e2e\/react\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:4173' },
    },
    {
      name: 'legacy',
      testMatch: /e2e\/legacy\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:4174' },
    },
    {
      name: 'react-auth',
      testMatch: /e2e\/react-auth\/.*\.spec\.ts/,
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
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'node e2e/legacy-server.mjs',
      url: 'http://localhost:4174',
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
})
