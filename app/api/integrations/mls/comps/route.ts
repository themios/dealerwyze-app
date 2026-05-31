/**
 * GET /api/integrations/mls/comps
 *
 * Comparable listings lookup (stub for post-GA implementation)
 *
 * Query params:
 * - address: string (property address)
 * - bedrooms: int (optional)
 * - bathrooms: float (optional)
 * - sqft: int (optional)
 * - radius: int (miles, default 1)
 *
 * Returns:
 * - Array of comparable listings from Bridge API
 *
 * NOTE: Stubbed for post-GA. Implementation requires:
 * 1. Bridge Comps API endpoint access
 * 2. Agent's MLS board setup (API key)
 * 3. Geocoding address to coordinates (for radius search)
 * 4. Caching to avoid rate limit issues
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'

const CompsQuerySchema = z.object({
  address: z.string().min(5),
  bedrooms: z.coerce.number().int().nonnegative().optional(),
  bathrooms: z.coerce.number().nonnegative().optional(),
  sqft: z.coerce.number().int().nonnegative().optional(),
  radius: z.coerce.number().int().positive().default(1),
})

export async function GET(req: NextRequest) {
  try {
    const profile = await requireProfile()
    const supabase = await createClient()

    // Verify agent is on a RE org
    const { data: org } = await supabase
      .from('organizations')
      .select('vertical')
      .eq('id', profile.org_id)
      .single()

    if (org?.vertical !== 'real_estate') {
      return NextResponse.json(
        { error: 'Comps lookup only available for real estate agents' },
        { status: 403 }
      )
    }

    // Parse and validate query params
    const queryObj = Object.fromEntries(req.nextUrl.searchParams)
    const parsed = CompsQuerySchema.safeParse(queryObj)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    // STUB: Return placeholder response
    // TODO: Implement after GA when Bridge Comps API access confirmed
    return NextResponse.json({
      status: 'not_implemented',
      message: 'Comps lookup is coming in Q2 2026',
      requested_address: parsed.data.address,
      criteria: {
        bedrooms: parsed.data.bedrooms,
        bathrooms: parsed.data.bathrooms,
        sqft: parsed.data.sqft,
        radius_miles: parsed.data.radius,
      },
      comps: [],
    }, { status: 501 })
  } catch (err) {
    console.error('[mls/comps] unexpected error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
