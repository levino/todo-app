/**
 * OAuth 2.0 JWT Module
 *
 * Handles RS256 JWT signing and verification for access tokens.
 * Keys are generated on first use or loaded from environment/file.
 */

import * as jose from 'jose'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

// Debug logging - enable via DEBUG_MCP=true
const DEBUG = process.env.DEBUG_MCP === 'true'

function debugLog(category: string, message: string, data?: unknown) {
  if (!DEBUG) return
  const timestamp = new Date().toISOString()
  console.log(`[${timestamp}] [DEBUG:${category}] ${message}`)
  if (data !== undefined) {
    console.log(JSON.stringify(data, null, 2))
  }
}

const ALGORITHM = 'RS256'
const KEY_ID = 'oauth-key-1'

// jose v6 uses CryptoKey, not KeyLike
type JWTKey = CryptoKey

let privateKey: JWTKey | null = null
let publicKey: JWTKey | null = null
let publicKeyJWK: jose.JWK | null = null

export interface AccessTokenPayload {
  sub: string // PocketBase user ID
  client_id: string
  scope?: string
}

export interface AccessTokenClaims extends AccessTokenPayload {
  iss: string
  aud: string
  iat: number
  exp: number
}

/**
 * Initialize the key pair from environment or file, or generate new keys.
 */
