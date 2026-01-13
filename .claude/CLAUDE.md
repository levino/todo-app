# Project Rules

## Test-Driven Development (TDD)

**No code changes without a failing test!**

1. First write a test that fails
2. Then change the code to make the test pass
3. Refactor only when tests are green
4. **RUN THE TESTS** to verify they pass: `npm run docker:test`

This applies to all bug fixes and new features.

**IMPORTANT:** Never run `npm run test:bare` directly on the host machine. Tests require Docker networking to reach `pocketbase-test`. Always use `npm run docker:test` which runs tests inside a container.

## Testing Strategy

### Test Types and File Naming

| Type | File Pattern | Runs In | Purpose |
|------|--------------|---------|---------|
| **Unit Tests** | `*.test.ts` | Anywhere | Pure logic, no side effects, no API |
| **Integration Tests** | `*.integration.test.ts` | Docker Compose | Astro Container API + real PocketBase |
| **E2E Tests** | `*.e2e.test.ts` | Docker Compose | Playwright browser tests (optional) |

### Unit Tests (`*.test.ts`)

- Pure functions, utilities, helpers
- No side effects, no network calls
- Can run anywhere (no Docker needed)
- Fast and isolated

### Integration Tests (`*.integration.test.ts`) - PRIMARY!

**This is the main test type. Write extensive integration tests for all features.**

- Use **Astro Container API** to test pages/components
- Connect to **real PocketBase API** (no mocks!)
- Must run inside Docker Compose (containers talk to each other)
- Test the full stack: page rendering → API calls → database

```bash
# Run tests (resets test DB, runs inside container where pocketbase-test is accessible)
npm run docker:test
```

**Script naming convention:**
- `npm run docker:test` → Resets test DB, runs tests in Docker container with network access
- `npm run test:bare` → **DO NOT USE DIRECTLY** - only runs inside Docker container

**Example: Testing an Astro Page with Container API**

```typescript
// src/pages/stats.integration.test.ts
import { experimental_AstroContainer as AstroContainer } from 'astro/container'
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import PocketBase from 'pocketbase'
import StatsPage from './stats.astro'

const POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://pocketbase-test:8090'

describe('Stats Page', () => {
  let pb: PocketBase
  let container: AstroContainer
  let testDataIds: string[] = []

  beforeAll(async () => {
    // 1. Setup PocketBase client and auth
    pb = new PocketBase(POCKETBASE_URL)
    await pb.collection('_superusers').authWithPassword('admin@test.local', 'testtest123')

    // 2. Create test data in PocketBase
    const task = await pb.collection('kiosk_tasks').create({ title: 'Test Task', ... })
    testDataIds.push(task.id)

    // 3. Create Astro container for rendering pages
    container = await AstroContainer.create()
  })

  afterAll(async () => {
    // Clean up test data
    for (const id of testDataIds) {
      try { await pb.collection('kiosk_tasks').delete(id) } catch {}
    }
  })

  it('should render the page with data from PocketBase', async () => {
    // Render the Astro page to HTML string
    const html = await container.renderToString(StatsPage)

    // Assert on the rendered HTML
    expect(html).toContain('data-testid="stats-page"')
    expect(html).toContain('Total tasks:')
  })
})
```

**Key Points:**
1. Import the page directly: `import StatsPage from './stats.astro'`
2. Create container: `container = await AstroContainer.create()`
3. Render to string: `await container.renderToString(StatsPage)`
4. Assert on the HTML output

**Required: vitest.config.ts must use Astro's getViteConfig:**
```typescript
import { getViteConfig } from 'astro/config'

export default getViteConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.integration.test.ts'],
    // ... other config
  },
})
```
This enables Vitest to parse `.astro` files.

**Database Reset:** The `tests/setup.integration.ts` file runs `beforeEach` to:
1. Reset the PocketBase singleton (ensures correct URL)
2. Clear all records from all collections (respecting FK order)

This ensures each test starts with a clean database.

### E2E Tests (`*.e2e.test.ts`) - NOT NEEDED NOW

- Playwright browser automation
- Run inside Docker Compose
- **Not required at this stage** - integration tests cover functionality
- Only add later for critical user flows if needed

## PocketBase Database Schema Changes

**Never write migration SQL by hand!**

When you need to alter the database schema (create/update/delete collections), use the `/create-collection` skill or follow this process:

1. Write a temporary JavaScript file that uses `pb.collections.create()` (or `.update()` / `.delete()`)
2. Run it with `node <file>.js`
3. PocketBase automatically generates the migration file in `pocketbase/pb_migrations/`
4. Delete the temporary file
5. Commit the generated migration

### Example

```javascript
// temp-collection.js
import PocketBase from 'pocketbase'

const pb = new PocketBase('http://<CONTAINER_IP>:8090')
await pb.collection('_superusers').authWithPassword('admin@test.local', 'testtest123')

await pb.collections.create({
  name: 'my_collection',
  type: 'base',
  fields: [
    { name: 'title', type: 'text', required: true },
  ],
})

console.log('Done!')
```

Then: `node temp-collection.js && rm temp-collection.js`

### Why This Approach

- PocketBase generates correct internal IDs
- Proper migration format with rollback functions
- No risk of SQL errors from manual migrations
- Type-safe field definitions

## PocketBase Testing

**Never mock PocketBase!**

- Tests run against real PocketBase instance (pocketbase-test in Docker Compose)
- No `vi.mock('pocketbase')` or similar
- Integration tests ensure real-world behavior

## Development Workflow

```bash
# Start PocketBase for development
docker compose up -d pocketbase-dev

# Get container IP for migration scripts
docker network inspect levino-todo-app_default --format '{{range .Containers}}{{.IPv4Address}}{{end}}'

# Start dev server (requires POCKETBASE_URL env var)
POCKETBASE_URL=http://localhost:8090 npm run dev:bare

# Run tests (ALWAYS use docker:test, never test:bare directly!)
npm run docker:test
```
