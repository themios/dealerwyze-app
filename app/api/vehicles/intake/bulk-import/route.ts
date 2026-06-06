import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { writeAuditLog } from '@/lib/audit/log'
import type { ListingEditState } from '@/lib/listings/extractionTypes'

interface BulkImportRequest {
  items: ListingEditState[]
  location_id?: string
}

interface ImportResult {
  success: number
  failed: number
  errors: Array<{ id: string; error: string }>
}

export async function POST(req: NextRequest) {
  try {
    const profile = await requireProfile()
    const { items } = await req.json() as BulkImportRequest

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'No items to import' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const results: ImportResult = { success: 0, failed: 0, errors: [] }

    // Batch insert with dedup check
    for (const item of items) {
      try {
        // Check for duplicate (address, price, beds, baths)
        const { data: existing } = await supabase
          .from('vehicles')
          .select('id')
          .eq('user_id', profile.org_id)
          .eq('address_line1', item.address)
          .eq('price', item.price || null)
          .eq('bedrooms', item.beds || null)
          .eq('bathrooms', item.baths || null)
          .maybeSingle()

        if (existing) {
          results.failed++
          results.errors.push({
            id: item.id,
            error: 'Duplicate listing (same address, price, beds, baths)'
          })
          continue
        }

        // Insert new listing
        // Note: vehicles table requires year, make, model for dealer orgs
        // For RE listings, we use placeholder values
        const { error } = await supabase
          .from('vehicles')
          .insert({
            user_id: profile.org_id,
            stock_no: `AUTO-${Date.now()}`, // Auto-generate stock_no
            year: 2024, // Placeholder for RE listings
            make: 'Property', // Placeholder for RE listings
            model: 'Listing', // Placeholder for RE listings
            price: item.price,
            status: 'available',
            address_line1: item.address,
            bedrooms: item.beds,
            bathrooms: item.baths,
            sqft: item.sqft,
            property_type: item.property_type,
            year_built: item.year_built,
            lot_size: item.lot_size,
            mls_number: item.mls_number,
            notes: item.description,
            created_at: new Date().toISOString()
          })

        if (error) throw error
        results.success++
      } catch (err) {
        results.failed++
        results.errors.push({
          id: item.id,
          error: err instanceof Error ? err.message : 'Unknown error'
        })
      }
    }

    // Audit log for successful imports
    if (results.success > 0) {
      await writeAuditLog({
        orgId: profile.org_id,
        action: 'bulk_listing_import',
        entityType: 'vehicle',
        entityId: null,
        actorType: 'user',
        actorId: profile.id,
        metadata: {
          count: items.length,
          success: results.success,
          failed: results.failed
        }
      })
    }

    return NextResponse.json(results)
  } catch (err) {
    console.error('Bulk import error:', err)
    return NextResponse.json(
      { error: 'Bulk import failed', success: 0, failed: 0, errors: [] },
      { status: 500 }
    )
  }
}
