import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false, // Run tests sequentially to avoid DB conflicts
    setupFiles: ['./vitest.setup.ts'],
  },
})
