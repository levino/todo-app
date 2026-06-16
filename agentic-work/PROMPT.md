# Agentic Workflow Session

You are working in a Ralph Wiggum loop via Claude Code. Each iteration you perform these steps:

1. **Read state**: Load the task list and history
2. **Pick task**: Choose the highest priority pending task (or continue an in_progress task)
3. **Work**: Complete the task fully
4. **Update state**: Update tasks.json and history.md
5. **Commit**: Commit changes with a meaningful message
6. **Exit**: End the iteration (the loop restarts automatically)

## Your Workflow

### Step 1: Load Context

**FIRST**: Read `agentic-work/active-workflow.txt` to get the current workflow folder name.

Then read these files (replace `{workflow}` with the folder name from above):
- `app-description.md` - **READ FIRST!** Overall product specification - understand what we're building
- `agentic-work/{workflow}/feature.md` - Feature description from user/business perspective
- `agentic-work/{workflow}/tasks.json` - Current task list
- `agentic-work/{workflow}/history.md` - Recent session history
- `agentic-work/{workflow}/learnings.md` - Permanent knowledge base

Additionally check:
- Recent git log (last 10 commits) - run `git log --oneline -10`
- `.claude/CLAUDE.md` - Project guidelines (TDD, SQLite data layer, one-page-one-view)

### Step 2: Pick a Task

**FIRST**: Check if any task has status `in_progress` - if so, continue that task (it was interrupted).

If no in_progress tasks, choose the best `pending` task. **Use your own judgment** considering:
1. **Dependencies**: Tasks with `dependsOn` can only start when dependencies are `completed`
2. **Feature context**: What brings the most value for the feature (see feature.md)?
3. **Logical order**: What makes technical sense to build next?
4. **Context from history**: What was recently worked on? Is there momentum?

**There are no priorities** - you decide which task makes the most sense.

If no pending/in_progress tasks remain, output `<promise>COMPLETE</promise>` and exit.

### Step 3: Work on Task

**IMMEDIATELY** mark the task as `in_progress` in tasks.json before working. This ensures the next session knows where to continue if interrupted.

**CRITICAL - Test-Driven Development (TDD):**
1. **Write a failing integration test FIRST** in `*.integration.test.ts`
2. Run the test: `npm test` (runs in-process against in-memory SQLite — no Docker)
3. Write code to make the test pass
4. **RUN THE TESTS AGAIN** to verify they pass
5. Only mark task as complete if tests pass

**Test File Naming:**
- `*.test.ts` - Unit tests (pure logic, no API, no side effects)
- `*.integration.test.ts` - Integration tests (Astro Container + real in-memory SQLite) **← USE THIS!**
- `tests/e2e/*.spec.ts` - Playwright E2E tests (NOT needed now)

**Integration Tests (`*.integration.test.ts`) - PRIMARY:**
- Use Astro Container API to test pages/components
- Talk to a real SQLite database via `@family-todo/db` (no mocks!); the setup
  resets a fresh in-memory DB before each test
- Tests must be extensive - cover all functionality and edge cases
- **YOU MUST RUN `npm test` AND SEE TESTS PASS**

**E2E Tests - NOT NEEDED:**
- Do NOT write E2E tests at this stage
- Integration tests cover functionality
- E2E tests are for later (critical user flows only)

**Database Schema Changes:**
- Schema lives in `packages/db/migrations/` as numbered `NNN_description.sql` files
- Add a **new** migration file (forward-only); never edit an applied one
- Cover it with a test in `packages/db/src/*.test.ts`

**Verification Checklist (before marking task complete):**
- [ ] Integration tests written in `*.integration.test.ts`
- [ ] Tests run and pass: `npm test`
- [ ] `npm run build` succeeds
- [ ] Code actually works (verified by tests!)

Additional rules:
- **Complete the task fully** - don't leave it half-done
- Only mark as `blocked` if you truly cannot continue

### Step 4: Update State

After completing work (use the `{workflow}` folder from Step 1):
- Update task status in `agentic-work/{workflow}/tasks.json`:
  - `completed` if done (set completedAt to current timestamp)
  - `in_progress` if more work needed
  - `blocked` if blocked
- **Add new tasks** ONLY if absolutely necessary to complete existing tasks:
  - Only add tasks that are direct prerequisites or blockers for current work
  - DO NOT invent new features or expand scope
- Add notes about what was done
- Append session summary to `agentic-work/{workflow}/history.md` with:
  - What was done
  - **Tips for the next developer** - pitfalls, things to watch out for
  - Decisions made and why

### Step 5: Commit Changes

- Stage and commit all changes
- Use meaningful commit messages
- Reference task ID in commit message

### Step 6: Exit

If **no pending tasks remain** (all completed or blocked), output:
```
<promise>COMPLETE</promise>
```
This signals the loop to stop. Otherwise just end your session normally and the loop continues.

## Important Rules

- **TDD is mandatory**: Test first, then code. No exceptions.
- **RUN THE TESTS**: You MUST run `npm test` and verify tests pass before marking complete
- **Integration tests over E2E**: Write extensive Vitest integration tests, E2E is optional
- **One task, fully completed**: Pick one task and complete it fully before session ends
- **Never leave tasks half-done**: Only mark as `blocked` if truly blocked
- **No scope creep**: Only add new tasks if absolutely necessary to complete existing work
- **Always commit**: Leave codebase in clean, working state
- **Verify before committing**: Tests green + build passes = ready to commit
- **Update history**: Document what was done for future sessions

## Project-Specific Notes

### Technology Stack
- **Framework**: Astro with SSR (Shipyard)
- **Data layer**: SQLite via `@family-todo/db` (better-sqlite3, raw SQL)
- **Admin API**: MCP server (Express, OAuth 2.0 + RS256 JWT)
- **Auth**: oauth2-proxy (OIDC / ZITADEL) in front of the frontend
- **Language**: TypeScript
- **Styling**: Tailwind CSS / DaisyUI
- **Tests**: Vitest (Integration - PRIMARY) + Playwright (E2E - optional)

### Important Commands
```bash
# Install all workspaces
npm install

# Start dev (frontend :4321 + mcp :3001 against ./data/app.db)
npm run dev

# Run tests (in-memory SQLite, no Docker)
npm test

# Build
npm run build
```

### Architecture (from app-description.md)
- **Kiosk Mode**: Extremely reduced UI for children (only check off tasks)
- **MCP Server**: Admin API for parents (no traditional admin UI)
- **Groups/Families**: Multiple admins + non-login users (children)
- **Time-based visibility**: Routines (morning, school, afternoon, evening)
- **Gamification**: Achievements defined in code, not in DB

### Data Layer Rules (from CLAUDE.md)
- **Never mock the data layer** - Tests run against a real (in-memory) SQLite DB
- **Schema changes via migrations** - Add a new `NNN_*.sql` in `packages/db/migrations/`
- **One page → one SQL view** - Aggregate in SQL, group client-side

## Example Session Output

```
Reading active workflow: kiosk-mode
Reading app-description.md for overall context...
Reading feature description...

Picking task: implement-kiosk-task-list
Reasoning: Dependencies met, foundation for further tasks

[Writing test first...]
[Test fails...]
[Implementing feature...]
[Tests green!]

Task completed. Committing changes...
```

When all tasks are done:
```
All tasks completed!

<promise>COMPLETE</promise>
```
