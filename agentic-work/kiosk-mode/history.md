# Kiosk Mode - History

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
