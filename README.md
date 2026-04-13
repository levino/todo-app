# Familien-ToDos

Single-process family todo app with an AI admin chat and a read-only kiosk.
Built on Astro, Express, Hono, better-sqlite3, and the Anthropic + MCP SDKs.

## Architektur

- **Ein Node-Prozess** serviert alles auf Port 3000: Astro SSR (Kiosk + Chat-UI),
  Hono-Router für `/auth`, `/api`, `/mcp`, und eine SQLite-Datei (`/data/db.sqlite`).
- **Keine Admin-UI.** Parents legen Gruppen, Kinder, Aufgaben und Belohnungen
  per Chat mit Claude an. Kids sehen eine reine Lese-Ansicht und können nur
  Aufgaben abhaken.
- **MCP-Server** läuft als Teil des gleichen Prozesses unter `/mcp` — deselbe
  22 Tools, die auch der integrierte Chat benutzt (Single Source of Truth).
- **Auth**: Magic-Link per SES SMTP oder GitHub OAuth; Session als
  signiertes RS256-JWT im `auth_token`-Cookie. MCP akzeptiert dasselbe JWT als
  Bearer-Token.
- **Deployment**: Docker-Image auf GHCR, Deployment auf k3s via GitHub Actions.

## Voraussetzungen

- Node 24+
- (Optional) Anthropic API Key für den Chat
- (Optional) GitHub OAuth App für GitHub-Login
- (Optional) AWS SES SMTP Credentials für echte Magic Links

## Lokale Entwicklung

```bash
npm install

# Beide Prozesse gleichzeitig starten:
# - Astro Dev Server auf 4321 (vite proxied /api, /auth, /mcp → 3000)
# - Express/Hono Backend auf 3000
npm run dev
```

Öffne http://localhost:4321. Ohne `SES_SMTP_HOST` landen Magic Links
in der Server-Konsole — kopiere den Link heraus, um dich einzuloggen.

## Tests

```bash
npm run typecheck   # tsc + astro check
npm run lint        # biome
npm run test        # vitest
```

## Deployment

Image wird per CI nach jedem Push auf `main` gebaut und nach
`ghcr.io/levino/levino-todo-app` gepusht, dann per OIDC-kubeconfig auf k3s
deployed. Manifeste liegen unter `k8s/`.

Einmalig vor dem ersten Deploy:

1. Secrets aus `k8s/secrets.example.yaml` ableiten und mit `kubeseal`
   in `k8s/sealed-secrets.yaml` verschlüsseln.
2. Sealed Secrets auf den Cluster anwenden.
3. Wenn das Image privat bleibt, `ghcr-pull` als Docker-Registry-Secret
   sealen; sonst `imagePullSecrets` aus `deployment.yaml` entfernen.

## Projektstruktur

```
src/
  index.ts          # Express shell, mountet Hono-Router + Astro SSR
  middleware.ts     # Astro middleware: JWT → locals.user
  app-context.ts    # Shared DB + Keys (via globalThis)
  db.ts             # better-sqlite3 schema + connection
  domain/           # Pure Funktionen für users, groups, children, tasks, rewards, points
  auth/             # jwt, magic link, github oauth, hono router
  tools.ts          # 22 MCP/Chat tools mit DI-Currying
  chat.ts           # /api/chat SSE-Endpoint (Anthropic Agentic Loop)
  mcp-server.ts     # /mcp Streamable-HTTP transport
  pages/            # Astro pages (login, kiosk, chat)
k8s/                # Manifeste für k3s deploy
Dockerfile          # Multi-stage build, node:24-bookworm-slim
```

## Lizenz

MIT
