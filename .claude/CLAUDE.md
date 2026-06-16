# Project Rules

## Architecture (read this first)

This is an npm-workspaces **monorepo**. The data layer is **SQLite** — there is
no PocketBase, no separate database server.

- `@family-todo/db` (`packages/db`) — the shared data layer: `better-sqlite3`,
  **raw SQL**, numbered migrations in `packages/db/migrations/`. Imported
  directly (in-process) by both runtime services.
- `@family-todo/frontend` (`packages/frontend`) — Astro SSR. Kiosk UI for
  children + a minimal admin page. Auth comes from an `oauth2-proxy` (OIDC /
  ZITADEL) that injects a trusted `X-Forwarded-Email` header.
- `@family-todo/mcp` (`packages/mcp`) — Express MCP server (JSON-RPC over HTTP)
  that AI agents call. Own OAuth 2.0 authorization server (PKCE + RS256 JWT).
- `@family-todo/docs` (`packages/docs`) — documentation site.

Frontend and MCP run as separate processes sharing **one SQLite file**
(`DB_PATH`, default `./data/app.db`), in WAL mode.

## Test-Driven Development (TDD)

**No code changes without a failing test!**

1. First write a test that fails
2. **RUN THE TESTS** to confirm the test actually fails: `npm test`
3. Only THEN change the production code — the minimum needed to make the test pass
4. **RUN THE TESTS** again to verify they pass
5. Refactor only when tests are green

This applies to all bug fixes and new features.

**CRITICAL: NEVER write production code and tests in the same step!** The whole
point of TDD is that you SEE the test fail first. Writing both together defeats
the purpose — you can't know your test actually catches the bug if you never saw
it fail. This is non-negotiable.

**NEVER verify behavior by hand.** Do not "check it works" with one-off scripts,
manual `curl`, or throwaway commands that you don't commit. Every check that
matters must be written as an automated test that lives in the repo and runs in
CI on every change. If you find yourself reproducing something manually to gain
confidence, that reproduction belongs in the test suite. Manual checks are
invisible to the next person and silently rot.

## Testing Strategy

Tests run **in-process against in-memory SQLite** — no Docker, no external
services, no network. This is what CI runs (`npm run test --workspaces`).

```bash
npm test               # every workspace (matches CI)
npm run test:db        # @family-todo/db
npm run test:mcp       # @family-todo/mcp
npm run test:frontend  # @family-todo/frontend
```

### Test Types and File Naming

| Type | File Pattern | Purpose |
|------|--------------|---------|
| **Unit Tests** | `*.test.ts` | Pure logic, no side effects |
| **Integration Tests** | `*.integration.test.ts` | Astro Container API + real SQLite (in-memory) |
| **E2E Tests** | `tests/e2e/*.spec.ts` | Playwright (optional, currently needs rewiring) |

### Unit Tests (`*.test.ts`)

- Pure functions, utilities, helpers (e.g. recurrence math, view-row splitting)
- No side effects, no network calls — fast and isolated

### Integration Tests (`*.integration.test.ts`) — PRIMARY!

**This is the main test type. Write extensive integration tests for all features.**

- Use the **Astro Container API** to render pages/components.
- Talk to a **real SQLite database** — never mock the data layer. Tests use a
  fresh in-memory database (`createDb(':memory:')` / `resetDb()` from
  `@family-todo/db`) with all migrations applied. `tests/setup.integration.ts`
  resets the DB before each test so every test starts clean.
- Seed data through `@family-todo/db` functions (or the PocketBase-compatible
  `tests/pb-shim.ts` helper, which translates the old collection API to raw SQL
  against the same in-memory DB).

**Example: Testing an Astro Page with the Container API**

```typescript
// src/pages/stats.integration.test.ts
import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { describe, expect, it, beforeEach } from 'vitest'
import { getDb, createChild } from '@family-todo/db'
import StatsPage from './stats.astro'

describe('Stats Page', () => {
  beforeEach(() => {
    // The integration setup resets an in-memory DB before each test.
    const db = getDb()
    createChild(db, { /* ... */ })
  })

  it('renders data from the database', async () => {
    const container = await AstroContainer.create()
    const html = await container.renderToString(StatsPage)
    expect(html).toContain('data-testid="stats-page"')
  })
})
```

**Required: `vitest.config.ts` uses Astro's `getViteConfig`** so Vitest can parse
`.astro` files.

### E2E Tests — optional, currently not in CI

Playwright specs live in `packages/frontend/tests/e2e`. They predate the
SQLite/oauth2-proxy migration and need rewiring before use; they are not part of
CI. Integration tests cover functionality. Only invest in E2E for critical user
flows once they are wired to the current stack.

## One Page → One SQL View

**Each page reads from exactly one read model optimized for it.**

A view is a SQL `SELECT` that runs inside SQLite. Filters, JOINs and aggregates
(`SUM`, `COUNT`) execute in the database — far faster than fetching multiple
tables and combining in JavaScript. The page calls one helper, then groups
client-side.

### Rules

1. **One page → one view (or one query helper).** No `for`-loop of sequential
   per-row queries. If a page needs data from several tables, a SQL view with
   JOINs resolves it in one read.
2. **Aggregate in SQL, not in the client.** `SUM(points)` as a subquery in the
   view, not `getFullList` + `reduce` in the frontend.
3. **Add indexes** for columns the view filters, joins or sorts on (including
   inside subqueries). Define them in the migration alongside the view.
4. **Denormalization is allowed but not required.** If a view with JOINs and
   subqueries stays clean, that's enough.

### Naming convention

- View named after the page: `tasks_page_view`, `stats_page_view`, …
- Column prefixes mirror the base table: `child_name`, `task_title`, `group_id`
  — so it's clear in the client where each field came from.

### Example

The tasks page (`src/pages/group/[groupId]/tasks/index.astro`) uses
`tasks_page_view` (a `LEFT JOIN` between `children` and `tasks`, with a
`SUM(points)` subquery on `point_transactions`), fetched via
`getTasksPageViewForGroup` from `@family-todo/db`. The page does one read and
splits the rows client-side (`splitViewRowsByChild` in `src/lib/tasks.ts`) into
active / completed / future.

## Database Schema Changes

Schema lives in `packages/db/migrations/` as numbered `NNN_description.sql`
files. On first connection, `@family-todo/db` applies any unapplied migrations
in filename order and records them in `schema_migrations`.

To change the schema:

1. Add a **new** `NNN_description.sql` file (next number). Use real SQL column
   types; create page-specific read models as SQL `CREATE VIEW`s here too.
2. Add or extend a test in `packages/db/src/*.test.ts` (TDD — write it failing
   first).
3. **Never edit a migration that has already been applied.** Forward-only.

> `packages/db/scripts/migrate-from-pocketbase.ts` is a one-off importer kept for
> history. The app no longer uses PocketBase; do not add to it.

## Development Workflow

```bash
npm install            # install all workspaces

npm run dev            # frontend (:4321) + mcp (:3001) against ./data/app.db

# single workspace
npm run dev -w @family-todo/frontend
npm run dev -w @family-todo/mcp

npm test               # run before every commit
```

Local auth: the frontend expects an `oauth2-proxy` in front of it injecting
`X-Forwarded-Email`. Without one, protected pages redirect to `/login`. The MCP
server can be exercised directly during development with a `?token=<userId>`
query parameter. See `deploy/overlays/production` for the real proxy config.
