import type { SupabaseClient } from '@supabase/supabase-js'

export interface FeedVehicle {
  id:          string
  stock_no:    string
  vin:         string | null
  year:        number
  make:        string
  model:       string
  trim:        string | null
  color:       string | null
  mileage:     number | null
  price:       number | null
  notes:       string | null
  photo_url:   string | null
  listing_url: string | null
}

// ── Data fetch ──────────────────────────────────────────────────────────────

export async function getAvailableVehicles(
  supabase: SupabaseClient,
  orgId: string
): Promise<{ vehicles: FeedVehicle[]; error: string | null }> {
  const { data, error } = await supabase
    .from('vehicles')
    .select('id, stock_no, vin, year, make, model, trim, color, mileage, price, notes, photo_url, listing_url')
    .eq('user_id', orgId)
    .eq('status', 'available')
    .gt('price', 0)             // H2: exclude zero/null-price vehicles from feeds
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[feeds] getAvailableVehicles error:', error)
    return { vehicles: [], error: error.message }
  }
  return { vehicles: (data ?? []) as FeedVehicle[], error: null }
}

// ── CSV helpers ─────────────────────────────────────────────────────────────

function escapeField(val: string | number | null | undefined): string {
  const s = val == null ? '' : String(val)
  // RFC 4180: wrap in double-quotes if field contains comma, double-quote, newline, or CR
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function toCsvRow(fields: Array<string | number | null | undefined>): string {
  return fields.map(escapeField).join(',')
}

function vehicleDescription(v: FeedVehicle): string {
  if (v.notes?.trim()) return v.notes.trim()
  const trim = v.trim ? ` ${v.trim}` : ''
  return `${v.year} ${v.make} ${v.model}${trim} available at Apollo Auto, El Monte CA. Call (818) 873-3123.`
}

// ── CarGurus feed ───────────────────────────────────────────────────────────
// Header names match CarGurus standard dealer CSV feed spec.
// Verify against your dealer portal feed template tab before first upload.
const CG_HEADERS = [
  'VIN',
  'StockNumber',    // H3: no space — CarGurus spec uses camelCase
  'Year',
  'Make',
  'Model',
  'Trim',
  'Mileage',
  'Price',
  'ExteriorColor',  // H3: no space
  'Description',
  'ImageURLs',      // H3: plural
]

export function buildCarGurusCSV(vehicles: FeedVehicle[]): string {
  const lines: string[] = [toCsvRow(CG_HEADERS)]
  for (const v of vehicles) {
    lines.push(toCsvRow([
      v.vin,
      v.stock_no,
      v.year,
      v.make,
      v.model,
      v.trim,
      v.mileage ?? 0,
      v.price ?? 0,
      v.color,
      vehicleDescription(v),
      v.photo_url,
    ]))
  }
  return lines.join('\r\n') + '\r\n'  // H1: RFC 4180 requires trailing CRLF
}

// ── Facebook vehicle catalog feed ───────────────────────────────────────────

const FB_HEADERS = [
  'id',
  'availability',
  'condition',
  'title',
  'description',
  'price',
  'image_link',
  'link',
  'year',
  'make',
  'model',
  'trim',
  'mileage',
  'vin',
  'exterior_color',
  'body_style',
  'drivetrain',
  'transmission',
  'fuel_type',
]

const DEALER_INVENTORY_URL = 'https://www.apolloauto-em.com/cars-for-sale'

export function buildFacebookCSV(vehicles: FeedVehicle[]): string {
  const lines: string[] = [toCsvRow(FB_HEADERS)]
  for (const v of vehicles) {
    lines.push(toCsvRow([
      v.stock_no,                                               // id
      'in stock',                                               // availability
      'used',                                                   // condition
      `${v.year} ${v.make} ${v.model}`,                        // title
      vehicleDescription(v),                                    // description
      v.price && v.price > 0 ? `${v.price} USD` : '',          // H2: blank if no price
      v.photo_url,                                              // image_link
      v.listing_url ?? DEALER_INVENTORY_URL,                    // link
      v.year,                                                   // year
      v.make,                                                   // make
      v.model,                                                  // model
      v.trim,                                                   // trim
      v.mileage ?? 0,                                           // mileage
      v.vin,                                                    // vin
      v.color,                                                  // exterior_color
      '',                                                       // body_style — not in DB
      '',                                                       // drivetrain — not in DB
      '',                                                       // transmission — not in DB
      '',                                                       // fuel_type — not in DB
    ]))
  }
  return lines.join('\r\n') + '\r\n'  // H1: RFC 4180 requires trailing CRLF
}
