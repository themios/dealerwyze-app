import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const profile = await requireProfile()
  const client = await createClient()

  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const buyerId = searchParams.get('buyer_id')
    const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 100)
    const offset = parseInt(searchParams.get('offset') || '0', 10)

    // Build query
    let query = client
      .from('matched_opportunities')
      .select(
        `
        id,
        status,
        matched_at,
        agent_notified_at,
        buyer_profile_id,
        listing_id,
        buyer_profiles!inner (
          id,
          buyer_name,
          location,
          price_min,
          price_max,
          bedrooms_min,
          bedrooms_max,
          bathrooms_min,
          bathrooms_max,
          sqft_min,
          sqft_max,
          year_built_min,
          year_built_max,
          property_type,
          hoa_allowed
        ),
        vehicles!inner (
          id,
          address,
          city,
          bedrooms,
          bathrooms,
          price,
          sqft,
          year_built,
          property_type,
          mls_number,
          photos
        )
      `,
        { count: 'exact' }
      )
      .eq('buyer_profiles.agent_id', profile.id)

    // Apply filters
    if (status) {
      query = query.eq('status', status)
    }
    if (buyerId) {
      query = query.eq('buyer_profile_id', buyerId)
    }

    // Order and paginate
    const { data, error, count } = await query
      .order('matched_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) throw error

    return NextResponse.json({
      matches: data || [],
      total: count || 0,
      hasMore: (offset + limit) < (count || 0),
    })
  } catch (err) {
    console.error('Error fetching matched opportunities:', err)
    return NextResponse.json(
      { error: 'Failed to fetch matched opportunities' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  const profile = await requireProfile()
  const client = await createClient()

  try {
    const { ids, status } = await request.json()

    if (!ids || !Array.isArray(ids) || ids.length === 0 || !status) {
      return NextResponse.json(
        { error: 'ids (array) and status required' },
        { status: 400 }
      )
    }

    // Validate status
    const validStatuses = ['new', 'sent', 'reviewed', 'ignored', 'closed']
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${validStatuses.join(', ')}` },
        { status: 400 }
      )
    }

    // Verify ownership: all opportunities must belong to this agent's buyer profiles
    const { data: opportunities, error: fetchError } = await client
      .from('matched_opportunities')
      .select(
        `
        id,
        buyer_profile_id,
        buyer_profiles!inner (
          id,
          agent_id
        )
      `
      )
      .in('id', ids)

    if (fetchError) throw fetchError

    if (!opportunities || opportunities.length === 0) {
      return NextResponse.json(
        { error: 'No matched opportunities found' },
        { status: 404 }
      )
    }

    // Check ownership of all opportunities
    for (const opp of opportunities as any[]) {
      if (opp.buyer_profiles.agent_id !== profile.id) {
        return NextResponse.json(
          { error: 'Not authorized' },
          { status: 403 }
        )
      }
    }

    // Build update payload
    const updateData: Record<string, unknown> = { status }
    if (status === 'sent') {
      updateData.agent_notified_at = new Date().toISOString()
    }

    // Update all opportunities
    const { error: updateError } = await client
      .from('matched_opportunities')
      .update(updateData)
      .in('id', ids)

    if (updateError) throw updateError

    return NextResponse.json({
      updated: ids.length,
    })
  } catch (err) {
    console.error('Error bulk updating matched opportunities:', err)
    return NextResponse.json(
      { error: 'Failed to update matched opportunities' },
      { status: 500 }
    )
  }
}
