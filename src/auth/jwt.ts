import {
  exportJWK,
  generateKeyPair,
  importPKCS8,
  importSPKI,
  type JWK,
  jwtVerify,
  type KeyLike,
  SignJWT,
} from 'jose'

const ALG = 'RS256'
const KID = 'levino-todo-app-1'

export type JwtKeys = {
  privateKey: KeyLike
  publicKey: KeyLike
}

export type UserPayload = {
  sub: string
  email?: string
}

export const loadKeysFromEnv = async (env: {
  JWT_PRIVATE_KEY?: string
  JWT_PUBLIC_KEY?: string
}): Promise<JwtKeys> => {
  const privPem = env.JWT_PRIVATE_KEY?.replace(/\\n/g, '\n')
  const pubPem = env.JWT_PUBLIC_KEY?.replace(/\\n/g, '\n')
  if (privPem && pubPem) {
    return {
      privateKey: await importPKCS8(privPem, ALG),
      publicKey: await importSPKI(pubPem, ALG),
    }
  }
  return generateEphemeralKeys()
}

export const generateEphemeralKeys = async (): Promise<JwtKeys> => {
  const { privateKey, publicKey } = await generateKeyPair(ALG, {
    modulusLength: 2048,
    extractable: true,
  })
  return { privateKey, publicKey }
}

export const signToken = async (
  keys: JwtKeys,
  payload: UserPayload,
  options: { issuer: string; audience?: string; expiresIn?: string } = {
    issuer: 'levino-todo-app',
  },
): Promise<string> => {
  const jwt = new SignJWT({ email: payload.email })
    .setProtectedHeader({ alg: ALG, kid: KID })
    .setSubject(payload.sub)
    .setIssuer(options.issuer)
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? '7d')
  if (options.audience) jwt.setAudience(options.audience)
  return jwt.sign(keys.privateKey)
}

export const verifyToken = async (
  keys: JwtKeys,
  token: string,
): Promise<UserPayload | null> => {
  try {
    const { payload } = await jwtVerify(token, keys.publicKey)
    if (!payload.sub) return null
    return {
      sub: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : undefined,
    }
  } catch {
    return null
  }
}

export const exportPublicJwk = async (keys: JwtKeys): Promise<JWK> => {
  const jwk = await exportJWK(keys.publicKey)
  jwk.kid = KID
  jwk.alg = ALG
  jwk.use = 'sig'
  return jwk
}

export const getBearerToken = (headers: Headers): string | null => {
  const auth = headers.get('Authorization')
  if (auth?.startsWith('Bearer ')) return auth.slice(7)
  const cookie = headers.get('Cookie')
  if (!cookie) return null
  const match = cookie.match(/(?:^|;\s*)auth_token=([^;]+)/)
  const value = match?.[1]
  return value ? decodeURIComponent(value) : null
}
