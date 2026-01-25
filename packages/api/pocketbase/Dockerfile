FROM alpine:latest

ARG POCKETBASE_VERSION=0.36.1
ARG TARGETARCH

RUN apk add --no-cache \
    ca-certificates \
    unzip \
    wget

RUN ARCH=${TARGETARCH:-amd64} && \
    if [ "$ARCH" = "arm64" ]; then ARCH="arm64"; fi && \
    wget -q https://github.com/pocketbase/pocketbase/releases/download/v${POCKETBASE_VERSION}/pocketbase_${POCKETBASE_VERSION}_linux_${ARCH}.zip \
    && unzip pocketbase_${POCKETBASE_VERSION}_linux_${ARCH}.zip -d /usr/local/bin/ \
    && rm pocketbase_${POCKETBASE_VERSION}_linux_${ARCH}.zip \
    && chmod +x /usr/local/bin/pocketbase

COPY pb_migrations /pb_migrations

EXPOSE 8090

CMD ["pocketbase", "serve", "--http=:8090", "--migrationsDir=/pb_migrations"]
