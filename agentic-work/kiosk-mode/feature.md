# Feature: Kiosk Mode (Children UI)

## Summary

An extremely reduced kiosk mode for children, running on a shared family tablet. Children can ONLY see their own tasks and check them off - no distractions, no editing capabilities.

## Problem

Existing to-do apps (e.g. Todoist) are not suitable for children:
- Too many editing options
- Too many UI elements
- Children get distracted by buttons, emojis, title editing
- They "play" with the app instead of completing tasks

## Goal

Children should focus on ONE action: **check off the task**.

## Users

### Children (Kiosk Users)
- No accounts, no authentication
- Use shared family tablet
- Want to quickly see what needs to be done
- Need clear, simple interface

### Parents (Admins)
- Manage tasks via MCP server (later)
- For this feature: seed data via migrations

## User Stories

### Child selects themselves
**As a child** I want to see only my own tasks, not my sibling's.

**Behavior:**
- Simple child selection (tabs or avatars)
- Optimized for landscape mode on iPad
- Each child sees only their assigned tasks

### Child sees task list
**As a child** I want to see my tasks in a clear list.

**Behavior:**
- Read-only task list
- No editing, no reordering
- Clear, large font
- Sorting: priority (if defined), then random for equal priority

### Child checks off task
**As a child** I want to mark a task as done with one click.

**Behavior:**
- Checkbox or button to check off
- After checking: short animation (fade-out)
- Task disappears from the list
- Confirming visual feedback

## Technical Requirements

### No JavaScript in Browser
- Pure HTML with `<form method="POST">`
- Server-Side Rendering with Astro
- DaisyUI for styling
- Astro View Transitions for animations

### Data Model (PocketBase)

#### Collection: `groups`
| Field | Type | Description |
|-------|------|-------------|
| name | text | Group name (e.g. "Miller Family") |

#### Collection: `children`
| Field | Type | Description |
|-------|------|-------------|
| name | text | Child's name |
| group | relation | → groups |
| avatar | text | Emoji or image path (optional) |

#### Collection: `tasks`
| Field | Type | Description |
|-------|------|-------------|
| title | text | Task title |
| child | relation | → children |
| priority | number | Sort priority (optional) |
| completed | bool | Completed status |
| completedAt | date | When completed |

## Acceptance Criteria

- [ ] Child selection works (tab/avatar)
- [ ] Task list shows only tasks of selected child
- [ ] Tasks can be checked off (POST request)
- [ ] After checking, task disappears with animation
- [ ] No JavaScript interaction in browser
- [ ] Responsive for tablet (landscape)
- [ ] Tests present (TDD!)

## Out of Scope (for later)

- MCP server for admin operations
- Time-based visibility (routines)
- Recurring tasks
- Gamification/achievements
- Real authentication
