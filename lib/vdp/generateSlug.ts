/**
 * Generates a URL-safe public slug for a vehicle VDP page.
 * Format: {year}-{make}-{model}-{trim}-{stock_no}
 * Example: "2021-honda-accord-lx-a12345"
 */
export function generatePublicSlug(vehicle: {
  year: number | string
  make: string
  model: string
  trim?: string | null
  stock_no: string
}): string {
  const parts = [
    String(vehicle.year),
    vehicle.make,
    vehicle.model,
    vehicle.trim ?? '',
    vehicle.stock_no,
  ]

  return parts
    .join(' ')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // strip special chars except spaces and hyphens
    .replace(/\s+/g, '-')          // spaces to hyphens
    .replace(/-+/g, '-')           // collapse multiple hyphens
    .replace(/^-+|-+$/g, '')       // trim leading/trailing hyphens
    .slice(0, 120)                 // max length
}
