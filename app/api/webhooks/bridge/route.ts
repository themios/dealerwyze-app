/**
 * POST /api/webhooks/bridge
 *
 * Receive webhooks from Bridge Interactive MLS API
 * Updates listings in real-time when Bridge detects changes
 *
 * Webhook events:
 * - listing.created — new listing added
 * - listing.updated — listing fields changed
 * - price.changed — price updated
 * - status.changed — listing status changed (active → pending → sold, etc.)
 * - photos.added — new photos added
 *
 * Webhook validation:
 * - All webhooks signed with HMAC-SHA256
 * - Signature in x-bridge-signature header
 * - Compare against BRIDGE_WEBHOOK_SECRET from env
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { validateWebhookSignature, parseWebhookPayload, getListingDetails } from '@/lib/mls/bridgeClient'
import { writeAuditLog } from '@/lib/audit/log'

const BRIDGE_WEBHOOK_SECRET = process.env.BRIDGE_WEBHOOK_SECRET || ''

/**
 * Store webhook payload for idempotency check
 * Bridge webhooks can be retried; we don't want to process duplicates
 */
async function getWebhookIdempotencyKey(payload: unknown): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(JSON.stringify(payload))
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function POST(req: NextRequest) {
  try {
    // Validate webhook signature
    const signature = req.headers.get('x-bridge-signature')
    if (!signature) {
      console.warn('[bridge-webhook] Missing signature header')
      await writeAuditLog({
        orgId: null,
        actorId: null,
        actorType: 'user',
        action: 'webhook_auth_failure',
        entityType: 'bridge_webhook',
        entityId: null,
        metadata: {
          path: '/api/webhooks/bridge',
          reason: 'missing_signature',
        },
      })
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 })
    }

    // Get raw body for signature validation
    const body = await req.text()
    const isValidSignature = await validateWebhookSignature(body, signature, BRIDGE_WEBHOOK_SECRET)

    if (!isValidSignature) {
      console.warn('[bridge-webhook] Invalid signature')
      await writeAuditLog({
        orgId: null,
        actorId: null,
        actorType: 'user',
        action: 'webhook_auth_failure',
        entityType: 'bridge_webhook',
        entityId: null,
        metadata: {
          path: '/api/webhooks/bridge',
          reason: 'invalid_signature',
        },
      })
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    // Parse JSON body
    const payload = JSON.parse(body)

    // Check for idempotency (prevent reprocessing)
    const supabase = createServiceClient()
    const webhookIdempotencyKey = await getWebhookIdempotencyKey(payload)

    const { data: existingWebhook } = await supabase
      .from('webhook_idempotency')
      .select('id')
      .eq('key', webhookIdempotencyKey)
      .eq('provider', 'bridge')
      .single()

    if (existingWebhook) {
      console.log('[bridge-webhook] Duplicate webhook, ignoring')
      return NextResponse.json({ status: 'duplicate' }, { status: 200 })
    }

    // Parse webhook event
    const event = parseWebhookPayload(payload)
    if (!event) {
      console.warn('[bridge-webhook] Invalid webhook payload')
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    console.log(`[bridge-webhook] Processing ${event.event} for MLS ${event.mls_number}`)

    // Update listing based on event type
    const { data: vehicle } = await supabase
      .from('vehicles')
      .select('id, user_id')
      .eq('mls_number', event.mls_number)
      .eq('mls_board_id', event.board_id)
      .single()

    if (!vehicle) {
      console.warn(`[bridge-webhook] Vehicle ${event.mls_number} not found, skipping`)
      return NextResponse.json({ status: 'vehicle_not_found' }, { status: 404 })
    }

    // Update vehicle based on event
    const updatePayload: Record<string, unknown> = {
      mls_synced_at: new Date().toISOString(),
    }

    if (event.event === 'status.changed') {
      updatePayload.listing_status = (event.data as Record<string, unknown>).new_status || 'unknown'
    } else if (event.event === 'price.changed') {
      const newPrice = (event.data as Record<string, unknown>).new_price
      if (newPrice) {
        updatePayload.price = newPrice
        // Append to price history
        const { data: current } = await supabase
          .from('vehicles')
          .select('price_history')
          .eq('id', vehicle.id)
          .single()

        const priceHistory = Array.isArray(current?.price_history) ? current.price_history : []
        priceHistory.push({
          price: newPrice,
          date: new Date().toISOString(),
        })
        updatePayload.price_history = priceHistory
      }
    } else if (event.event === 'photos.added') {
      // Photos will be fetched on next cron sync
      // For now, just mark as needing sync
      updatePayload.mls_synced_at = new Date().toISOString()
    }

    // Apply update
    const { error: updateError } = await supabase
      .from('vehicles')
      .update(updatePayload)
      .eq('id', vehicle.id)

    if (updateError) {
      console.error(`[bridge-webhook] Failed to update vehicle: ${updateError.message}`)
      return NextResponse.json({ error: 'Failed to update vehicle' }, { status: 500 })
    }

    // Record idempotency key
    await supabase.from('webhook_idempotency').insert({
      key: webhookIdempotencyKey,
      provider: 'bridge',
      processed_at: new Date().toISOString(),
    })

    console.log(`[bridge-webhook] Successfully processed ${event.event} for ${event.mls_number}`)
    return NextResponse.json({ status: 'processed' }, { status: 200 })
  } catch (err) {
    console.error('[bridge-webhook] Error processing webhook:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
