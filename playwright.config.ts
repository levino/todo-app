import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './packages/frontend/tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'html',
  use: {
    baseURL: 'http://localhost:4321',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command:
      'npm run build -w @family-todo/frontend && npm run preview -w @family-todo/frontend -- --host',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
    env: {
      POCKETBASE_URL: process.env.POCKETBASE_URL || 'http://localhost:8090',
    },
  },
})
