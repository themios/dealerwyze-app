/**
 * POST /api/integrations/mls/sync
 *
 * Sync listings from Repliers (preferred) or Bridge MLS API to vehicles table.
 * Multi-tenant aware, uses idempotency to prevent duplicate processing.
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getListings, type BridgeListing } from '@/lib/mls/bridgeClient'
import { getRepliersListings } from '@/lib/mls/repliersClient'
import type { NormalizedMlsListing } from '@/lib/mls/normalizedListing'
import { upsertMlsListing } from '@/lib/mls/upsertMlsListing'
import { writeAuditLog } from '@/lib/audit/log'

const SyncRequestSchema = z.object({
  agentId: z.string().min(1).optional(),
  boardId: z.string().min(1).optional(),
  apiKey: z.string().min(1).optional(),
  source: z.enum(['repliers', 'bridge', 'auto']).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  city: z.string().max(120).optional(),
  state: z.string().max(2).optional(),
})

function bridgeToNormalized(listing: BridgeListing): NormalizedMlsListing {
  return {
    ...listing,
    year_built: null,
  }
}

function generateIdempotencyKey(provider: string, agentId: string, boardId: string, syncTimestamp: string): string {
  return `mls-sync:${provider}:${agentId}:${boardId}:${syncTimestamp}`
}

export async function GET(req: NextRequest) {
  try {
    const profile = await requireProfile()
    const supabase = await createClient()

    const status = req.nextUrl.searchParams.get('status')
    const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '50', 10), 500)

    let query = supabase
      .from('mls_sync_log')
      .select('id, synced_at, listings_synced, listings_created, listings_updated, status, errors, mls_board_id')
      .eq('agent_id', profile.id)
      .order('synced_at', { ascending: false })
      .limit(limit)

    if (status) {
      query = query.eq('status', status)
    }

    const { data: logs, error } = await query

    if (error) {
      console.error('[mls/sync GET] error:', error)
      return NextResponse.json({ error: 'An error occurred. Please try again.' }, { status: 500 })
    }

    return NextResponse.json({
      logs: logs || [],
      count: logs?.length || 0,
    })
  } catch (err) {
    console.error('[mls/sync GET] error:', err)
    return NextResponse.json({ error: 'An error occurred. Please try again.' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const profile = await requireProfile()
    const supabase = await createClient()

    const { data: org } = await supabase
      .from('organizations')
      .select('vertical')
      .eq('id', profile.org_id)
      .single()

    if (org?.vertical !== 'real_estate') {
      return NextResponse.json(
        { error: 'MLS sync only available for real estate agents' },
        { status: 403 }
      )
    }

    const rawBody = await req.json().catch(() => ({}))
    const parsed = SyncRequestSchema.safeParse(rawBody)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const { limit, city, state } = parsed.data
    let { agentId, boardId, apiKey, source } = parsed.data

    const useRepliers =
      source === 'repliers' ||
      (source !== 'bridge' && Boolean(process.env.REPLIERS_API_KEY))

    if (!useRepliers) {
      if (!boardId || !apiKey) {
        const { data: agentProfile } = await supabase
          .from('profiles')
          .select('bridge_agent_id, mls_board_id, bridge_api_key')
          .eq('id', profile.id)
          .single()

        if (!agentProfile?.mls_board_id || !agentProfile?.bridge_api_key) {
          return NextResponse.json(
            { error: 'MLS credentials not configured. Set REPLIERS_API_KEY or Bridge credentials in profile settings.' },
            { status: 400 }
          )
        }

        agentId = agentProfile.bridge_agent_id || profile.id
        boardId = agentProfile.mls_board_id
        apiKey = agentProfile.bridge_api_key
      }
    } else {
      agentId = profile.id
      boardId = boardId ?? 'repliers'
    }

    const provider = useRepliers ? 'mls_repliers' : 'mls_bridge'
    const syncTimestamp = new Date().toISOString().substring(0, 16)
    const idempotencyKey = generateIdempotencyKey(provider, agentId!, boardId!, syncTimestamp)

    const { data: existingSync } = await supabase
      .from('webhook_idempotency')
      .select('id, processed_at')
      .eq('key', idempotencyKey)
      .eq('provider', provider)
      .maybeSingle()

    if (existingSync) {
      const processedTime = new Date(existingSync.processed_at)
      const diffMs = Date.now() - processedTime.getTime()
      if (diffMs < 5 * 60 * 1000) {
        return NextResponse.json({
          success: true,
          source: useRepliers ? 'repliers' : 'bridge',
          listings_synced: 0,
          listings_created: 0,
          listings_updated: 0,
          errors: ['Sync already in progress, skipping'],
        })
      }
    }

    await createServiceClient().from('webhook_idempotency').upsert({
      key: idempotencyKey,
      provider,
      processed_at: new Date().toISOString(),
    })

    let listings: NormalizedMlsListing[] = []

    try {
      if (useRepliers) {
        listings = await getRepliersListings({ limit: limit ?? 25, city, state })
      } else {
        if (!agentId || !boardId || !apiKey) {
          return NextResponse.json(
            { error: 'Missing required Bridge MLS parameters: agentId, boardId, apiKey' },
            { status: 400 }
          )
        }
        const bridgeListings = await getListings(agentId, boardId, apiKey)
        listings = bridgeListings.map(bridgeToNormalized)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      console.error('[mls/sync] fetch error:', msg)

      await supabase.from('mls_sync_log').insert({
        org_id: profile.org_id,
        agent_id: profile.id,
        mls_board_id: boardId!,
        listings_synced: 0,
        listings_created: 0,
        listings_updated: 0,
        errors: msg,
        status: 'failed',
      })

      return NextResponse.json(
        {
          success: false,
          source: useRepliers ? 'repliers' : 'bridge',
          listings_synced: 0,
          listings_created: 0,
          listings_updated: 0,
          errors: [msg],
        },
        { status: 400 }
      )
    }

    let created = 0
    let updated = 0
    const syncErrors: string[] = []

    for (const listing of listings) {
      try {
        const result = await upsertMlsListing({
          supabase,
          listing,
          orgId: profile.org_id,
          agentId: profile.id,
          mlsSource: useRepliers ? 'repliers' : 'bridge',
        })
        if (result.action === 'created') created++
        else updated++
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        syncErrors.push(`${listing.mls_number}: ${msg}`)
      }
    }

    const status = syncErrors.length === 0 ? 'success' : 'partial'
    await supabase.from('mls_sync_log').insert({
      org_id: profile.org_id,
      agent_id: profile.id,
      mls_board_id: boardId!,
      listings_synced: listings.length,
      listings_created: created,
      listings_updated: updated,
      errors: syncErrors.length > 0 ? syncErrors.join('; ') : null,
      status,
    })

    await writeAuditLog({
      action: 'mls_sync_manual',
      actorType: 'user',
      actorId: profile.id,
      entityType: 'listing_batch',
      orgId: profile.org_id,
      metadata: {
        source: useRepliers ? 'repliers' : 'bridge',
        boardId,
        listingsSynced: listings.length,
        created,
        updated,
        errors: syncErrors.length,
      },
    })

    const success = syncErrors.length === 0

    return NextResponse.json(
      {
        success,
        source: useRepliers ? 'repliers' : 'bridge',
        listings_synced: listings.length,
        listings_created: created,
        listings_updated: updated,
        errors: syncErrors,
      },
      { status: success ? 200 : 207 }
    )
  } catch (err) {
    console.error('[mls/sync] unexpected error:', err)
    return NextResponse.json({ error: 'An error occurred. Please try again.' }, { status: 500 })
  }
}