export async function initKeys(keyPath?: string): Promise<void> {
  // Try environment variable first (PEM format)
  const envKey = process.env.OAUTH_RSA_PRIVATE_KEY
  if (envKey) {
    privateKey = await jose.importPKCS8(envKey, ALGORITHM)
    publicKey = await jose.importSPKI(
      await derivePublicKeyPEM(envKey),
      ALGORITHM
    )
    publicKeyJWK = await jose.exportJWK(publicKey)
    publicKeyJWK.kid = KEY_ID
    publicKeyJWK.alg = ALGORITHM
    publicKeyJWK.use = 'sig'
    return
  }

  // Try file path
  const resolvedPath = keyPath || process.env.OAUTH_KEY_PATH || './data/oauth-keys'
  const privateKeyPath = `${resolvedPath}/private.pem`
  const publicKeyPath = `${resolvedPath}/public.pem`

  if (existsSync(privateKeyPath) && existsSync(publicKeyPath)) {
    const privatePem = readFileSync(privateKeyPath, 'utf-8')
    const publicPem = readFileSync(publicKeyPath, 'utf-8')

    privateKey = await jose.importPKCS8(privatePem, ALGORITHM)
    publicKey = await jose.importSPKI(publicPem, ALGORITHM)
    publicKeyJWK = await jose.exportJWK(publicKey)
    publicKeyJWK.kid = KEY_ID
    publicKeyJWK.alg = ALGORITHM
    publicKeyJWK.use = 'sig'
    return
  }

  // Generate new keys
  const keyPair = await jose.generateKeyPair(ALGORITHM, { modulusLength: 2048, extractable: true })
  privateKey = keyPair.privateKey
  publicKey = keyPair.publicKey

  // Export to PEM format for storage
  const privatePem = await jose.exportPKCS8(privateKey)
  const publicPem = await jose.exportSPKI(publicKey)

  // Save to files
  const dir = dirname(privateKeyPath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  writeFileSync(privateKeyPath, privatePem, { mode: 0o600 })
  writeFileSync(publicKeyPath, publicPem, { mode: 0o644 })

  // Export public key as JWK
  publicKeyJWK = await jose.exportJWK(publicKey)
  publicKeyJWK.kid = KEY_ID
  publicKeyJWK.alg = ALGORITHM
  publicKeyJWK.use = 'sig'
}

/**
 * Derive public key PEM from private key PEM.
 * This is a simplified approach - in production you'd store both.
 */
async function derivePublicKeyPEM(privatePem: string): Promise<string> {
  const privateKeyObj = await jose.importPKCS8(privatePem, ALGORITHM)
  // Export as JWK, then re-import as public only
  const jwk = await jose.exportJWK(privateKeyObj)
  // Remove private components
  delete jwk.d
  delete jwk.p
  delete jwk.q
  delete jwk.dp
  delete jwk.dq
  delete jwk.qi
  const publicKeyObj = await jose.importJWK(jwk, ALGORITHM)
  return jose.exportSPKI(publicKeyObj as JWTKey)
}

/**
 * Get the public key in JWK format for the JWKS endpoint.
 */
export function getPublicKeyJWK(): jose.JWK {
  if (!publicKeyJWK) {
    throw new Error('Keys not initialized. Call initKeys first.')
  }
  return publicKeyJWK
}

/**
 * Get the JWKS (JSON Web Key Set) containing the public key.
 */
export function getJWKS(): { keys: jose.JWK[] } {
  return {
    keys: [getPublicKeyJWK()],
  }
}

/**
 * Sign an access token.
 */
export async function signAccessToken(
  payload: AccessTokenPayload,
  issuer: string,
  audience: string,
  expiresInSeconds: number = 3600
): Promise<string> {
  if (!privateKey) {
    throw new Error('Keys not initialized. Call initKeys first.')
  }

  const jwt = await new jose.SignJWT(payload as unknown as jose.JWTPayload)
    .setProtectedHeader({ alg: ALGORITHM, kid: KEY_ID })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(`${expiresInSeconds}s`)
    .sign(privateKey)

  return jwt
}

/**
 * Verify and decode an access token.
 * Returns null if invalid or expired.
 */
export async function verifyAccessToken(
  token: string,
  issuer: string,
  audience: string
): Promise<AccessTokenClaims | null> {
  if (!publicKey) {
    throw new Error('Keys not initialized. Call initKeys first.')
  }

  debugLog('JWT', 'Verifying token', {
    tokenLength: token.length,
    expectedIssuer: issuer,
    expectedAudience: audience,
  })

  // Decode header without verification to see what we're dealing with
  try {
    const parts = token.split('.')
    if (parts.length === 3) {
      const headerJson = Buffer.from(parts[0], 'base64url').toString()
      const payloadJson = Buffer.from(parts[1], 'base64url').toString()
      debugLog('JWT', 'Token header (unverified)', JSON.parse(headerJson))
      debugLog('JWT', 'Token payload (unverified)', JSON.parse(payloadJson))
    }
  } catch (e) {
    debugLog('JWT', 'Failed to decode token parts', { error: String(e) })
  }

  try {
    const { payload } = await jose.jwtVerify(token, publicKey, {
      issuer,
      audience,
      algorithms: [ALGORITHM],
    })

    debugLog('JWT', 'Token verified successfully', { payload })

    return {
      iss: payload.iss as string,
      aud: payload.aud as string,
      iat: payload.iat as number,
      exp: payload.exp as number,
      sub: payload.sub as string,
      client_id: payload.client_id as string,
      scope: payload.scope as string | undefined,
    }
  } catch (error) {
    debugLog('JWT', 'Token verification FAILED', {
      error: String(error),
      errorName: error instanceof Error ? error.name : 'unknown',
      errorMessage: error instanceof Error ? error.message : 'unknown',
    })
    return null
  }
}

/**
 * Verify PKCE code challenge.
 * Uses S256 method: BASE64URL(SHA256(code_verifier)) == code_challenge
 */
export async function verifyCodeChallenge(
  codeVerifier: string,
  codeChallenge: string
): Promise<boolean> {
  const encoder = new TextEncoder()
  const data = encoder.encode(codeVerifier)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = new Uint8Array(hashBuffer)
  const computed = base64UrlEncode(hashArray)
  return computed === codeChallenge
}

/**
 * Generate a code challenge from a verifier (for testing).
 */
export async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(codeVerifier)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = new Uint8Array(hashBuffer)
  return base64UrlEncode(hashArray)
}

/**
 * Base64URL encode without padding.
 */
function base64UrlEncode(buffer: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
