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
    // Record a video of every test. The animation spec relies on this to
    // produce a watchable artifact (the morph can't be asserted as "nice").
    video: 'on',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // Run the built standalone Node server directly instead of `astro preview`.
    // `astro preview` forces NODE_ENV=production, which makes the auth cookie
    // `secure` so it is never sent over plain http://localhost (the e2e would
    // bounce to /login). Running entry.mjs leaves NODE_ENV non-production.
    command:
      'npm run build -w @family-todo/frontend && node packages/frontend/dist/server/entry.mjs',
    url: 'http://localhost:4321',
    reuseExistingServer: !process.env.CI,
    env: {
      POCKETBASE_URL: process.env.POCKETBASE_URL || 'http://localhost:8090',
      HOST: '0.0.0.0',
      PORT: '4321',
      NODE_ENV: 'test',
    },
  },
})
