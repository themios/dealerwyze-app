import { createClient } from '@/lib/supabase/server';
import { requireProfile } from '@/lib/auth/profile';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const UpdateBuyerProfileSchema = z.object({
  buyer_name: z.string().min(1).max(255).optional(),
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

type UpdateBuyerProfile = z.infer<typeof UpdateBuyerProfileSchema>;

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const profile = await requireProfile();
  const client = createClient();

  try {
    const body = await request.json();
    const validated = UpdateBuyerProfileSchema.parse(body);

    // Verify ownership before updating
    const { data: existing, error: fetchError } = await client
      .from('buyer_profiles')
      .select('id')
      .eq('id', params.id)
      .eq('agent_id', profile.id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: 'Buyer profile not found' },
        { status: 404 }
      );
    }

    // Build update object with only provided fields
    const updateObj: any = {};
    if (validated.buyer_name !== undefined) updateObj.buyer_name = validated.buyer_name;
    if (validated.bedrooms_min !== undefined) updateObj.bedrooms_min = validated.bedrooms_min;
    if (validated.bedrooms_max !== undefined) updateObj.bedrooms_max = validated.bedrooms_max;
    if (validated.bathrooms_min !== undefined) updateObj.bathrooms_min = validated.bathrooms_min;
    if (validated.bathrooms_max !== undefined) updateObj.bathrooms_max = validated.bathrooms_max;
    if (validated.price_min !== undefined) updateObj.price_min = validated.price_min;
    if (validated.price_max !== undefined) updateObj.price_max = validated.price_max;
    if (validated.sqft_min !== undefined) updateObj.sqft_min = validated.sqft_min;
    if (validated.sqft_max !== undefined) updateObj.sqft_max = validated.sqft_max;
    if (validated.location !== undefined) updateObj.location = validated.location;
    if (validated.year_built_min !== undefined) updateObj.year_built_min = validated.year_built_min;
    if (validated.year_built_max !== undefined) updateObj.year_built_max = validated.year_built_max;
    if (validated.property_type !== undefined) updateObj.property_type = validated.property_type;
    if (validated.hoa_allowed !== undefined) updateObj.hoa_allowed = validated.hoa_allowed;
    if (validated.notes !== undefined) updateObj.notes = validated.notes;
    if (validated.active !== undefined) updateObj.active = validated.active;
    updateObj.updated_at = new Date().toISOString();

    const { data, error } = await client
      .from('buyer_profiles')
      .update(updateObj)
      .eq('id', params.id)
      .eq('agent_id', profile.id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: err.errors },
        { status: 400 }
      );
    }
    console.error('Error updating buyer profile:', err);
    return NextResponse.json(
      { error: 'Failed to update buyer profile' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const profile = await requireProfile();
  const client = createClient();

  try {
    // Verify ownership before deleting
    const { data: existing, error: fetchError } = await client
      .from('buyer_profiles')
      .select('id')
      .eq('id', params.id)
      .eq('agent_id', profile.id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: 'Buyer profile not found' },
        { status: 404 }
      );
    }

    const { error } = await client
      .from('buyer_profiles')
      .delete()
      .eq('id', params.id)
      .eq('agent_id', profile.id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error deleting buyer profile:', err);
    return NextResponse.json(
      { error: 'Failed to delete buyer profile' },
      { status: 500 }
    );
  }
}
