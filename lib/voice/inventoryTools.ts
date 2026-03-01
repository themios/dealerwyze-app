import { createServiceClient } from '@/lib/supabase/service'

/** Strip LIKE wildcards to prevent full-table scan DoS from crafted search strings */
function sanitizeLike(s: string): string {
  return s.replace(/[%_\\]/g, '').slice(0, 100)
}

export interface SearchParams {
  make?:      string
  model?:     string
  year_min?:  number
  year_max?:  number
  max_price?: number
  min_price?: number
  color?:     string
}

/**
 * Search available inventory by flexible criteria.
 * Returns a formatted string for the voice agent — never raw JSON.
 */
export async function searchInventory(orgId: string, params: SearchParams): Promise<string> {
  const supabase = createServiceClient()

  let query = supabase
    .from('vehicles')
    .select('stock_no, year, make, model, trim, color, mileage, price')
    .eq('user_id', orgId)
    .eq('status', 'available')
    .order('price', { ascending: true })
    .limit(6) // fetch 6 so we can show 5 + "and X more"

  if (params.make)      query = query.ilike('make',  `%${sanitizeLike(params.make)}%`)
  if (params.model)     query = query.ilike('model', `%${sanitizeLike(params.model)}%`)
  if (params.color)     query = query.ilike('color', `%${sanitizeLike(params.color)}%`)
  if (params.year_min)  query = query.gte('year', params.year_min)
  if (params.year_max)  query = query.lte('year', params.year_max)
  if (params.max_price) query = query.lte('price', params.max_price)
  if (params.min_price) query = query.gte('price', params.min_price)

  const { data: rows, error } = await query

  if (error) {
    console.error('[searchInventory] db error:', error.message)
    return 'Unable to search inventory right now.'
  }

  if (!rows || rows.length === 0) {
    return 'No matching vehicles in stock right now.'
  }

  const display = rows.slice(0, 5)
  const extra   = rows.length > 5 ? rows.length - 5 : 0

  const lines = display.map(v => {
    const price  = v.price   ? `$${Number(v.price).toLocaleString()}` : 'price TBD'
    const miles  = v.mileage ? `${Number(v.mileage).toLocaleString()} mi` : 'mileage unknown'
    const color  = v.color   ? `, ${v.color}` : ''
    const trim   = v.trim    ? ` ${v.trim}` : ''
    return `• ${v.year} ${v.make} ${v.model}${trim}, ${price}, ${miles}${color} (Stock #${v.stock_no})`
  })

  const header = `Found ${rows.length > 5 ? '5+' : rows.length} vehicle${rows.length !== 1 ? 's' : ''}:`
  const footer = extra > 0 ? `\nand ${extra} more — ask me about a specific model` : ''

  return `${header}\n${lines.join('\n')}${footer}`
}

/**
 * Get full details for a specific vehicle by stock number.
 * Includes ai_summary from any attached documents.
 */
export async function getVehicleDetails(orgId: string, stockNo: string): Promise<string> {
  const supabase = createServiceClient()

  const { data: vehicle, error } = await supabase
    .from('vehicles')
    .select('stock_no, vin, year, make, model, trim, color, mileage, price, notes, voice_summary')
    .eq('user_id', orgId)
    .eq('status', 'available')
    .ilike('stock_no', stockNo.slice(0, 50).trim())
    .single()

  if (error || !vehicle) {
    return `No vehicle found with stock number ${stockNo}.`
  }

  const price   = vehicle.price   ? `$${Number(vehicle.price).toLocaleString()}` : 'price TBD'
  const miles   = vehicle.mileage ? `${Number(vehicle.mileage).toLocaleString()} mi` : 'mileage unknown'
  const trim    = vehicle.trim    ? ` ${vehicle.trim}` : ''
  const color   = vehicle.color   ? `\nColor: ${vehicle.color}` : ''
  const vin     = vehicle.vin     ? `\nVIN: ${vehicle.vin}` : ''
  const notes   = vehicle.notes   ? `\nNotes: ${vehicle.notes}` : ''
  const summary = vehicle.voice_summary ? `\n\nDocument summary:\n${vehicle.voice_summary}` : ''

  return [
    `${vehicle.year} ${vehicle.make} ${vehicle.model}${trim}`,
    `Price: ${price} | Mileage: ${miles}`,
    `Stock #: ${vehicle.stock_no}${vin}${color}${notes}${summary}`,
  ].join('\n')
}
