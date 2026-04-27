/**
 * Upstash Redis-backed rate limiters — shared across all Vercel instances.
 * Falls back to allowing all requests if env vars are not configured,
 * so the app continues to work without Upstash (e.g. local dev without .env.local).
 *
 * Usage:
 *   const result = await registrationLimiter(ip)
 *   if (!result.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
 */

import { Ratelimit } from '@upstash/ratelimit'
import { Redis }     from '@upstash/redis'

const url   = process.env.UPSTASH_REDIS_REST_URL
const token = process.env.UPSTASH_REDIS_REST_TOKEN

const isConfigured = Boolean(url && token)

function makeRedis() {
  if (!isConfigured) return null
  return new Redis({ url: url!, token: token! })
}

function makeLimiter(redis: Redis | null, config: { requests: number; windowSeconds: number }) {
  if (!redis) return null
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(config.requests, `${config.windowSeconds} s`),
    analytics: false,
  })
}

const redis = makeRedis()

// 5 registration attempts per IP per hour
const _registrationLimiter = makeLimiter(redis, { requests: 5, windowSeconds: 3600 })

// 20 web lead submissions per IP per hour
const _webLeadLimiter = makeLimiter(redis, { requests: 20, windowSeconds: 3600 })

export async function registrationLimiter(ip: string): Promise<{ allowed: boolean; remaining: number }> {
  if (!_registrationLimiter) return { allowed: true, remaining: 99 }
  const result = await _registrationLimiter.limit(ip)
  return { allowed: result.success, remaining: result.remaining }
}

export async function webLeadLimiter(ip: string): Promise<{ allowed: boolean; remaining: number }> {
  if (!_webLeadLimiter) return { allowed: true, remaining: 99 }
  const result = await _webLeadLimiter.limit(ip)
  return { allowed: result.success, remaining: result.remaining }
}
