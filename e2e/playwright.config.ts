import { defineConfig, devices } from '@playwright/test'

// This config runs INSIDE the docker-compose network (see docker-compose.yml).
// The stack is started by compose, so there is no `webServer` here — the tests
// talk to oauth2-proxy by its service hostname.
const baseURL = process.env.BASE_URL || 'http://oauth2-proxy:4180'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
    // Don't auto-follow the cross-origin auth redirect at the request layer —
    // several tests assert on the redirect itself.
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
