import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { importVehicles } from '@/lib/vehicles/bulkImporter'
import type { VehicleEditState } from '@/lib/vehicles/extractionTypes'

export async function POST(req: NextRequest) {
  try {
    const profile = await requireProfile()
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
