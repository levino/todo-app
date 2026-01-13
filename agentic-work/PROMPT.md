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
- `.claude/CLAUDE.md` - Project guidelines (TDD, PocketBase rules!)

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
1. **Write a failing integration test FIRST** (not E2E!)
2. Run the test to confirm it fails: `POCKETBASE_URL=http://localhost:8090 npm run test:bare -- --run`
3. Write code to make the test pass
4. **RUN THE TESTS AGAIN** to verify they pass
5. Only mark task as complete if tests pass

**Integration Tests (PRIMARY):**
- Use Vitest with real PocketBase API (no mocks!)
- Test API endpoints and data layer thoroughly
- Tests must be extensive - cover edge cases
- **YOU MUST RUN `npm run test:bare -- --run` AND SEE TESTS PASS**

**E2E Tests (OPTIONAL):**
- Playwright tests are slow and heavy
- Only write E2E tests for critical user flows
- Integration tests cover most functionality
- Do NOT write E2E tests for every feature

**PocketBase Schema Changes:**
- **Never write migration SQL by hand!**
- Use `/create-collection` skill or write temporary JS with `pb.collections.create()`
- PocketBase generates the migration automatically

**Verification Checklist (before marking task complete):**
- [ ] Integration tests written and passing
- [ ] `npm run test:bare -- --run` shows green
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
- **RUN THE TESTS**: You MUST run `npm run test:bare -- --run` and verify tests pass before marking complete
- **Integration tests over E2E**: Write extensive Vitest integration tests, E2E is optional
- **One task, fully completed**: Pick one task and complete it fully before session ends
- **Never leave tasks half-done**: Only mark as `blocked` if truly blocked
- **No scope creep**: Only add new tasks if absolutely necessary to complete existing work
- **Always commit**: Leave codebase in clean, working state
- **Verify before committing**: Tests green + build passes = ready to commit
- **Update history**: Document what was done for future sessions

## Project-Specific Notes

### Technology Stack
- **Framework**: Astro with SSR (Shipyard template)
- **Backend**: PocketBase (Docker container)
- **Language**: TypeScript
- **Styling**: Tailwind CSS / DaisyUI
- **Tests**: Vitest (Integration - PRIMARY) + Playwright (E2E - optional)

### Important Commands
```bash
# Start PocketBase
docker compose up -d pocketbase-dev

# Get container IP for scripts
docker network inspect shipyard-pocketbase-template_default --format '{{range .Containers}}{{.IPv4Address}}{{end}}'

# Start dev server
npm run dev:bare

# Run tests
npm run test:bare

# Build
npm run build
```

### Architecture (from app-description.md)
- **Kiosk Mode**: Extremely reduced UI for children (only check off tasks)
- **MCP Server**: Admin API for parents (no traditional admin UI)
- **Groups/Families**: Multiple admins + non-login users (children)
- **Time-based visibility**: Routines (morning, school, afternoon, evening)
- **Gamification**: Achievements defined in code, not in DB

### PocketBase Rules (from CLAUDE.md)
- **Never mock PocketBase** - Tests run against real instance
- **Schema changes only via API** - Use `/create-collection` or `pb.collections.create()`
- **PocketBase internal only** - Not publicly exposed

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
