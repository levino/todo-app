# MCP Server Dockerfile - OAuth and MCP API
# Build context: repository root (.)

FROM node:22-alpine AS builder

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files for dependency installation
COPY package.json package-lock.json ./
COPY packages/mcp/package.json ./packages/mcp/

# Install all workspace dependencies (including devDependencies for build)
RUN npm ci --workspace=@family-todo/mcp

# Copy MCP source
COPY packages/mcp/ ./packages/mcp/

# Build TypeScript
RUN npm run build -w @family-todo/mcp

# Production image
FROM node:22-alpine AS runner

# Install runtime dependencies for native modules
RUN apk add --no-cache python3 make g++

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

# Copy built application and package files
COPY --from=builder /app/packages/mcp/dist ./dist
COPY --from=builder /app/packages/mcp/package.json ./

# Install production dependencies only (rebuilds native modules)
RUN npm install --omit=dev

# Create data directory for SQLite and keys
RUN mkdir -p /app/data

# Remove build tools after npm install to reduce image size
RUN apk del python3 make g++

EXPOSE 3001

# Start MCP server
CMD ["node", "./dist/server.js"]
