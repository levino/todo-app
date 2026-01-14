# Group and Children Management

## Overview
This feature enables users to manage their family groups and children within the Family To-Do App. It replaces the current auto-group-creation on signup with a more flexible system where users can belong to multiple groups and manage group membership.

## Key Concepts

### Groups (Families)
- A group represents a family or household
- Users can belong to multiple groups (e.g., shared custody situations)
- All group members are admins (can manage everything in the group)
- Groups have German names (e.g., "Familie Mueller", "Familie Schmidt-Bauer")

### Children (Profiles, not Accounts)
- Children are profiles within a group, not user accounts
- Children have a name and a color for visual identification
- Children are displayed with colored circles showing their initials (e.g., "LM" for "Lisa Mueller")
- No emoji avatars - simple colored initials only

### User Journey Changes
- New users start with no groups after signup
- Users must either create a group or be invited to one
- Users can switch between their groups to manage different families

## Business Rules
- Group names support German characters (umlauts, eszett) and spaces
- Adding users to groups is by email address only
- If email doesn't exist in the system, show an error (no invitation system yet)
- All group members have equal admin permissions

## UI Location
- Settings > Groups (Einstellungen > Gruppen)
- Children management within group context
