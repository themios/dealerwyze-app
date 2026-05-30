import { Redis } from '@upstash/redis'

const _url = process.env.UPSTASH_REDIS_REST_URL
const _token = process.env.UPSTASH_REDIS_REST_TOKEN
const _redis = _url && _token ? new Redis({ url: _url, token: _token }) : null

const CACHE_KEY_PREFIX = 'org:last_active:'
const CACHE_TTL_SECONDS = 300 // 5 minutes

/**
 * Check if org last_active_at has been updated recently (within last 5 min).
 * If not, return false (caller should update DB). If yes, return true (skip DB write).
 * On cache miss or expiry, automatically set the key to track this call.
 */
export async function shouldSkipLastActiveWrite(orgId: string): Promise<boolean> {
  if (!_redis) return false // No cache available, always write

  const key = `${CACHE_KEY_PREFIX}${orgId}`

  try {
    const exists = await _redis.exists(key)
    if (exists) {
      return true // Key exists and hasn't expired; skip write
    }

    // Cache miss — set the key for future calls, then allow write
    await _redis.setex(key, CACHE_TTL_SECONDS, '1')
    return false // Allow caller to write
  } catch (err) {
    // On Redis failure, fail open (allow write) to ensure last_active_at eventually updates
    console.error('[orgActivity] Redis check failed:', err)
    return false
  }
}
