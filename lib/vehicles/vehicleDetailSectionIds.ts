/** DOM ids for vehicle detail jump nav + scroll-margin targets (server + client safe). */
export const VEHICLE_DETAIL_SECTION_IDS = {
  listing: 'vehicle-detail-listing',
  acquisition: 'vehicle-detail-acquisition',
  operations: 'vehicle-detail-operations',
  sale: 'vehicle-detail-sale',
  customers: 'vehicle-detail-customers',
  media: 'vehicle-detail-media',
  inventory: 'vehicle-detail-inventory',
  website: 'vehicle-detail-website',
  activity: 'vehicle-detail-activity',
  transactions: 'vehicle-detail-transactions',
} as const

export type VehicleDetailNavItem = {
  id: string
  label: string
}

/** Trim + drop empty ids and duplicate ids (keeps first). Safe for building server → client props. */
export function uniqueNavSections(sections: VehicleDetailNavItem[]): VehicleDetailNavItem[] {
  const seen = new Set<string>()
  const out: VehicleDetailNavItem[] = []
  for (const s of sections) {
    const id = typeof s.id === 'string' ? s.id.trim() : ''
    const label = typeof s.label === 'string' ? s.label : ''
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push({ id, label: label || id })
  }
  return out
}
