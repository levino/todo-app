# MCP Server Dockerfile - OAuth and MCP API
# Build context: repository root (.)
#
# The MCP server depends on the @family-todo/db workspace package (shared
# SQLite data layer). We therefore build both packages/db and packages/mcp in
# the builder and carry the resolved workspace into the runner.

FROM node:22-alpine AS builder

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy root + workspace package manifests for dependency installation
COPY package.json package-lock.json ./
COPY packages/db/package.json ./packages/db/
COPY packages/mcp/package.json ./packages/mcp/

# Install dependencies for the MCP package and its workspace dependency
# (@family-todo/db), including devDependencies needed to build.
RUN npm ci --workspace=@family-todo/mcp --workspace=@family-todo/db

# Copy source for both workspace packages
COPY packages/db/ ./packages/db/
COPY packages/mcp/ ./packages/mcp/

# Build @family-todo/db first (produces dist consumed by the MCP), then the MCP
RUN npm run build -w @family-todo/db \
  && npm run build -w @family-todo/mcp

# Production image
FROM node:22-alpine AS runner

# Install runtime build deps for native modules (better-sqlite3 rebuild)
RUN apk add --no-cache python3 make g++

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

# Copy root manifests and the built workspace packages. The db package ships
# its dist + migrations (declared in its "files"); the mcp package ships dist.
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/packages/db/package.json ./packages/db/
COPY --from=builder /app/packages/db/dist ./packages/db/dist
COPY --from=builder /app/packages/db/migrations ./packages/db/migrations
COPY --from=builder /app/packages/mcp/package.json ./packages/mcp/
COPY --from=builder /app/packages/mcp/dist ./packages/mcp/dist

# Install production dependencies only for both workspaces. This links
# @family-todo/db into node_modules and rebuilds better-sqlite3 natively.
RUN npm install --omit=dev --workspace=@family-todo/mcp --workspace=@family-todo/db

# Create data directory for the OAuth SQLite db and keys
RUN mkdir -p /app/data

# Remove build tools after install to reduce image size
RUN apk del python3 make g++

EXPOSE 3001

# Start MCP server
CMD ["node", "./packages/mcp/dist/server.js"]
