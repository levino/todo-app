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
- **Auth**: Login läuft über einen **oauth2-proxy-Gatekeeper vor der App**, der
  gegen ZITADEL (`https://id.levinkeller.de`) authentifiziert. Die App ist
  selbst _kein_ OIDC-Client: der Proxy injiziert `X-Forwarded-Email`, und die
  Astro-Middleware macht daraus die App-eigene Session — ein signiertes
  RS256-JWT im `auth_token`-Cookie. MCP akzeptiert dasselbe JWT als
  Bearer-Token und wird vom Proxy durchgelassen (siehe unten).
- **Deployment**: Docker-Image auf GHCR, Deployment auf k3s (`k8s/`).

## Auth-Flow (ZITADEL via oauth2-proxy)

```
Browser ──► Traefik Ingress ──► oauth2-proxy (4180) ──► App (127.0.0.1:3000)
                                   │  ZITADEL OIDC
                                   └─ injiziert X-Forwarded-Email
```

1. Der oauth2-proxy-Sidecar authentifiziert den Browser gegen ZITADEL und
   setzt `X-Forwarded-Email` (+ `X-Forwarded-Preferred-Username`).
2. `src/middleware.ts`: gibt es noch kein gültiges `auth_token`-JWT-Cookie,
   wird die Email aus dem Proxy-Header gelesen (vertrauenswürdig — der Proxy
   ist der einzige Ingress-Pfad), `upsertUserByEmail` aufgerufen und das
   App-eigene RS256-JWT geprägt und als Cookie gesetzt. Downstream-Code und der
   MCP-Bearer-Flow sehen unverändert eine normale App-Session.
3. **`/mcp` umgeht den Proxy** (`--skip-auth-route=^/mcp`): Claude
   authentifiziert sich dort mit dem App-JWT als Bearer-Token, das die App in
   `mcp-server.ts` selbst validiert. Der Proxy gatet diesen Pfad nicht.
4. `/auth/logout` löscht das Cookie und leitet auf `/oauth2/sign_out` (Proxy).

Es gibt keine In-App-Login-UI mehr (GitHub OAuth + Magic-Link wurden entfernt);
die öffentliche „Login"-Seite ist die ZITADEL-Seite des Proxys.

## Voraussetzungen

- Node 24+
- (Optional) Anthropic API Key für den Chat
- oauth2-proxy + ZITADEL für produktiven Login (nur im Deploy nötig)

## Lokale Entwicklung

```bash
npm install

# Beide Prozesse gleichzeitig starten:
# - Astro Dev Server auf 4321 (vite proxied /api, /auth, /mcp → 3000)
# - Express/Hono Backend auf 3000
npm run dev
```

Öffne http://localhost:4321. Lokal gibt es keinen Proxy — zum Testen kann ein
`X-Forwarded-Email`-Header gesetzt werden (z. B. via Browser-Extension oder
`curl`), den die Middleware in eine Session umwandelt.

## Tests

```bash
npm run typecheck   # tsc + astro check
npm run lint        # biome
npm run test        # vitest
```

## Deployment

Manifeste liegen unter `k8s/` (Namespace `todo-app`). Das Image
`ghcr.io/levino/levino-todo-app` wird beim Deploy auf dem Server gebaut; das
Cluster zieht das private GHCR-Image über die node-`registries.yaml` (kein
`imagePullSecret`). Validieren mit `kustomize build k8s/`.

Pod-Layout (eine Replica, `Recreate`):

- **App-Container** (`:3000`) — nur über den Sidecar auf `127.0.0.1` erreichbar.
- **oauth2-proxy-Sidecar** (`quay.io/oauth2-proxy/oauth2-proxy:v7.7.1`, `:4180`)
  — einziges Ziel von Service (Port 80 → `targetPort proxy`) und Ingress
  (`todos.levinkeller.de`, cert-manager `letsencrypt`). Lässt `/mcp`
  unauthentifiziert durch (`--skip-auth-route=^/mcp`).
- **PVC** `levino-todo-app-data` (`local-path`, RWO) für `/data` (db.sqlite).

Einmalig vor dem ersten Deploy:

1. `levino-todo-app-secrets` (ANTHROPIC_API_KEY + persistentes RS256-Keypair)
   aus `k8s/secrets.example.yaml` ableiten und mit `kubeseal` sealen.
2. `todo-oauth2-proxy-secret` (`client-id`, `client-secret`, `cookie-secret`)
   wird vom Operator gesealt — von den Manifesten nur referenziert, nicht
   erzeugt. Der ZITADEL-Client existiert bereits mit Redirect
   `https://todos.levinkeller.de/oauth2/callback`.

## Projektstruktur

```
src/
  index.ts          # Express shell, mountet Hono-Router + Astro SSR
  middleware.ts     # Astro middleware: X-Forwarded-Email → App-JWT-Session → locals.user
  app-context.ts    # Shared DB + Keys (via globalThis)
  db.ts             # better-sqlite3 schema + connection
  domain/           # Pure Funktionen für users, groups, children, tasks, rewards, points
  auth/             # jwt (RS256 sign/verify), logout-router
  tools.ts          # 22 MCP/Chat tools mit DI-Currying
  chat.ts           # /api/chat SSE-Endpoint (Anthropic Agentic Loop)
  mcp-server.ts     # /mcp Streamable-HTTP transport
  pages/            # Astro pages (login, kiosk, chat)
k8s/                # Manifeste für k3s deploy
Dockerfile          # Multi-stage build, node:24-bookworm-slim
```

## Lizenz

MIT
