# Project Rules

## Test-Driven Development (TDD)

**No code changes without a failing test!**

1. First write a test that fails
2. Then change the code to make the test pass
3. Refactor only when tests are green
4. **RUN THE TESTS** to verify they pass: `npm run test:bare -- --run`

This applies to all bug fixes and new features.

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
# Run tests (starts Docker Compose, runs inside container where pocketbase-test is accessible)
npm test

# Or if already inside Docker network:
npm run test:bare
```

**Script naming convention:**
- `npm test` → Wraps in Docker Compose, runs in container with network access
- `npm run test:bare` → Runs directly (use when already in Docker network)

Example:
```typescript
// src/features/kiosk.integration.test.ts
import PocketBase from 'pocketbase'
import { describe, expect, it, beforeAll } from 'vitest'

const POCKETBASE_URL = process.env.POCKETBASE_URL || 'http://pocketbase-test:8090'

describe('Kiosk Tasks', () => {
  let pb: PocketBase

  beforeAll(async () => {
    pb = new PocketBase(POCKETBASE_URL)
    await pb.collection('_superusers').authWithPassword('admin@test.local', 'testtest123')
  })

  it('should fetch tasks for a child', async () => {
    // Test real API behavior - no mocks!
  })
})
```

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
# Start PocketBase
docker compose up -d pocketbase-dev

# Get container IP for scripts
docker network inspect shipyard-pocketbase-template_default --format '{{range .Containers}}{{.IPv4Address}}{{end}}'

# Start dev server
npm run dev:bare

# Run tests
npm run test:bare
```
