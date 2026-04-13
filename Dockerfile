FROM node:24-bookworm-slim AS builder
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json astro.config.mjs biome.json ./
COPY src ./src

RUN npm run build \
 && npm prune --omit=dev


FROM node:24-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/data/db.sqlite

RUN useradd --system --uid 1001 --home /app app \
 && mkdir -p /data \
 && chown -R app:app /data /app

COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/dist ./dist
COPY --from=builder --chown=app:app /app/package.json ./package.json
COPY --from=builder --chown=app:app /app/src ./src
COPY --from=builder --chown=app:app /app/tsconfig.json ./tsconfig.json

USER app
EXPOSE 3000
VOLUME ["/data"]

CMD ["node", "--experimental-strip-types", "src/index.ts"]
