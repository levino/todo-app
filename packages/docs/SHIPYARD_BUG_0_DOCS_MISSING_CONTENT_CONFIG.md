# Bug: Documentation doesn't clearly explain content.config.ts requirement

## Problem

The Shipyard documentation does not prominently explain that users **must** create a `src/content.config.ts` file with the `docsSchema` and glob loader configuration. This is a critical requirement that isn't discoverable from the main docs.

An AI assistant reading the Shipyard documentation at https://shipyard.levinkeller.de/en/docs/ completely missed this requirement, leading to build errors like:

```
The collection "docs" does not exist or is empty.
Cannot read properties of undefined (reading 'render')
```

## What the docs show

The getting started guide focuses on:
1. Installing packages
2. Configuring `astro.config.mjs` with integrations

But it doesn't show the **required** `content.config.ts` file.

## What's actually required

```typescript
// src/content.config.ts - THIS FILE IS MANDATORY
import { defineCollection } from 'astro:content'
import { docsSchema } from '@levino/shipyard-docs'
import { glob } from 'astro/loaders'

const docs = defineCollection({
  schema: docsSchema,
  loader: glob({ pattern: '**/*.md', base: './docs' }),
})

export const collections = { docs }
```

## Suggested Fix

1. **Add a prominent "Required Files" section** to the getting started guide
2. **Show the complete minimal setup** including:
   - `astro.config.mjs`
   - `src/content.config.ts` (with docsSchema and loader)
   - Required folder structure (`docs/` at root)
3. **Add a "Common Errors" section** explaining what happens if content.config.ts is missing
4. **Consider a CLI scaffolding command** like `npx create-shipyard-docs` that generates all required files

## Impact

Without clear documentation:
- Users waste time debugging cryptic errors
- AI assistants cannot reliably help users set up Shipyard
- First-time users may abandon the project due to frustration
