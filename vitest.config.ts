import { getViteConfig } from 'astro/config'

export default getViteConfig({
  // @ts-expect-error vitest test config is not part of vite's UserConfig type
  test: {
    globals: true,
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
  },
})
