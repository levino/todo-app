import node from '@astrojs/node'
import shipyard from '@levino/shipyard-base'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'

import appCss from './src/styles/app.css?url'

export default defineConfig({
  site: 'https://your-site.example.com',
  output: 'server',
  prefetch: {
    defaultStrategy: 'tap',
  },
  adapter: node({
    mode: 'standalone',
  }),
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: [
    shipyard({
      css: appCss,
      brand: 'Todo App',
      title: 'Todo App',
      tagline: 'A simple todo application',
      navigation: {
        home: { label: 'Todos', href: '/' },
        logout: { label: 'Logout', href: '/logout' },
      },
    }),
  ],
})
