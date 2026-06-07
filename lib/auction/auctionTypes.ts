export type AuctionSource = 'copart' | 'acv' | 'manheim' | 'adesa' | 'iaa'

export interface AuctionVehicle {
  source: AuctionSource
  external_id: string // Auction platform's unique ID
  vin: string | null
  year: number | null
  make: string | null
  model: string | null
  trim: string | null
  lot_number: string | null
  current_bid: number | null
  estimated_repair_cost: number | null
  primary_damage: string | null
  secondary_damage: string | null
  sale_date: string | null
}

export interface AuctionSyncConfig {
  org_id: string
  enabled: boolean
  copart_enabled: boolean
  copart_api_key?: string
  copart_username?: string
  acv_enabled: boolean
  acv_api_key?: string
  sync_interval_hours: number // e.g., 6 = sync every 6 hours
  auto_import: boolean // If true, new vehicles auto-imported; if false, manual review needed
  last_sync_at?: string // ISO timestamp
  last_sync_status?: 'success' | 'failed' | 'partial'
  last_sync_error?: string
}

export interface AuctionSyncResult {
  source: AuctionSource
  imported: number
  updated: number
  errors: Array<{ external_id: string; error: string }>
}
