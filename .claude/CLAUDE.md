# Project Rules

<stack>
- Node 22+, TypeScript with `--experimental-strip-types` (no compile step for the server)
- Single Node process: Express shell, Hono for API routes, Astro SSR for pages
- better-sqlite3 for the database, WAL mode, in-process, synchronous
- jose for JWTs, Anthropic SDK for the chat agentic loop, MCP SDK for tool exposure
- Vitest for tests, Astro Container API for page tests, temp SQLite for DB tests
</stack>

<tdd>
**No code changes without a failing test.**

1. Write a test that fails
2. Run `npm test` and SEE it fail
3. Write the minimum production code to make it pass
4. Run `npm test` again to verify it's green
5. Refactor only when green

**NEVER write production code and tests in the same step.** Seeing the failure is the whole point.

Applies to bug fixes and new features. Does not apply to pure scaffolding (config files, Dockerfile, k8s manifests, CI yaml).
</tdd>

<functional-style>
- Pure functions over classes (levino-coding preference)
- Functions take `db: Database.Database` as the first argument — no module-level singletons
- Domain layer is side-effect-free apart from SQLite calls
- No `async/await` where it is not required — better-sqlite3 is synchronous
- Tools use the DI-currying pattern: `toolXxx(deps, user)(input)` — see `src/tools.ts`
</functional-style>

<database>
- Schema lives in `src/db.ts` via `runMigrations(db)` — plain `CREATE TABLE IF NOT EXISTS` SQL in code
- No hand-written migration files, no ORM, no PocketBase
- Foreign keys are ON by default (PRAGMA foreign_keys = ON)
- Production data lives at `/data/db.sqlite` (mounted PVC in k3s)
- Tests open `:memory:` or a temp file per-test for isolation
</database>

<testing>
- Unit tests: `*.test.ts`, pure logic, temp SQLite, fast, no network
- Integration tests: `*.integration.test.ts`, Astro Container API rendering real pages against a temp SQLite
- No Docker needed for tests anymore — everything in-process
- Run: `npm test`
- Never mock SQLite, never mock the MCP SDK, never mock the Anthropic SDK at the DB layer — use real `:memory:` DBs and fake the Anthropic client at the boundary only when strictly needed
</testing>

<tools-layer>
Tools are the single source of truth for business logic reachable from both the chat loop and the MCP server.

```ts
export function toolListTasks(deps: ToolDeps, user: User) {
  return (input: z.infer<typeof listTasksInput>) =>
    listTasks(deps.db, user.sub, input)
}
```

- Define the zod schema alongside the tool factory
- Authenticated tools curry over `(deps, user)`, unauthenticated over `(deps)`
- `executeTool(name, input, deps, user)` dispatches to the right factory in both paths
- Adding a tool = edit `src/tools.ts` once — MCP and chat both pick it up
</tools-layer>

<process-shape>
Single Node process listening on one port:

```
Express :3000
  ├── /mcp            → Hono → MCP Streamable HTTP (per-request McpServer)
  ├── /api/chat       → Hono → Haiku agentic loop
  ├── /oauth/*        → Hono → PKCE + DCR
  ├── /auth/*         → Hono → GitHub OAuth + magic link
  ├── /.well-known/*  → Hono → OIDC metadata + JWKS
  ├── static assets   → express.static(dist/client)
  └── catch-all       → Astro node adapter handler (LAST)
```

Order is load-bearing: Astro must be LAST, otherwise it swallows `/api` and `/mcp`.

Dev runs two processes: `astro dev` on 4321 (with vite.proxy forwarding API paths to 3000) and the Express server on 3000 via `node --watch`. Production is a single `node src/index.ts` after `astro build`.
</process-shape>

<auth>
- JWTs signed RS256 (jose), public key used to verify both web sessions and MCP bearer tokens
- Same token format everywhere — no separate MCP token type
- GitHub OAuth for login, magic link via AWS SES as a fallback
- In local dev, magic-link emails are intercepted and logged to the console instead of sent
- `verifyToken` runs once at the edge of the request handler; tools close over the verified user
- Haiku never sees the raw token
</auth>

<no-comments>
- Default to no comments
- Code explains WHAT, names explain WHY
- Only add a comment for a hidden constraint or surprising invariant
- No task/fix references in comments ("used by X", "fixes #123") — those go in the PR
</no-comments>
