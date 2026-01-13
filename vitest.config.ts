import { getViteConfig } from 'astro/config'

export default getViteConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.integration.test.ts'],
    globals: true,
    setupFiles: ['tests/setup.integration.ts'],
    exclude: ['node_modules', 'dist', 'tests/e2e'],
  },
})
