import path from 'node:path'
import { createRequire } from 'node:module'
import typography from '@tailwindcss/typography'
import daisyui from 'daisyui'

const require = createRequire(import.meta.url)

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}',
    path.join(
      path.dirname(require.resolve('@levino/shipyard-base')),
      '../astro/**/*.astro',
    ),
  ],
  theme: {
    extend: {},
  },
  plugins: [typography, daisyui],
  daisyui: {
    themes: ['light', 'dark'],
  },
}
