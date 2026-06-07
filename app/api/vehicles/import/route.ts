import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { parseVehicleCSV } from '@/lib/leads/spreadsheetImport'
import { importVehicles } from '@/lib/vehicles/bulkImporter'
import { writeAuditLog } from '@/lib/audit/log'
import { orgCsvImportLimiter } from '@/lib/rateLimit/upstash'
import type { VehicleEditState } from '@/lib/vehicles/extractionTypes'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const orgId = profile.org_id

  // Rate limit: 5 CSV imports per org per hour
  const limiter = await orgCsvImportLimiter(orgId)
  if (!limiter.allowed) {
    return NextResponse.json(
      { error: 'CSV import limit exceeded. Try again in 1 hour.' },
      { status: 429 }
    )
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json(
        { error: 'File is required' },
        { status: 400 }
      )
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
      return NextResponse.json(
        { error: 'Only CSV files are supported' },
        { status: 400 }
      )
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File exceeds 10MB limit' },
        { status: 413 }
      )
    }

    // Parse CSV
    const { vehicles: parsedVehicles, errors: parseErrors } = await parseVehicleCSV(file)

    if (parsedVehicles.length === 0) {
      return NextResponse.json({
        success: false,
        message: parseErrors.join('; '),
        result: { success: 0, failed: 0, errors: [] },
      })
    }

    // Convert ParsedVehicle to VehicleEditState for bulk importer
    const vehicleItems: VehicleEditState[] = parsedVehicles.map((v) => ({
      id: crypto.randomUUID(),
      selected: true,
      year: v.year!,
      make: v.make!,
      model: v.model!,
      vin: v.vin ?? undefined,
      price: v.price,
      mileage: v.mileage,
      color: v.color,
      condition: v.condition,
    }))

    // Persist to database
    const result = await importVehicles(orgId, vehicleItems, profile.id, 'csv')

    // Log import action
    await writeAuditLog({
      orgId,
      actorId: profile.id,
      actorType: 'user',
      action: 'csv_vehicle_import',
      entityType: 'vehicle',
      entityId: null,
      metadata: {
        filename: file.name,
        total: vehicleItems.length,
        success: result.success,
        failed: result.failed,
        parseErrors: parseErrors.length,
      },
    })

    return NextResponse.json({
      success: result.failed === 0,
      message: result.failed === 0
        ? `Successfully imported ${result.success} vehicles`
        : `Imported ${result.success} of ${vehicleItems.length} vehicles (${result.failed} failed)`,
      result,
      parseErrors: parseErrors.length > 0 ? parseErrors : undefined,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[vehicles/import]', message)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
