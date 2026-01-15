# Bug: Incompatibility with @astrojs/cloudflare adapter

## Problem

When using `@astrojs/cloudflare` adapter with Shipyard docs, the build fails during prerendering with:

```
Cannot read properties of undefined (reading 'render')
  at file:///...dist/_worker.js/chunks/DocsEntry-docs_xxx.mjs:13956:30
```

The generated URLs also incorrectly include the `.md` extension:
```
/de/docs/getting-started.md/index.html  (wrong)
/de/docs/getting-started/index.html     (correct, without adapter)
```

## Reproduction

```js
// astro.config.mjs
import cloudflare from '@astrojs/cloudflare'
export default defineConfig({
  output: 'static',
  adapter: cloudflare(),
  // ... shipyard integrations
})
```

## Workaround

Remove the Cloudflare adapter - Cloudflare Pages serves static sites without it:

```js
export default defineConfig({
  output: 'static',
  // No adapter needed for static sites
})
```

## Expected Behavior

Shipyard should work with `@astrojs/cloudflare` adapter for static builds.
