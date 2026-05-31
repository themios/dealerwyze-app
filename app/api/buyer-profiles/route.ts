import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth/profile';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const CreateBuyerProfileSchema = z.object({
  buyer_name: z.string().min(1, 'Buyer name is required').max(255),
  bedrooms_min: z.number().int().min(0).nullable().optional(),
  bedrooms_max: z.number().int().min(0).nullable().optional(),
  bathrooms_min: z.number().min(0).nullable().optional(),
  bathrooms_max: z.number().min(0).nullable().optional(),
  price_min: z.number().int().min(0).nullable().optional(),
  price_max: z.number().int().min(0).nullable().optional(),
  sqft_min: z.number().int().min(0).nullable().optional(),
  sqft_max: z.number().int().min(0).nullable().optional(),
  location: z.string().max(255).nullable().optional(),
  year_built_min: z.number().int().min(1800).nullable().optional(),
  year_built_max: z.number().int().min(1800).nullable().optional(),
  property_type: z.enum(['any', 'single_family', 'condo', 'townhouse', 'multi_family']).optional(),
  hoa_allowed: z.boolean().optional(),
  notes: z.string().nullable().optional(),
  active: z.boolean().optional(),
});


export async function GET(request: NextRequest) {
  const profile = await requireProfile();
  const client = await createClient();

  try {
    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0'), 0);

    // Validate pagination params
    if (isNaN(limit) || isNaN(offset) || limit < 1) {
      return NextResponse.json(
        { error: 'Invalid pagination parameters' },
        { status: 400 }
      );
    }

    // Fetch total count
    const { count } = await client
      .from('buyer_profiles')
      .select('*', { count: 'exact' })
      .eq('agent_id', profile.id);

    // Fetch paginated data
    const { data, error } = await client
      .from('buyer_profiles')
      .select('*')
      .eq('agent_id', profile.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return NextResponse.json({
      data: data || [],
      total: count || 0,
      limit,
      offset,
      hasMore: offset + limit < (count || 0),
    });
  } catch (err) {
    console.error('Error fetching buyer profiles:', err);
    return NextResponse.json(
      { error: 'Failed to fetch buyer profiles' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const profile = await requireProfile();
  const client = await createClient();

  try {
    const body = await request.json();
    const validated = CreateBuyerProfileSchema.parse(body);

    // Validate ranges
    if (
      validated.bedrooms_min != null &&
      validated.bedrooms_max != null &&
      validated.bedrooms_min > validated.bedrooms_max
    ) {
      return NextResponse.json(
        { error: 'Bedrooms min must be less than or equal to max' },
        { status: 400 }
      );
    }

    if (
      validated.bathrooms_min != null &&
      validated.bathrooms_max != null &&
      validated.bathrooms_min > validated.bathrooms_max
    ) {
      return NextResponse.json(
        { error: 'Bathrooms min must be less than or equal to max' },
        { status: 400 }
      );
    }

    if (
      validated.price_min != null &&
      validated.price_max != null &&
      validated.price_min > validated.price_max
    ) {
      return NextResponse.json(
        { error: 'Price min must be less than or equal to max' },
        { status: 400 }
      );
    }

    if (
      validated.sqft_min != null &&
      validated.sqft_max != null &&
      validated.sqft_min > validated.sqft_max
    ) {
      return NextResponse.json(
        { error: 'Sqft min must be less than or equal to max' },
        { status: 400 }
      );
    }

    if (
      validated.year_built_min != null &&
      validated.year_built_max != null &&
      validated.year_built_min > validated.year_built_max
    ) {
      return NextResponse.json(
        { error: 'Year built min must be less than or equal to max' },
        { status: 400 }
      );
    }

    // Get user's org_id from profile
    const { data: profileData, error: profileError } = await client
      .from('profiles')
      .select('org_id')
      .eq('id', profile.id)
      .single();

    if (profileError || !profileData) {
      throw new Error('Could not retrieve org_id');
    }

    const { data, error } = await client
      .from('buyer_profiles')
      .insert({
        agent_id: profile.id,
        org_id: profileData.org_id,
        buyer_name: validated.buyer_name,
        bedrooms_min: validated.bedrooms_min || null,
        bedrooms_max: validated.bedrooms_max || null,
        bathrooms_min: validated.bathrooms_min || null,
        bathrooms_max: validated.bathrooms_max || null,
        price_min: validated.price_min || null,
        price_max: validated.price_max || null,
        sqft_min: validated.sqft_min || null,
        sqft_max: validated.sqft_max || null,
        location: validated.location || null,
        year_built_min: validated.year_built_min || null,
        year_built_max: validated.year_built_max || null,
        property_type: validated.property_type || 'any',
        hoa_allowed: validated.hoa_allowed !== false,
        notes: validated.notes || null,
        active: validated.active !== false,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: err.errors },
        { status: 400 }
      );
    }
    console.error('Error creating buyer profile:', err);
    return NextResponse.json(
      { error: 'Failed to create buyer profile' },
      { status: 500 }
    );
  }
}
