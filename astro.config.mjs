import node from '@astrojs/node'
import tailwind from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'middleware' }),
  server: { host: true },
  vite: {
    plugins: [tailwind()],
    server: {
      proxy: {
        '/api': 'http://localhost:3000',
        '/mcp': 'http://localhost:3000',
        '/oauth': 'http://localhost:3000',
        '/auth': 'http://localhost:3000',
        '/.well-known': 'http://localhost:3000',
      },
    },
  },
})
