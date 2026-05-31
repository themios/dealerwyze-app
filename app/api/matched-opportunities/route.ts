import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth/profile';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const profile = await requireProfile();
  const client = createClient();

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'new';
    const limit = parseInt(searchParams.get('limit') || '10', 10);

    // Get matched opportunities for this agent's buyer profiles
    const { data, error } = await client
      .from('matched_opportunities')
      .select(`
        id,
        status,
        matched_at,
        agent_notified_at,
        buyer_profile_id,
        listing_id,
        buyer_profiles!inner (
          id,
          buyer_name,
          location
        ),
        vehicles!inner (
          id,
          address,
          bedrooms,
          bathrooms,
          price,
          photos
        )
      `)
      .eq('buyer_profiles.agent_id', profile.id)
      .eq('status', status)
      .order('matched_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return NextResponse.json(data || []);
  } catch (err) {
    console.error('Error fetching matched opportunities:', err);
    return NextResponse.json(
      { error: 'Failed to fetch matched opportunities' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const profile = await requireProfile();
  const client = createClient();

  try {
    const { id, status } = await request.json();

    if (!id || !status) {
      return NextResponse.json(
        { error: 'id and status required' },
        { status: 400 }
      );
    }

    // Verify ownership: the matched opportunity must belong to this agent's buyer profile
    const { data: existing, error: fetchError } = await client
      .from('matched_opportunities')
      .select(`
        id,
        buyer_profile_id,
        buyer_profiles!inner (
          id,
          agent_id
        )
      `)
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: 'Matched opportunity not found' },
        { status: 404 }
      );
    }

    const buyerProfile = existing.buyer_profiles as any;
    if (buyerProfile.agent_id !== profile.id) {
      return NextResponse.json(
        { error: 'Not authorized' },
        { status: 403 }
      );
    }

    // Update status
    const updateData: any = { status };
    if (status === 'notified') {
      updateData.agent_notified_at = new Date().toISOString();
    }

    const { data, error: updateError } = await client
      .from('matched_opportunities')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;

    return NextResponse.json(data);
  } catch (err) {
    console.error('Error updating matched opportunity:', err);
    return NextResponse.json(
      { error: 'Failed to update matched opportunity' },
      { status: 500 }
    );
  }
}
