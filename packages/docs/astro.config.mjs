import tailwind from '@astrojs/tailwind'
import shipyard from '@levino/shipyard-base'
import shipyardDocs from '@levino/shipyard-docs'
import { defineConfig } from 'astro/config'

export default defineConfig({
  site: 'https://docs.todos.levinkeller.de',
  output: 'static',
  integrations: [
    tailwind({ applyBaseStyles: false }),
    shipyard({
      brand: 'Family Todo',
      title: 'Family Todo - AI-First Task Management',
      tagline: 'Die erste App, die ausschließlich mit KI administriert wird',
      github: 'https://github.com/levino/todo-app',
      navigation: {
        docs: { label: 'Dokumentation', href: '/docs' },
        app: { label: 'Zur App', href: 'https://todos.levinkeller.de', external: true },
        github: { label: 'GitHub', href: 'https://github.com/levino/todo-app', external: true },
      },
    }),
    shipyardDocs({
      editLink: {
        baseUrl: 'https://github.com/levino/todo-app/edit/main/packages/docs/',
      },
    }),
  ],
  i18n: {
    defaultLocale: 'de',
    locales: ['de', 'en'],
  },
})
