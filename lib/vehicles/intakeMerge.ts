const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/i

export interface VehicleIntakeIncoming {
  vin?: string | null
  year?: number | null
  make?: string | null
  model?: string | null
  trim?: string | null
  mileage?: number | null
  color?: string | null
  purchase_price?: number | null
  purchased_from?: string | null
  purchased_at?: string | null
  acquisition_source?: 'auction' | 'private' | 'trade_in' | 'dealer_trade' | 'other' | null
  auction_name?: string | null
  auction_lot?: string | null
  acquisition_notes?: string | null
  notes?: string | null
}

export interface ExistingVehicleForMerge {
  vin?: string | null
  stock_no?: string | null
  year?: number | null
  make?: string | null
  model?: string | null
  trim?: string | null
  mileage?: number | null
  color?: string | null
  purchase_price?: number | null
  purchased_from?: string | null
  purchased_at?: string | null
  acquisition_source?: string | null
  auction_name?: string | null
  auction_lot?: string | null
  acquisition_notes?: string | null
}

export interface MergePreviewChange {
  field: string
  label: string
  mode: 'fill' | 'append'
  current: string | null
  incoming: string | null
  next: string | null
}

export interface MergePreviewIgnored {
  field: string
  label: string
  current: string | null
  incoming: string | null
  reason: string
}

export interface IntakeMergeResult {
  patch: Record<string, unknown>
  additions: MergePreviewChange[]
  ignored: MergePreviewIgnored[]
}

const FIELD_LABELS: Record<string, string> = {
  vin: 'VIN',
  stock_no: 'Stock #',
  year: 'Year',
  make: 'Make',
  model: 'Model',
  trim: 'Trim',
  mileage: 'Mileage',
  color: 'Color',
  purchase_price: 'Purchase price',
  purchased_from: 'Purchased from',
  purchased_at: 'Purchase date',
  acquisition_source: 'Acquisition source',
  auction_name: 'Auction name',
  auction_lot: 'Auction ID / lot',
  acquisition_notes: 'Acquisition notes',
}

function labelFor(field: string): string {
  return FIELD_LABELS[field] ?? field
}

function normalizeText(value: unknown, maxLen: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, maxLen) : null
}

function normalizeDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function displayValue(value: unknown): string | null {
  if (value == null) return null
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2)
  if (typeof value === 'string') return value || null
  return String(value)
}

function appendNotes(current: string, incoming: string): string {
  return `${current.trim()}\n\nImported intake notes:\n${incoming.trim()}`
}

export function computeVehicleIntakeMerge(
  existing: ExistingVehicleForMerge,
  incoming: VehicleIntakeIncoming,
): IntakeMergeResult {
  const patch: Record<string, unknown> = {}
  const additions: MergePreviewChange[] = []
  const ignored: MergePreviewIgnored[] = []

  const cleanVin = normalizeText(incoming.vin, 17)?.toUpperCase() ?? null
  const normalizedTrim = normalizeText(incoming.trim, 60)
  const normalizedColor = normalizeText(incoming.color, 40)
  const normalizedPurchasedFrom = normalizeText(incoming.purchased_from, 120)
  const normalizedPurchasedAt = normalizeDate(incoming.purchased_at)
  const normalizedAuctionName = normalizeText(incoming.auction_name, 120)
  const normalizedAuctionLot = normalizeText(incoming.auction_lot, 80)
  const normalizedNotes = normalizeText(incoming.acquisition_notes ?? incoming.notes, 4000)
  const normalizedMileage = normalizeNumber(incoming.mileage)
  const normalizedPurchasePrice = normalizeNumber(incoming.purchase_price)

  function fillField(field: keyof ExistingVehicleForMerge, value: unknown) {
    const current = existing[field]
    if (value == null || value === '') return
    if (current == null || current === '') {
      patch[field] = value
      additions.push({
        field: String(field),
        label: labelFor(String(field)),
        mode: 'fill',
        current: displayValue(current),
        incoming: displayValue(value),
        next: displayValue(value),
      })
      return
    }

    if (displayValue(current) !== displayValue(value)) {
      ignored.push({
        field: String(field),
        label: labelFor(String(field)),
        current: displayValue(current),
        incoming: displayValue(value),
        reason: 'Existing vehicle already has a different value',
      })
    }
  }

  if (cleanVin && VIN_REGEX.test(cleanVin)) {
    fillField('vin', cleanVin)
    if (!existing.stock_no && cleanVin.length >= 6) {
      const derivedStock = cleanVin.slice(-6)
      patch.stock_no = derivedStock
      additions.push({
        field: 'stock_no',
        label: labelFor('stock_no'),
        mode: 'fill',
        current: displayValue(existing.stock_no),
        incoming: derivedStock,
        next: derivedStock,
      })
    }
  }

  fillField('year', normalizeNumber(incoming.year))
  fillField('make', normalizeText(incoming.make, 80))
  fillField('model', normalizeText(incoming.model, 80))
  fillField('trim', normalizedTrim)
  fillField('mileage', normalizedMileage)
  fillField('color', normalizedColor)
  fillField('purchase_price', normalizedPurchasePrice)
  fillField('purchased_from', normalizedPurchasedFrom)
  fillField('purchased_at', normalizedPurchasedAt)
  fillField('acquisition_source', incoming.acquisition_source ?? null)
  fillField('auction_name', normalizedAuctionName)
  fillField('auction_lot', normalizedAuctionLot)

  if (normalizedNotes) {
    if (!existing.acquisition_notes?.trim()) {
      patch.acquisition_notes = normalizedNotes
      additions.push({
        field: 'acquisition_notes',
        label: labelFor('acquisition_notes'),
        mode: 'fill',
        current: displayValue(existing.acquisition_notes),
        incoming: normalizedNotes,
        next: normalizedNotes,
      })
    } else if (
      existing.acquisition_notes.trim() !== normalizedNotes &&
      !existing.acquisition_notes.includes(normalizedNotes)
    ) {
      const next = appendNotes(existing.acquisition_notes, normalizedNotes)
      patch.acquisition_notes = next
      additions.push({
        field: 'acquisition_notes',
        label: labelFor('acquisition_notes'),
        mode: 'append',
        current: existing.acquisition_notes,
        incoming: normalizedNotes,
        next,
      })
    }
  }

  return { patch, additions, ignored }
}
