import crypto from 'crypto'

export const META_GRAPH_VERSION = 'v21.0'
export const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`

export type MetaGraphErrorBody = {
  error?: { message?: string; code?: number; type?: string }
}

/**
 * Verifies Remotion Lambda webhook HMAC (raw body string + X-Remotion-Signature: sha512=...).
 * @see https://www.remotion.dev/docs/lambda/webhooks
 */
export function verifyRemotionWebhookSignature(
  rawBody: string,
  secret: string | undefined,
  signatureHeader: string | null,
): boolean {
  if (!secret?.length) {
    return false
  }
  if (!signatureHeader || signatureHeader === 'NO_SECRET_PROVIDED') {
    return false
  }
  const expected = `sha512=${crypto.createHmac('sha512', secret).update(rawBody, 'utf8').digest('hex')}`
  try {
    const a = Buffer.from(signatureHeader, 'utf8')
    const b = Buffer.from(expected, 'utf8')
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}

const META_FETCH_TIMEOUT_MS = 30_000

export async function metaGraphGet<T = Record<string, unknown>>(
  path: string,
  params: Record<string, string>,
): Promise<T> {
  const u = new URL(`${META_GRAPH_BASE}${path.startsWith('/') ? path : `/${path}`}`)
  for (const [k, v] of Object.entries(params)) {
    u.searchParams.set(k, v)
  }
  const res = await fetch(u.toString(), {
    method: 'GET',
    signal: AbortSignal.timeout(META_FETCH_TIMEOUT_MS),
  })
  const json = (await res.json()) as T & MetaGraphErrorBody
  if (!res.ok) {
    const msg = json.error?.message ?? `Graph GET ${res.status}`
    throw new Error(msg)
  }
  return json
}

export async function metaGraphPostForm<T = Record<string, unknown>>(
  path: string,
  params: Record<string, string>,
): Promise<T> {
  const u = new URL(`${META_GRAPH_BASE}${path.startsWith('/') ? path : `/${path}`}`)
  for (const [k, v] of Object.entries(params)) {
    u.searchParams.set(k, v)
  }
  const res = await fetch(u.toString(), {
    method: 'POST',
    signal: AbortSignal.timeout(META_FETCH_TIMEOUT_MS),
  })
  const json = (await res.json()) as T & MetaGraphErrorBody
  if (!res.ok) {
    const msg = json.error?.message ?? `Graph POST ${res.status}`
    throw new Error(msg)
  }
  return json
}
