# Family To-Do App – Product Specification (v1)

## 1. Goals & Motivation

Existing to-do apps (e.g. Todoist) are not suitable for children:
- they are too editable
- they expose too many UI controls
- children get distracted by editing titles, adding emojis, pressing buttons, and “playing” with the app instead of completing tasks

**Primary goal:**  
Create a family-focused to-do app where children can *only* focus on completing tasks, not interacting with the interface itself.

### Key principles
- extremely locked-down UI for children
- zero opportunity for UI play or customization
- minimal cognitive load
- administration without building a traditional admin UI

---

## 2. Users, Roles & Groups

### 2.1 Group / Family Concept
- the core unit is a **group** (initially: a family)
- a group can contain:
  - multiple **admins** (e.g. both parents)
  - multiple **non-login users** (e.g. children)

This structure should be flexible enough to later support other use cases (e.g. teams or companies), but the primary focus is family usage.

### 2.2 Admins (Parents)
- one or more admins per group
- admins:
  - do **not** manage tasks via UI
  - interact exclusively through an **MCP server API**
  - use AI agents (ChatGPT, Claude, etc.) which call the MCP API on their behalf

### 2.3 Children
- no accounts
- no authentication
- no personal devices
- use a **shared family tablet**
- interact only via **Kiosk Mode**

---

## 3. Core Architectural Decisions

- **No traditional admin UI**
  - admin UI is expensive and slow to build
  - mobile optimization avoided entirely
- **All CRUD operations via MCP server**
- **UI exists only where interaction is unavoidable**
- **Gamification & rule logic live in the codebase**, not the database
- **Only task completion events are persisted**

---

## 4. Kiosk Mode (Children UI)

### 4.1 Purpose
Kiosk Mode exists to:
- eliminate distractions
- prevent UI manipulation
- guide children toward one action: *complete the task*

### 4.2 General Characteristics
- read-only task list
- tasks can only be **checked off**
- no editing
- no reordering
- no settings
- no visual clutter

---

## 5. Kiosk Mode – User Stories (v1)

### 5.1 Child Selection / Filtering

**User Story:**  
As a child, I want to see *only my own tasks*, not my sibling’s.

**Behavior:**
- kiosk mode provides an easy way to switch between children
- options:
  - tabs
  - avatars
  - sidebar selector
- optimized for:
  - shared iPad
  - landscape orientation

Each child sees:
- only tasks assigned to them
- one clear list

---

### 5.2 Task List Ordering

**User Story:**  
As a child, I don’t care about strict priorities, but I want tasks to feel fair and approachable.

**Behavior:**
- tasks may have a priority value
- sorting rules:
  1. higher priority first (if defined)
  2. tasks with equal priority may be randomly ordered
- goal:
  - avoid the same task always being last
  - reduce decision pressure

---

### 5.3 Completing a Task

**User Story:**  
As a child, when I complete a task, it should feel satisfying and clear.

**Behavior:**
- checking a task does **not** instantly remove it
- instead:
  - a short animation plays (e.g. dissolve / fade-out)
  - then the task disappears

**Technical constraint:**
- web app (initially)
- minimal client-side JavaScript
- preferred approach:
  - HTML / HTTP POST (Astro form or action)
  - Astro page transition for animation

---

## 6. Time-Based Visibility (Routines)

### 6.1 Problem
Children should only see tasks that are relevant *right now*.
Seeing future or past tasks causes stress and overwhelm.

### 6.2 Solution: Time Periods / Routines

Instead of per-task due times, define **global time periods**:

Examples:
- Morning routine
- School routine
- Afternoon routine
- Evening routine
- Weekend

### 6.3 Task Assignment
- each task belongs to exactly one time period
- tasks are visible **only when the period is active**
- time periods are defined once and reused

---

## 7. Recurring Tasks

- tasks may be recurring (daily, school days, weekly, etc.)
- flow:
  1. task appears
  2. child completes it
  3. task disappears
  4. task reappears automatically in the next cycle

No manual reset required.

---

## 8. Gamification

### 8.1 Core Rule
Gamification is **not tied to the logged-in user**.

- kiosk mode may be technically logged in as a parent or family account
- achievements belong to the **child assigned to the task**

### 8.2 Examples
- “Practice violin” completed 5× in a week
  → Achievement: *Musician Star*
- small animation or sound when achievement is unlocked

---

## 9. Gamification Architecture

### 9.1 Where Logic Lives
- **not in the database**
- **not configurable via UI**
- **entirely in the codebase**

### 9.2 Rationale
- full control by the admin
- easy iteration via Git / AI
- no need to build rule editors
- achievements are relatively static compared to tasks

### 9.3 Stored in Code
- achievement definitions
- thresholds
- labels & copy
- animations / sounds
- mapping: task types → achievements

### 9.4 Stored via API
- task completion events
- timestamps
- child assignment

---

## 10. MCP Server (Admin API)

### 10.1 Purpose
- sole administrative interface
- acts like a REST-style API
- called by AI agents on behalf of admins

### 10.2 Responsibilities
- create tasks
- update tasks
- delete tasks
- assign tasks to children
- assign tasks to time periods

### 10.3 Self-Description
- MCP server exposes its own schema / capabilities
- AI agents can introspect:
  - available endpoints
  - supported operations
- no external markdown documentation required

---

## 11. Admin Page (Minimal)

### Purpose
- **not** an admin panel
- **not** for editing data

### Content
- MCP server URL
- authentication token / key (if applicable)
- copy-friendly output for AI agents

---

## 12. Technical Stack (Context)

- Frontend: Shipyard (Astro, SSR)
- Backend: PocketBase
- Language: TypeScript
- Tests: present (integration / E2E)
- UX-driven development, minimal UI surface

---

## 13. Guiding Principle

> Children need clarity.  
> Parents need flexibility.  
> UI is expensive. APIs and language are cheap.
