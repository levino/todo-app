# Kiosk Mode - History

## 2026-01-13: Task kiosk-page-with-task-list completed

### What was done
- Created PocketBase collections via API (not manual SQL):
  - `groups` - Family/group container
  - `children` - Child profiles with avatar and group relation
  - `kiosk_tasks` - Tasks assigned to children with priority
- Implemented `/kiosk/[childId]` page with:
  - Child header with avatar and name
  - Read-only task list sorted by priority
  - Large readable text (text-xl to text-2xl)
  - Touch-friendly task items (min-height 56px)
  - German UI text
- Added integration tests for data access
- Added E2E test skeleton (requires Playwright browsers)

### Decisions
1. **Collection naming**: Used `kiosk_tasks` instead of `tasks` to avoid conflict with existing `todos` collection
2. **Access rules**: `kiosk_tasks` has public read/update for kiosk mode (no auth), but create/delete is superusers only
3. **Touch targets**: Set min-height to 56px (exceeds 44px requirement for comfortable tapping)
4. **Sorting**: Using `priority,-created` to sort by priority first, then newest first within same priority

### Tips for the next developer
- The child switcher needs the group ID to fetch siblings - the child record has a `group` relation
- Consider using query param `?child=xxx` instead of path param for easier switching without full page reload
- E2E tests need `npx playwright install` or run via Docker (`npm run docker:test`)

---

## 2026-01-13: Initial Planning

### What was done
- Created feature description (feature.md)
- Defined task list with 10 tasks
- Established dependencies between tasks

### Decisions
1. **Data model**: Simple structure with groups, children, tasks
2. **Order**: Schema first, then client, then UI
3. **TDD consistently**: Every UI task starts with a test

### Tips for the next developer
- Read `app-description.md` first for overall context
- PocketBase runs via `docker compose up -d pocketbase-dev`
- Never mock PocketBase - tests run against real instance
- For schema changes: use `/create-collection` skill
