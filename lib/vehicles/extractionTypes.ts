/**
 * Shared types for vehicle extraction workflow.
 * Used by both bulk extraction API and UI components.
 */

export type ExtractedVehicle = {
  vin?: string
  year: number
  make: string
  model: string
  price?: number
  mileage?: number
  color?: string
  condition?: string // 'excellent', 'good', 'fair', 'poor', 'unknown'
  description?: string
}

export type VehicleEditState = ExtractedVehicle & {
  id: string // temp UUID for grid key
  selected: boolean
  extractionError?: string
  location_id?: string // assigned during import for multi-location dealers
  // Auction-specific fields (optional, used by auction sync)
  acquisition_source?: string
  auction_name?: string
  auction_lot?: string
}

export type BulkVehicleExtractorState = {
  content: string
  loading: boolean
  items: VehicleEditState[]
  globalError?: string
  selectedCount: number
}
