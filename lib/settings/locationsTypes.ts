export type LocationStaffMember = {
  id: string
  display_name: string
  role: string
}

export type SettingsLocationRow = {
  id: string
  org_id: string
  name: string
  address: string | null
  phone: string | null
  inventory_url: string | null
  is_active: boolean
  sort_order: number
  staff: LocationStaffMember[]
}
