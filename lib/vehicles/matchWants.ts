import { createServiceClient } from '@/lib/supabase/service'
import { sendLeadNotification } from '@/lib/push/send'
import { sendTelegramMessage } from '@/lib/notifications/telegram'

export interface VehicleForMatch {
  id: string
  user_id: string
  year: number | null
  make: string | null
  model: string | null
  body_style: string | null
  price: number | null
}

/**
 * Check all active vehicle_wants for this org against a vehicle that just
 * became available. Creates a Tier-1 inbound activity for each match so the
 * dealer can review and decide whether to reach out.
 */
export async function matchVehicleWants(vehicle: VehicleForMatch): Promise<number> {
  const supabase = createServiceClient()

  // Fetch all active wants for this org
  const { data: wants } = await supabase
    .from('vehicle_wants')
    .select('id, customer_id, year_min, year_max, make, model, body_style, max_price, notes, customers(name)')
    .eq('user_id', vehicle.user_id)
    .eq('status', 'active')

  if (!wants || wants.length === 0) return 0

  const norm = (s: string | null | undefined) =>
    (s ?? '').toLowerCase().replace(/[-\s]/g, '')

  const matches = wants.filter(w => {
    // Year range check
    if (w.year_min && vehicle.year && vehicle.year < w.year_min) return false
    if (w.year_max && vehicle.year && vehicle.year > w.year_max) return false

    // Price check
    if (w.max_price && vehicle.price && vehicle.price > w.max_price) return false

    // At least one of body_style OR make/model must match
    const bodyMatch = w.body_style && vehicle.body_style &&
      norm(w.body_style) === norm(vehicle.body_style)

    const makeMatch = w.make && vehicle.make &&
      norm(w.make) === norm(vehicle.make)

    const modelMatch = w.model && vehicle.model &&
      norm(w.model) === norm(vehicle.model)

    // body_style match is sufficient for fuzzy (e.g. "pickup truck any make")
    if (bodyMatch) return true

    // make match alone (e.g. "any Ford")
    if (makeMatch && !w.model) return true

    // make + model match
    if (makeMatch && modelMatch) return true

    return false
  })

  if (matches.length === 0) return 0

  const vehicleLabel = [vehicle.year, vehicle.make, vehicle.model]
    .filter(Boolean).join(' ')

  let notified = 0

  for (const want of matches) {
    const customerName = (want.customers as unknown as { name: string } | null)?.name ?? 'Customer'

    // Create inbound high-priority activity so it surfaces in Today Tier 1
    const { error } = await supabase.from('activities').insert({
      user_id: vehicle.user_id,
      customer_id: want.customer_id,
      vehicle_id: vehicle.id,
      type: 'vehicle_match',
      direction: 'inbound',
      outcome: 'pending',
      priority: 'high',
      body: [
        `Vehicle match for ${customerName}`,
        `Want criteria: ${formatWantLabel(want)}`,
        `Matched vehicle: ${vehicleLabel}${vehicle.price ? ` - $${vehicle.price.toLocaleString()}` : ''}`,
        want.notes ? `Notes: ${want.notes}` : '',
      ].filter(Boolean).join('\n'),
    })

    if (error) continue
    notified++
  }

  if (notified > 0) {
    sendLeadNotification({
      title: `${notified} Want List Match${notified !== 1 ? 'es' : ''}`,
      body: `${vehicleLabel} matches ${notified} customer${notified !== 1 ? 's' : ''} on your want list`,
      url: '/today',
    }, vehicle.user_id).catch(() => {})

    sendTelegramMessage(
      `<b>Want List Match</b>\n` +
      `<b>${vehicleLabel}</b> just arrived and matches <b>${notified}</b> customer${notified !== 1 ? 's' : ''} on your want list.\n` +
      `Open DealerWyze to review and reach out.`
    ).catch(() => {})
  }

  return notified
}

function formatWantLabel(want: {
  year_min?: number | null
  year_max?: number | null
  make?: string | null
  model?: string | null
  body_style?: string | null
  max_price?: number | null
}): string {
  const parts: string[] = []
  if (want.year_min && want.year_max) parts.push(`${want.year_min}-${want.year_max}`)
  else if (want.year_min) parts.push(`${want.year_min}+`)
  else if (want.year_max) parts.push(`up to ${want.year_max}`)
  if (want.make) parts.push(want.make)
  if (want.model) parts.push(want.model)
  else if (want.body_style) parts.push(want.body_style)
  if (want.max_price) parts.push(`under $${want.max_price.toLocaleString()}`)
  return parts.join(' ') || 'Any vehicle'
}
