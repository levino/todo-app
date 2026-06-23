# Full-stack e2e harness

Reproduces the **production auth topology** in docker-compose so the OAuth /
consent / PWA-manifest flow can be tested end-to-end — the parts that the
in-process (in-memory SQLite) test suite cannot cover because they only exist
once a real OIDC provider and oauth2-proxy are in front of the app.

```
browser (Playwright) ─▶ oauth2-proxy ─▶ frontend (Astro SSR)
                             │                 └─ shares one SQLite file ─┐
                             └─▶ dex (OIDC, stands in for ZITADEL)        │
                                                              mcp ────────┘
```

## Why dex (not ZITADEL)

`dex` speaks the same OIDC contract oauth2-proxy consumes in production but is
fully driven by a static config file (`dex/config.yaml`) — no database
bootstrap, no admin UI — so the harness is reproducible in CI. The behaviour
under test lives in oauth2-proxy, which is identical to production; the IdP
behind it is interchangeable.

## Why Playwright runs inside the compose network

All services share one network, so the hostnames `dex` and `oauth2-proxy`
resolve **identically server-side and in the browser**. This avoids the classic
OIDC issuer-URL mismatch you hit when the browser is on the host and the proxy
is in a container.

## Run

```bash
npm run test:e2e        # from the repo root: builds images, runs, tears down
```

Or directly:

```bash
docker compose -f e2e/docker-compose.yml up --build \
    --abort-on-container-exit --exit-code-from e2e
docker compose -f e2e/docker-compose.yml down -v
```

## What it covers

- **`tests/manifest-cors.spec.ts`** — the regression test for the manifest CORS
  bug: `/manifest.json` and `/icon-*.svg` are served `200` (not `302`→IdP),
  while a protected path still redirects to dex (proving the gatekeeper is
  active). Remove the `--skip-auth-route` lines from `docker-compose.yml` and
  these tests fail — that is the bug.
- **`tests/auth-flow.spec.ts`** — the full browser login flow through dex back
  into the authenticated app, asserting no manifest CORS error occurs.

## Test credentials

`test@example.com` / `password` (static dex user — test only).
