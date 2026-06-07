/**
 * Auction Settings API
 * GET: Fetch auction sync config for org
 * PUT: Save auction sync config
 */

import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/lib/audit/log'

export async function GET() {
  const profile = await requireProfile()
  const supabase = await createClient()

  // Fetch auction sync config for this org
  const { data, error } = await supabase
    .from('org_auction_sync_config')
    .select('*')
    .eq('org_id', profile.org_id)
    .maybeSingle()

  if (error) {
    console.error('[auction-settings] GET error:', error.message)
    return NextResponse.json({ error: 'Failed to load auction settings' }, { status: 500 })
  }

  // If no config exists, return defaults
  if (!data) {
    return NextResponse.json({
      enabled: false,
      copart_enabled: false,
      copart_api_key: '',
      copart_username: '',
      acv_enabled: false,
      acv_api_key: '',
      last_sync_at: null,
      last_sync_status: null,
      last_sync_count: 0,
    })
  }

  // Return config (API keys masked for security - they're set only on save)
  return NextResponse.json({
    enabled: data.enabled,
    copart_enabled: data.copart_enabled,
    copart_api_key: data.copart_api_key ? '••••••••' : '',
    copart_username: data.copart_username || '',
    acv_enabled: data.acv_enabled,
    acv_api_key: data.acv_api_key ? '••••••••' : '',
    last_sync_at: data.last_sync_at,
    last_sync_status: data.last_sync_status,
    last_sync_count: data.last_sync_count,
  })
}

export async function PUT(req: NextRequest) {
  const profile = await requireProfile()
  const supabase = await createClient()

  const config = await req.json()

  // Validate input
  if (typeof config.enabled !== 'boolean') {
    return NextResponse.json({ error: 'Invalid config' }, { status: 400 })
  }

  // Check org vertical - auction sync only for dealer
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('vertical')
    .eq('id', profile.org_id)
    .single()

  if (orgError || org?.vertical !== 'dealer') {
    return NextResponse.json(
      { error: 'Auction sync is only available for dealer orgs' },
      { status: 403 }
    )
  }

  // Prepare update payload - only update if keys are not masked
  interface UpdatePayload {
    org_id: string
    enabled: boolean
    copart_enabled: boolean
    copart_username: string | null
    copart_api_key?: string
    acv_enabled: boolean
    acv_api_key?: string
  }
  const updateData: UpdatePayload = {
    org_id: profile.org_id,
    enabled: config.enabled,
    copart_enabled: config.copart_enabled ?? false,
    copart_username: config.copart_username || null,
    acv_enabled: config.acv_enabled ?? false,
  }

  // Only update API keys if they're not masked
  if (config.copart_api_key && !config.copart_api_key.startsWith('•')) {
    updateData.copart_api_key = config.copart_api_key
  }
  if (config.acv_api_key && !config.acv_api_key.startsWith('•')) {
    updateData.acv_api_key = config.acv_api_key
  }

  // Upsert sync config
  const { error: upsertError, data: upsertedData } = await supabase
    .from('org_auction_sync_config')
    .upsert(updateData, { onConflict: 'org_id' })
    .select()
    .single()

  if (upsertError) {
    console.error('[auction-settings] PUT error:', upsertError.message)
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
  }

  // Audit log
  await writeAuditLog({
    orgId: profile.org_id,
    actorId: profile.id,
    actorType: 'user',
    action: 'settings_updated',
    entityType: 'org_auction_sync_config',
    entityId: upsertedData.id,
    metadata: {
      enabled: config.enabled,
      copart_enabled: config.copart_enabled,
      acv_enabled: config.acv_enabled,
    },
  })

  // Return updated config (with masked keys)
  return NextResponse.json({
    enabled: upsertedData.enabled,
    copart_enabled: upsertedData.copart_enabled,
    copart_api_key: upsertedData.copart_api_key ? '••••••••' : '',
    copart_username: upsertedData.copart_username || '',
    acv_enabled: upsertedData.acv_enabled,
    acv_api_key: upsertedData.acv_api_key ? '••••••••' : '',
    last_sync_at: upsertedData.last_sync_at,
    last_sync_status: upsertedData.last_sync_status,
    last_sync_count: upsertedData.last_sync_count,
  })
}
