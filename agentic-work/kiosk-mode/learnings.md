# Kiosk Mode - Learnings

This document collects permanent knowledge gained during development.

## PocketBase

- Schema changes only via API (`/create-collection` or `pb.collections.create()`)
- Migrations are automatically generated in `pocketbase/pb_migrations/`
- Never mock PocketBase - tests run against real instance

## Astro / Shipyard

- SSR mode for Server-Side Rendering
- View Transitions for animations without JavaScript
- `<form method="POST">` for interactions without JS

## TDD in this Project

- First write a test that fails
- Then write code to make test pass
- Refactor only with green tests
- No exceptions!

## Kiosk Mode Architecture

- No JavaScript in browser
- Everything server-side rendered
- POST requests for state changes
- Redirects after POST (Post-Redirect-Get pattern)
