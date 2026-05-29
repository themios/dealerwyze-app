/**
 * Cal.com webhook handler — BOOKING_CREATED, BOOKING_RESCHEDULED, BOOKING_CANCELLED
 *
 * Security flow (enforced in order):
 *   1. IP rate limit via calWebhookLimiter (100/min) — before HMAC to avoid compute waste
 *   2. HMAC-SHA256 on raw body via x-cal-signature-256 header — before any DB read/write
 *   3. Parse JSON body
 *   4. Cross-tenant spoofing check: validate listingId belongs to orgId (from payload metadata)
 *   5. Handle event
 *
 * Replay safety: cal_booking_uid has UNIQUE constraint on showings — Postgres 23505 = dedup.
 * Context: webhook route (no user session) → createServiceClient() required.
 */

import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { calWebhookLimiter } from '@/lib/rateLimit/upstash'
import { writeAuditLog } from '@/lib/audit/log'

export const runtime = 'nodejs'

// ── Types ────────────────────────────────────────────────────────────────────

interface CalWebhookBody {
  triggerEvent: 'BOOKING_CREATED' | 'BOOKING_CANCELLED' | 'BOOKING_RESCHEDULED'
  createdAt: string
  payload: {
    uid: string
    startTime: string
    attendees: Array<{ name: string; email: string; timeZone: string }>
    organizer: { name: string; email: string }
    responses?: {
      notes?: { value: string }
      name?: { value: string }
      email?: { value: string }
    }
    metadata?: Record<string, string>
    status: 'ACCEPTED' | 'PENDING' | 'CANCELLED'
  }
}

// ── HMAC helper ───────────────────────────────────────────────────────────────

function verifyCalSignature(rawBody: string, signature: string, secret: string): boolean {
  const hmac = crypto.createHmac('sha256', secret)
  hmac.update(rawBody)
  const expected = hmac.digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'

  // 1. IP rate limit — check before HMAC to avoid compute on flood
  const rateCheck = await calWebhookLimiter(ip)
  if (!rateCheck.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  // 2. Read raw body BEFORE any JSON parsing (body stream consumed once)
  const rawBody = await req.text()

  // 3. HMAC signature validation
  const secret = process.env.CALCOM_WEBHOOK_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 })
  }

  const signature = req.headers.get('x-cal-signature-256') ?? ''
  if (!signature || !verifyCalSignature(rawBody, signature, secret)) {
    // Audit log for security monitoring — fire-and-forget
    void writeAuditLog({
      orgId: null,
      actorId: null,
      actorType: 'user',
      action: 'webhook_auth_failure',
      metadata: { path: '/api/cal/webhook', reason: 'invalid_signature' },
      ipAddress: ip,
    })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // 4. Parse body
  let body: CalWebhookBody
  try {
    body = JSON.parse(rawBody) as CalWebhookBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // 5. Extract metadata fields
  const { uid, startTime, attendees, metadata } = body.payload
  const orgId = metadata?.orgId
  const listingId = metadata?.listingId

  if (!orgId || !listingId) {
    return NextResponse.json({ error: 'Missing orgId or listingId in metadata' }, { status: 400 })
  }

  // 6. Service client — webhook context, no user session
  const supabase = createServiceClient()

  // 7. Cross-tenant spoofing check: verify listingId belongs to orgId
  // vehicles uses user_id = org_id for org scoping (no org_id column)
  const { data: listing } = await supabase
    .from('vehicles')
    .select('id, model')
    .eq('id', listingId)
    .eq('user_id', orgId)
    .maybeSingle()

  if (!listing) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 })
  }

  // 8. Handle triggerEvent
  switch (body.triggerEvent) {
    case 'BOOKING_CREATED': {
      // Upsert buyer contact — customers uses user_id = org_id, no unique(email, org_id)
      // Try to find existing customer first, then insert if not found
      let contactId: string | null = null
      try {
        const attendee = attendees[0]
        if (attendee?.email) {
          const { data: existing } = await supabase
            .from('customers')
            .select('id')
            .eq('user_id', orgId)
            .eq('email', attendee.email)
            .maybeSingle()

          if (existing?.id) {
            contactId = existing.id
          } else {
            const { data: created } = await supabase
              .from('customers')
              .insert({
                user_id:       orgId,
                name:          attendee.name ?? attendee.email,
                email:         attendee.email,
                primary_phone: '',  // required NOT NULL; unknown at booking time
              })
              .select('id')
              .single()
            if (created?.id) contactId = created.id
          }
        }
      } catch {
        // Contact upsert is best-effort; showing still proceeds without contact_id
        contactId = null
      }

      // Insert showing — cal_booking_uid UNIQUE enforces dedup at DB level
      const { error: insertError } = await supabase.from('showings').insert({
        org_id:          orgId,
        listing_id:      listingId,
        scheduled_at:    startTime,
        status:          'scheduled',
        cal_booking_uid: uid,
        contact_id:      contactId ?? null,
      })

      if (insertError?.code === '23505') {
        // Duplicate booking_uid — already processed; Cal.com retried
        return NextResponse.json({ received: true, duplicate: true })
      }

      if (insertError) {
        console.error('[cal-webhook] insert failed:', insertError.message)
        return NextResponse.json({ error: 'Insert failed' }, { status: 500 })
      }

      return NextResponse.json({ received: true })
    }

    case 'BOOKING_CANCELLED': {
      const { error } = await supabase
        .from('showings')
        .update({ status: 'cancelled' })
        .eq('cal_booking_uid', uid)
        .eq('org_id', orgId)

      if (error) {
        console.error('[cal-webhook] cancel update failed:', error.message)
      }
      return NextResponse.json({ received: true })
    }

    case 'BOOKING_RESCHEDULED': {
      const { error } = await supabase
        .from('showings')
        .update({ scheduled_at: startTime })
        .eq('cal_booking_uid', uid)
        .eq('org_id', orgId)

      if (error) {
        console.error('[cal-webhook] reschedule update failed:', error.message)
      }
      return NextResponse.json({ received: true })
    }

    default: {
      // Unknown event type — return 200 so Cal.com doesn't retry endlessly
      return NextResponse.json({ received: true, skipped: true })
    }
  }
}
