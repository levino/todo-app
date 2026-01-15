# Bug: shipyard-docs imports Node.js built-in modules

## Problem

When building a static site with `@astrojs/cloudflare`, Vite produces many warnings about Node.js built-in modules being externalized from `@levino/shipyard-docs`:

```
[WARN] [vite] Automatically externalized node built-in module "node:fs" imported from "@levino/shipyard-docs/src/index.ts"
[WARN] [vite] Automatically externalized node built-in module "node:path" imported from "@levino/shipyard-docs/src/index.ts"
[WARN] [vite] Automatically externalized node built-in module "node:child_process" imported from "@levino/shipyard-docs/src/gitMetadata.ts"
```

## Affected Files

- `@levino/shipyard-docs/src/index.ts` → imports `node:fs`, `node:path`
- `@levino/shipyard-docs/src/gitMetadata.ts` → imports `node:child_process`

## Why This Matters

1. **Noisy build output** - Dozens of warnings clutter the build log
2. **Runtime compatibility** - These modules don't exist in edge runtimes (Cloudflare Workers, Deno Deploy, etc.)
3. **Bundle size** - Even if externalized, the import attempts add overhead

## Expected Behavior

An Astro integration should avoid Node.js built-ins in code that might run at request time, or clearly separate build-time utilities from runtime code.

## Suggested Fix

- `gitMetadata.ts`: Move git operations to a Vite plugin or build hook that only runs at build time
- `index.ts`: Review if `fs`/`path` usage can be replaced with Astro's content APIs or moved to build-time only
