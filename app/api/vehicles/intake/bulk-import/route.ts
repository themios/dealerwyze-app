import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { importVehicles } from '@/lib/vehicles/bulkImporter'
import { writeAuditLog } from '@/lib/audit/log'
import { orgBulkExtractLimiter } from '@/lib/rateLimit/upstash'
import type { VehicleEditState } from '@/lib/vehicles/extractionTypes'

export async function POST(req: NextRequest) {
  try {
    const profile = await requireProfile()
    const orgId = profile.org_id

    // Rate limit: paste bulk import shares quota with Monroney extract (3/hour)
    const limiter = await orgBulkExtractLimiter(orgId)
    if (!limiter.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Try again in 1 hour.' },
        { status: 429 },
      )
    }

    // Vertical enforcement: paste bulk import is dealer-only
    const supabase = await createClient()
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('vertical')
      .eq('id', orgId)
      .maybeSingle()

    if (!org || orgError) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      )
    }

    if (org.vertical !== 'dealer') {
      // Log vertical mismatch attempt for audit trail
      await writeAuditLog({
        orgId,
        actorId: profile.id,
        actorType: 'user',
        action: 'vertical_violation_bulk_import',
        entityType: 'vehicle',
        entityId: null,
        metadata: {
          org_vertical: org.vertical,
          reason: 'Bulk vehicle import restricted to dealer vertical',
        },
      })

      return NextResponse.json(
        { error: 'Vehicle import is not available for your organization type' },
        { status: 403 }
      )
    }

    const { items } = (await req.json()) as { items: VehicleEditState[] }

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'No items to import', success: 0, failed: 0, errors: [] },
        { status: 400 },
      )
    }

    // Import vehicles using the bulk importer utility
    const results = await importVehicles(profile.org_id, items, profile.id, 'paste')

    return NextResponse.json(results)
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[bulk-import] error:', errorMsg)

    return NextResponse.json(
      { error: 'Bulk import failed', success: 0, failed: 0, errors: [] },
      { status: 500 },
    )
  }
}
