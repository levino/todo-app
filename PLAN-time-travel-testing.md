# Plan: Time Travel Testing

## Problem

We can't test the schedule-to-task flow because:
- Schedule manager runs every 10 minutes
- Tasks appear based on real time
- No way to "fast forward" to see if Thursday's task shows up

## Design

### PocketBase Test Endpoints

Add two endpoints that only exist when `TEST_MODE=true` (not registered at all otherwise):

- `POST /api/test/set-time` - Set the fake time for the PocketBase instance
- `POST /api/test/trigger-schedules` - Force the schedule manager to run immediately

Internally, use dependency injection for the clock. The fake clock is only instantiated when `TEST_MODE=true`. In production, these endpoints don't exist and the system uses real time.

### Frontend Tests with Astro Container API

Use `vi.setSystemTime()` to control frontend time in integration tests. The Astro Container API lets us render pages and check the HTML output without a browser.

Both time sources (PocketBase and Vitest) are set from the same test.

## Test Scenario

One integration test that covers the full flow:

1. Create user, group, child via MCP
2. Set time to Sunday midnight (both PocketBase and Vitest)
3. Create schedule "Geige üben" for Thursday morning via MCP
4. Set time to Thursday 08:00
5. Trigger schedule manager
6. Verify task exists via MCP `list_tasks`
7. Render tasks page with Astro Container
8. Verify task appears in HTML
9. Set time to Thursday 15:00
10. Render tasks page again
11. Verify morning task is NOT visible (timePeriod filtering)
12. Complete the task via Kiosk API (like a kid would)
13. Set time to next Thursday 08:00
14. Trigger schedule manager
15. Verify new task was generated

This single test proves the entire schedule system works end-to-end.
