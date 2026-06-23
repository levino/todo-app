// Block until the stack is ready before Playwright starts.
//
// We need two things reachable from inside the e2e container:
//   1. oauth2-proxy is listening (any HTTP status proves the proxy is up)
//   2. dex's OIDC discovery endpoint serves 200 (so the login redirect won't
//      race a not-yet-ready provider)
//
// oauth2-proxy itself depends on dex + a healthy frontend, so by the time it
// answers, the upstream chain is already up.

const BASE_URL = process.env.BASE_URL || 'http://oauth2-proxy:4180'
const DEX_URL = process.env.DEX_URL || 'http://dex:5556'
const MCP_URL = process.env.MCP_URL || 'http://frontend:3001'

const TIMEOUT_MS = 180_000
const INTERVAL_MS = 2_000

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function probe(name, url, isReady) {
  const deadline = Date.now() + TIMEOUT_MS
  let lastErr = 'no response yet'
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { redirect: 'manual' })
      if (isReady(res)) {
        console.log(`✓ ${name} ready (${res.status}) ${url}`)
        return
      }
      lastErr = `status ${res.status}`
    } catch (e) {
      lastErr = e.message
    }
    await sleep(INTERVAL_MS)
  }
  throw new Error(`Timed out waiting for ${name} at ${url}: ${lastErr}`)
}

// Any HTTP status (200 served, or 302 to the IdP) means the proxy is up.
await probe(
  'oauth2-proxy',
  `${BASE_URL}/ping`,
  (res) => res.status > 0,
)

await probe(
  'dex discovery',
  `${DEX_URL}/dex/.well-known/openid-configuration`,
  (res) => res.status === 200,
)

// mcp shares the frontend netns and starts independently; make sure its OAuth
// server answers before the consent-flow test registers a client.
await probe(
  'mcp discovery',
  `${MCP_URL}/.well-known/oauth-authorization-server`,
  (res) => res.status === 200,
)

console.log('Stack is ready.')
