/**
 * Upstash Redis-backed rate limiters — shared across all Vercel instances.
 * Falls back to allowing all requests if env vars are not configured,
 * so the app continues to work without Upstash (e.g. local dev without .env.local).
 *
 * Two categories:
 *   IP-based  — public endpoints (no auth): book, pulse, pay, leads, registration
 *   Org-based — authenticated actions that cost money: SMS sends, AI calls
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

// ── IP-based limiters (public endpoints) ─────────────────────────────────────

const _registrationLimiter      = makeLimiter(redis, { requests: 5,  windowSeconds: 3600 })
const _webLeadLimiter            = makeLimiter(redis, { requests: 20, windowSeconds: 3600 })
const _bookingLimiter            = makeLimiter(redis, { requests: 20, windowSeconds: 3600 })
const _pulseSurveyResponseLimiter= makeLimiter(redis, { requests: 5,  windowSeconds: 3600 })
const _pulseSurveyViewLimiter    = makeLimiter(redis, { requests: 30, windowSeconds: 3600 })
const _paymentLimiter            = makeLimiter(redis, { requests: 10, windowSeconds: 3600 })

// ── Org-based limiters (authenticated, cost-generating actions) ───────────────

// SMS: 20 sends per 5 minutes per org — burst protection layer on top of monthly quota
const _orgSmsLimiter    = makeLimiter(redis, { requests: 20,  windowSeconds: 300  })

// AI calls per org per day — prevents runaway cost from a single org
const _orgMarketCheck   = makeLimiter(redis, { requests: 10,  windowSeconds: 86400 })  // Groq compound (expensive)
const _orgAiBrief       = makeLimiter(redis, { requests: 10,  windowSeconds: 86400 })  // Groq summary/brief
const _orgAiAsk         = makeLimiter(redis, { requests: 10,  windowSeconds: 86400 })  // Groq freeform question (10/day)
const _orgReceiptScan   = makeLimiter(redis, { requests: 25,  windowSeconds: 86400 })  // Anthropic receipt OCR
const _orgDocSummarize  = makeLimiter(redis, { requests: 10,  windowSeconds: 86400 })  // Anthropic vehicle doc
const _orgContactScan   = makeLimiter(redis, { requests: 20,  windowSeconds: 86400 })  // Anthropic contact card
/** Full ZIP export — one per org per hour (distributed via Upstash; replaces legacy in-memory Map). */
const _orgExport        = makeLimiter(redis, { requests: 1,   windowSeconds: 3600 })
const _orgTodayAction   = makeLimiter(redis, { requests: 60,  windowSeconds: 60 })
const _orgTodayBulk     = makeLimiter(redis, { requests: 10,  windowSeconds: 60 })
const _orgLostLeadExport = makeLimiter(redis, { requests: 1, windowSeconds: 60 })
const _orgSocialPost    = makeLimiter(redis, { requests: 40, windowSeconds: 3600 })

async function check(
  limiter: Ratelimit | null,
  key: string,
): Promise<{ allowed: boolean; remaining: number; retryAfterSeconds: number }> {
  if (!limiter) return { allowed: true, remaining: 99, retryAfterSeconds: 0 }
  const result = await limiter.limit(key)
  const resetAtMs = typeof result.reset === 'number' ? result.reset : Date.now()
  return {
    allowed: result.success,
    remaining: result.remaining,
    retryAfterSeconds: Math.max(0, Math.ceil((resetAtMs - Date.now()) / 1000)),
  }
}

// ── IP-based exports ──────────────────────────────────────────────────────────

export const registrationLimiter       = (ip: string) => check(_registrationLimiter,       ip)
export const webLeadLimiter            = (ip: string) => check(_webLeadLimiter,             ip)
export const bookingLimiter            = (ip: string) => check(_bookingLimiter,             ip)
export const pulseSurveyResponseLimiter= (ip: string) => check(_pulseSurveyResponseLimiter, ip)
export const pulseSurveyViewLimiter    = (ip: string) => check(_pulseSurveyViewLimiter,     ip)
export const paymentLimiter            = (ip: string) => check(_paymentLimiter,             ip)

// ── Org-based exports ─────────────────────────────────────────────────────────

/** Burst limiter: 20 SMS per 5 min per org. Checked BEFORE monthly quota. */
export const orgSmsLimiter    = (orgId: string) => check(_orgSmsLimiter,   `org:${orgId}:sms`)

/** 10 market-check (Groq compound) calls per org per day. */
export const orgMarketCheckLimiter  = (orgId: string) => check(_orgMarketCheck,  `org:${orgId}:market`)

/** 10 AI brief generations per org per day. */
export const orgAiBriefLimiter      = (orgId: string) => check(_orgAiBrief,      `org:${orgId}:aibrief`)

/** 3 freeform AI questions per org per day. */
export const orgAiAskLimiter        = (orgId: string) => check(_orgAiAsk,        `org:${orgId}:aiask`)

/** 25 receipt AI scans per org per day. */
export const orgReceiptScanLimiter  = (orgId: string) => check(_orgReceiptScan,  `org:${orgId}:receipt`)

/** 10 vehicle doc AI summarizations per org per day. */
export const orgDocSummarizeLimiter = (orgId: string) => check(_orgDocSummarize, `org:${orgId}:docsumm`)

/** 20 contact card AI scans per org per day. */
export const orgContactScanLimiter  = (orgId: string) => check(_orgContactScan,  `org:${orgId}:contact`)

/** One full dealership export ZIP per org per hour. */
export const orgExportLimiter = (orgId: string) => check(_orgExport, `org:${orgId}:export`)
export const orgTodayActionLimiter  = (orgId: string) => check(_orgTodayAction,  `org:${orgId}:todayaction`)
export const orgTodayBulkLimiter    = (orgId: string) => check(_orgTodayBulk,    `org:${orgId}:todaybulk`)
export const orgLostLeadExportLimiter = (orgId: string) => check(_orgLostLeadExport, `org:${orgId}:lostleadexport`)

/** ~40 Meta listing/video publish attempts per org per hour — abuse / incident containment. */
export const orgSocialPostLimiter = (orgId: string) => check(_orgSocialPost, `org:${orgId}:socialpost`)

// Temp media uploads (MMS attachments from device) — 20 per hour per org
const _orgTempUploadLimiter = makeLimiter(redis, { requests: 20, windowSeconds: 3600 })

/** 20 temp media uploads per org per hour (MMS attachments from device). */
export const orgTempUploadLimiter = (orgId: string) => check(_orgTempUploadLimiter, `org:${orgId}:tmpupload`)

// Cal.com webhook — 100 events/min per source IP (legitimate Cal.com retries are rare)
const _calWebhookLimiter = makeLimiter(redis, { requests: 100, windowSeconds: 60 })

/** 100 Cal.com webhook deliveries per minute per source IP. */
export const calWebhookLimiter = (ip: string) => check(_calWebhookLimiter, `calwh:${ip}`)
