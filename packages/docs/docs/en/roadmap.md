---
title: Roadmap
description: Planned features and development
---

# Roadmap

Family Todo is actively developed. Here are the planned features.

## Phase 1: Recurring Tasks ✅

**Status: Implemented**

Many tasks repeat daily or weekly. With recurring tasks, these only need to be defined once.

### Features

- **Daily Tasks**: Automatically reset at midnight. Complete them today, they'll be back tomorrow!
- **Weekly Tasks**: Select specific days (e.g., school days only Mon-Fri)
- **Smart Reset**: Use `reset_recurring_tasks` MCP tool to reset all recurring tasks at once

### MCP Tools

```
create_task - Now supports recurrence and daysOfWeek parameters
  - recurrence: "none" | "daily" | "weekly"
  - daysOfWeek: [0-6] array (0=Sunday, 6=Saturday)

reset_recurring_tasks - Reset all completed recurring tasks
  - Resets daily tasks completed before today
  - Resets weekly tasks on their scheduled days
```

### Example Interaction

> "Create a daily task 'Brush teeth' for Max that appears every morning"

> "Lisa should have 'Practice piano' as a task every Monday and Wednesday"

> "Reset all recurring tasks for the family"

---

## Phase 2: Time Periods ✅

**Status: Implemented**

Tasks for specific times of day – Morning, Afternoon, Evening.

### Features

- **Three Time Periods**: Morning (6-12), Afternoon (12-18), Evening (18-22)
- **Visual Grouping**: Kiosk view shows tasks grouped by time of day with icons
- **Flexible Display**: Tasks without a time period show in "All Day" section

### Time Period Icons

```
🌅 Morning (Morgen) - 6:00 AM - 12:00 PM
☀️ Afternoon (Nachmittag) - 12:00 PM - 6:00 PM
🌙 Evening (Abend) - 6:00 PM - 10:00 PM
📋 All Day (Ganztägig) - No specific time
```

### MCP Tools

```
create_task - Now supports timePeriod parameter
  - timePeriod: "morning" | "afternoon" | "evening" | "" (empty = all day)

list_tasks - Now supports filtering by timePeriod and recurrence
```

### Example Interaction

> "Show me only Max's morning tasks"

> "Add 'Homework' as an afternoon task for Lisa"

> "Create an evening task 'Put on pajamas' for all children"

---

## Phase 3: Reward System 🏆

**Status: Idea**

Motivation through points and rewards.

### Ideas

- Points for completed tasks
- Weekly/monthly goals
- Virtual or real rewards
- Family leaderboard

---

## Phase 4: Notifications 📱

**Status: Idea**

Push notifications for parents.

### Ideas

- Daily summary
- Notification when all tasks are completed
- Reminders for overdue tasks

---

## Phase 5: Multi-Family 👨‍👩‍👧‍👦

**Status: Idea**

Support for more complex family situations.

### Ideas

- Shared children between households
- Different tasks per household
- Synchronization between parents

---

## Feedback

Do you have ideas or requests?

- Open a [GitHub Issue](https://github.com/levino/todo-app/issues)
- Or ask Claude: *"What features would you like for Family Todo?"* 😉

## Changelog

### v1.1.0 (January 2026)
- **Recurring Tasks**: Daily and weekly task recurrence with automatic reset
- **Time Periods**: Tasks can be assigned to Morning, Afternoon, or Evening
- **Visual Grouping**: Kiosk view groups tasks by time period with icons
- **New MCP Tools**: `reset_recurring_tasks`, enhanced `create_task` and `list_tasks`

### v1.0.0 (January 2026)
- First public release
- Basic task management
- Claude MCP integration
- OAuth 2.0 authentication
