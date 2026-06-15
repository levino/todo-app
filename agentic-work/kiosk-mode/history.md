# Kiosk Mode - History

## 2026-01-13: Task all-tasks-done-celebration completed

### What was done
- Replaced plain "Keine Aufgaben!" with celebratory achievement UI
- Added large star emoji (🌟) at 8xl size
- German congratulation message: "Super gemacht!" / "Alle Aufgaben erledigt!"
- Uses green success color for heading
- Added E2E test for celebration display

### Decisions
1. **Emoji choice**: Star (🌟) - universally positive, not competitive like trophy
2. **Color**: Green (text-success) - positive, encouraging
3. **German text**: "Super gemacht!" as heading, "Alle Aufgaben erledigt!" as subtext
4. **Layout**: Centered, large text for easy reading

### Tips for the next developer
- The celebration shows immediately when no tasks exist
- Could add animations (bounce/pulse) for more fun
- Consider confetti effect via CSS animation

---

## 2026-01-13: Task child-checks-off-task completed

### What was done
- Created POST endpoint at `/kiosk/task/[taskId]/complete`
- Added large checkmark button (56x56px) to each task item
- Button uses DaisyUI btn-circle btn-success styling
- One-tap completion with no confirmation dialog
- Uses Post-Redirect-Get pattern (303 redirect back to kiosk page)
- Task marked as completed with timestamp, disappears from list

### Decisions
1. **Button style**: Large circular green checkmark button - very clear and child-friendly
2. **No undo**: Intentionally no way to undo - simplicity for children
3. **SSR approach**: Form POST with redirect, no JavaScript needed
4. **Hidden childId**: Passed via hidden form field to know where to redirect

### Tips for the next developer
- The completion animation can be added using Astro View Transitions
- The button uses aria-label for accessibility ("X erledigen")
- Test completion by running E2E tests (need Playwright browsers)

---

## 2026-01-13: Task child-switcher-integrated completed

### What was done
- Added child switcher navigation above the task list
- Fetches all siblings (children in the same group)
- Displays each child as a tab with avatar and name
- Selected child highlighted with `bg-primary` styling
- Switcher automatically hidden when only one child exists
- Added integration test for fetching siblings
- Added E2E tests for switcher visibility and navigation

### Decisions
1. **Position**: Switcher placed above task list (not on side) for simplicity
2. **Navigation**: Uses page navigation via links instead of client-side state (SSR approach)
3. **Touch targets**: Tabs have min-height 56px and min-width 120px for easy tapping
4. **Styling**: Uses DaisyUI's `bg-primary` for selected state, `bg-base-200` for others

### Tips for the next developer
- View Transitions could be added later for smoother child switching
- The sibling query uses the `group` field from the current child
- E2E tests require Playwright browsers to be installed

---

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
