# Frontend Dockerfile - Astro SSR Application
# Build context: repository root (.)
#
# The app's data store is the shared SQLite layer `@family-todo/db`, which uses
# the native `better-sqlite3` addon. We therefore build the workspace (frontend
# + its `@family-todo/db` dependency) and ensure `better-sqlite3` is compiled for
# the image architecture in the runtime stage.

FROM node:22-alpine AS builder

WORKDIR /app

# Native build toolchain for better-sqlite3 (compiled from source on Alpine).
RUN apk add --no-cache python3 make g++

# Copy root + workspace manifests for dependency installation.
COPY package.json package-lock.json ./
COPY packages/frontend/package.json ./packages/frontend/
COPY packages/db/package.json ./packages/db/

# Install dependencies for the frontend and its workspace dependency.
RUN npm ci --workspace=@family-todo/frontend --workspace=@family-todo/db

# Copy the data layer + frontend sources.
COPY packages/db/ ./packages/db/
COPY packages/frontend/ ./packages/frontend/

# Build the shared data layer (tsc -> dist) and then the Astro app.
RUN npm run build -w @family-todo/db
RUN npm run build -w @family-todo/frontend

# Production image
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
# Default SQLite location (mounted volume in production).
ENV DB_PATH=/data/app.db

# Native build toolchain so `better-sqlite3` compiles for the runtime arch.
RUN apk add --no-cache python3 make g++

# Reconstruct the workspace so production deps (the Astro SSR runtime deps and
# @family-todo/db's better-sqlite3) install cleanly — the frontend declares a
# `workspace:*` dependency on @family-todo/db, so a plain `npm install` of the
# standalone manifest would not resolve. We install within the workspace.
COPY package.json package-lock.json ./
COPY packages/frontend/package.json ./packages/frontend/
COPY packages/db/package.json ./packages/db/
RUN npm ci --omit=dev --workspace=@family-todo/frontend --workspace=@family-todo/db

# Copy the built data layer (dist + migrations) and the built Astro app.
COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/packages/db/migrations ./packages/db/migrations
COPY --from=builder /app/packages/frontend/dist ./packages/frontend/dist

# The Astro SSR bundle inlines @family-todo/db but resolves the migrations dir
# relative to the bundled chunk (../migrations from dist/server/chunks). Ship the
# SQL migrations there too so the data layer can create the schema on first
# connect regardless of how the module path resolves.
COPY --from=builder /app/packages/db/migrations ./packages/frontend/dist/server/migrations

# Clean up build toolchain to keep the image lean.
RUN apk del python3 make g++

WORKDIR /app/packages/frontend

EXPOSE 3000

# Start Astro SSR server.
CMD ["node", "./dist/server/entry.mjs"]
