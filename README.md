# Family Todo App

A family task-management app with an unusual split:

- **Parents administer everything by talking to an AI agent** (Claude, ChatGPT, …)
  through an **MCP server** — there is no traditional admin UI.
- **Children only ever check off their own tasks** in a deliberately locked-down
  **kiosk view** on a shared tablet — no login, no settings, no distractions.

See [`app-description.md`](./app-description.md) for the full product rationale.

## Architecture

This is an npm-workspaces **monorepo**. Two runtime services share a single
SQLite database file:

| Package | What it is | Port |
|---------|------------|------|
| [`@family-todo/frontend`](./packages/frontend) | Astro SSR app (Node adapter): kiosk view for children + a minimal admin page for parents | `3000` (prod) / `4321` (dev) |
| [`@family-todo/mcp`](./packages/mcp) | Express **MCP server** (JSON-RPC over HTTP) that AI agents call. Own OAuth 2.0 authorization server (PKCE + RS256 JWT) | `3001` |
| [`@family-todo/db`](./packages/db) | Shared **SQLite** data layer (`better-sqlite3`, raw SQL, numbered migrations). Imported directly by both services | — |
| [`@family-todo/docs`](./packages/docs) | Documentation site (Astro + Shipyard), deployed separately | — |

```
AI agent ──OAuth2/JSON-RPC──▶ mcp ──┐
                                     ├─▶ @family-todo/db ──▶ app.db (SQLite, WAL)
browser ──▶ oauth2-proxy ──▶ frontend ┘
            (ZITADEL OIDC)
```

**Authentication**

- The **frontend** runs behind an [`oauth2-proxy`](https://github.com/oauth2-proxy/oauth2-proxy)
  gatekeeper (OIDC via ZITADEL). The proxy injects a trusted `X-Forwarded-Email`
  header; the Astro middleware trusts it and upserts the user into SQLite.
  There is no in-app password handling.
- The **MCP server** is its own OAuth 2.0 authorization server for AI clients
  (dynamic client registration, PKCE, JWT access tokens signed RS256).

**Data** — a single SQLite file (`DB_PATH`, default `./data/app.db`) in WAL mode,
shared by the frontend and the MCP server on one volume.

## Project structure

```
packages/
  db/        # @family-todo/db   — SQLite data layer: migrations/ + raw-SQL modules
  frontend/  # @family-todo/frontend — Astro SSR (kiosk + admin)
  mcp/       # @family-todo/mcp   — MCP server (Express, OAuth2/JWT)
  docs/      # @family-todo/docs  — documentation site (Shipyard)
deploy/      # Kubernetes (Kustomize) production overlay, deployed by Flux
.github/workflows/ci.yml  # test every workspace; build & push frontend/mcp images
```

## Prerequisites

- Node.js 22+
- npm 10+ (workspaces)

No database server to install — SQLite is embedded via `better-sqlite3`.

## Setup

```bash
git clone https://github.com/levino/todo-app
cd todo-app
npm install
```

## Development

```bash
npm run dev
```

This starts the frontend (http://localhost:4321) and the MCP server
(http://localhost:3001) together, both pointed at a local SQLite file at
`./data/app.db`.

You can also run a single workspace:

```bash
npm run dev -w @family-todo/frontend
npm run dev -w @family-todo/mcp
npm run dev -w @family-todo/docs
```

**Note on auth in local dev:** the frontend expects an `oauth2-proxy` in front of
it that injects an `X-Forwarded-Email` header. Without one, protected pages
redirect to `/login`. For UI work, put a proxy in front (see
[`deploy/overlays/production`](./deploy/overlays/production) for the real
config) or send the header yourself. The MCP server can be called directly
during development with a `?token=<userId>` query parameter — see
[`packages/mcp`](./packages/mcp).

### Environment variables

| Variable | Used by | Default | Purpose |
|----------|---------|---------|---------|
| `DB_PATH` | frontend, mcp | `./data/app.db` | SQLite file path (must be the **same** for both services) |
| `MCP_INTERNAL_URL` | frontend | `http://localhost:3001` | Server-side URL of the MCP server |
| `PUBLIC_MCP_URL` | frontend | — | Public MCP URL shown to users on the admin page |
| `OAUTH_ISSUER` | mcp | `http://localhost:3001` | Public issuer URL of the MCP OAuth server |
| `FRONTEND_URL` | mcp | `http://localhost:4321` | Frontend URL (used in the OAuth login redirect) |
| `OAUTH_KEY_PATH` / `OAUTH_RSA_PRIVATE_KEY` | mcp | `./data/oauth-keys` | RS256 key material (auto-generated if absent) |
| `DEBUG_MCP` | mcp | `false` | Verbose request/response logging |

## Testing

All tests run **in-process against in-memory SQLite** — no Docker, no external
services.

```bash
npm test                       # every workspace (matches CI)
npm run test:db                # @family-todo/db
npm run test:mcp               # @family-todo/mcp
npm run test:frontend          # @family-todo/frontend
```

Test-Driven Development is required — see [`.claude/CLAUDE.md`](./.claude/CLAUDE.md).

> Playwright E2E specs live in `packages/frontend/tests/e2e` but currently assume
> the old setup and are **not run in CI**; they need rewiring to the
> SQLite/oauth2-proxy stack before use.

## Database schema changes

The schema lives in [`packages/db/migrations`](./packages/db/migrations) as
numbered `NNN_description.sql` files, applied in order on first connection and
tracked in a `schema_migrations` table.

To change the schema, add a **new** migration file and cover it with a test in
`packages/db/src/*.test.ts`. Never edit a migration that has already been
applied. Following the project's "one page → one SQL view" rule, page-specific
read models (e.g. `tasks_page_view`) are defined as SQL views inside these
migrations.

> `packages/db/scripts/migrate-from-pocketbase.ts` is a one-off importer kept for
> history — the app no longer uses PocketBase.

## Build

```bash
npm run build   # builds @family-todo/db, then frontend and mcp
```

## Deployment

Production runs on **Kubernetes**; manifests are in
[`deploy/overlays/production`](./deploy/overlays/production) (Kustomize) and are
applied by **Flux**. A single pod runs `oauth2-proxy` + `frontend` + `mcp`
sharing one SQLite PVC. Because `better-sqlite3` needs a single writer, the
deployment uses **one replica** with a `Recreate` strategy.

CI ([`.github/workflows/ci.yml`](./.github/workflows/ci.yml)) tests every
workspace, then on pushes to `main` builds and pushes
`ghcr.io/levino/todo-app-frontend` and `ghcr.io/levino/todo-app-mcp` (native
arm64). Flux pulls `:latest` and rolls out.

## License

MIT
