export interface DealerLocation {
  id: string
  org_id: string
  name: string
  address: string | null
  phone: string | null
  inventory_url: string | null
  sms_number: string | null
  email_from_name: string | null
  is_active: boolean
  sort_order: number
}

export interface OrgSettingsFallback {
  business_name: string | null
  business_phone: string | null
  business_address: string | null
  dealer_website_url: string | null
}

export interface OutboundIdentity {
  name: string
  phone: string | null
  address: string | null
  inventory_url: string | null
  location_id: string | null
}
