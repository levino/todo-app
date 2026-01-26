import { getViteConfig } from 'astro/config'

export default getViteConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.integration.test.ts'],
    globals: true,
    globalSetup: ['tests/globalSetup.ts'],
    exclude: ['node_modules', 'dist', 'tests/e2e'],
    // Run tests sequentially since integration tests share a PocketBase port
    fileParallelism: false,
  },
})
