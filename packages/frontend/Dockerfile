# Frontend Dockerfile - Astro SSR Application
# Build context: repository root (.)

FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files for dependency installation
COPY package.json package-lock.json ./
COPY packages/frontend/package.json ./packages/frontend/

# Install all workspace dependencies
RUN npm ci --workspace=@family-todo/frontend

# Copy frontend source
COPY packages/frontend/ ./packages/frontend/

# Build the Astro application
RUN npm run build -w @family-todo/frontend

# Production image
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy built application
COPY --from=builder /app/packages/frontend/dist ./dist
COPY --from=builder /app/packages/frontend/package.json ./

# Install production dependencies only
RUN npm install --omit=dev

EXPOSE 3000

# Start Astro SSR server
CMD ["node", "./dist/server/entry.mjs"]
