export type ActivityType = 'call' | 'sms' | 'email' | 'note' | 'task' | 'appointment' | 'web_lead' | 'email_followup' | 'sms_followup'
export type ActivityDirection = 'inbound' | 'outbound' | null
export type ActivityOutcome = 'answered' | 'no_answer' | 'left_vm' | 'pending' | null
export type ActivityPriority = 'high' | 'normal' | 'low'
export type VehicleStatus = 'available' | 'pending' | 'sold' | 'sync_removed' | 'staging'
export type InterestLevel = 'hot' | 'warm' | 'cold'
export type LeadIntentTier = 'standard' | 'active' | 'warm' | 'hot'
export type TemplateChannel = 'sms' | 'email'
export type UserRole =
  | 'dealer_admin'
  | 'dealer_manager'
  | 'dealer_finance'
  | 'dealer_rep'
  | 'dealer_staff'
  | 'admin'   // legacy alias → treated as dealer_admin
  | 'agent'   // legacy alias → treated as dealer_staff

/** Returns true if the role has dealer-admin level privileges */
export function isDealerAdmin(role: UserRole): boolean {
  return role === 'dealer_admin' || role === 'admin'
}

/** Returns true if the role can see all org data (not rep-restricted) */
export function hasFullOrgAccess(role: UserRole): boolean {
  return role === 'dealer_admin' || role === 'dealer_manager' ||
         role === 'dealer_finance' || role === 'dealer_staff' ||
         role === 'admin' || role === 'agent'
}

export interface Profile {
  id: string
  display_name: string
  role: UserRole
  org_id: string
  created_at: string
}

export type FinanceType = 'cash' | 'finance' | 'bhph'

export interface Customer {
  id: string
  user_id: string
  name: string
  primary_phone: string
  secondary_phone?: string
  email?: string
  tags?: string[]
  notes?: string
  lead_source?: string
  zip_code?: string
  interested_in?: string | null
  assigned_to?: string | null
  archived?: boolean
  archived_reason?: string | null
  sms_opt_out?: boolean
  sms_opt_out_at?: string | null
  thread_state?: string
  lead_rating?: 'hot' | 'warm' | 'cold' | null
  lead_intent_score?: number
  lead_intent_tier?: LeadIntentTier | null
  lead_intent_summary?: string | null
  lead_intent_flags?: string[]
  lead_intent_source?: string | null
  lead_intent_manual_note?: string | null
  lead_intent_updated_at?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  birthday?: string | null
  last_service_date?: string | null
  referred_by?: string | null
  referral_source?: string | null
  engagement_score?: number
  first_response_at?: string | null
  response_time_seconds?: number | null
  created_at: string
}

export interface Vehicle {
  id: string
  user_id: string
  stock_no: string
  vin?: string
  year: number
  make: string
  model: string
  trim?: string
  body_style?: string | null
  color?: string
  mileage?: number
  price?: number
  status: VehicleStatus
  notes?: string
  photo_url?: string
  listing_url?: string
  sold_price?: number | null
  sold_at?: string | null
  sold_to_customer_id?: string | null
  finance_type?: FinanceType | null
  finance_company?: string | null
  voice_summary?: string | null
  published?: boolean
  public_slug?: string | null
  price_history?: { price: number; at: string }[]
  views_count?: number
  condition_report_json?: Record<string, unknown> | null
  wholesale_eligible?: boolean
  market_data_json?: Record<string, unknown> | null
  market_checked_at?: string | null
  ai_description?: string | null
  nhtsa_recall_count?: number | null
  reliability_tier?: 'low' | 'moderate' | 'high' | null
  purchase_price?: number | null
  purchased_at?: string | null
  purchased_from?: string | null
  created_at: string
}

export interface ReconChecklistItem {
  id: string
  vehicle_id: string
  org_id: string
  label: string
  is_required: boolean
  sort_order: number
  checked: boolean
  notes: string | null
  cost: number | null
  completed_at: string | null
  completed_by: string | null
  created_at: string
}

export interface ReconCostSummary {
  purchase_price: number | null
  recon_checklist_total: number
  ledger_expenses_total: number
  total_investment: number
  list_price: number | null
  estimated_profit: number | null
}

export interface BhphPayment {
  id: string
  user_id: string
  vehicle_id: string
  customer_id: string
  down_payment: number
  loan_amount?: number | null
  monthly_payment: number
  payment_day_of_month: number
  next_due_date: string
  total_paid: number
  status: 'active' | 'paid_off' | 'defaulted'
  notes?: string | null
  created_at: string
  vehicle?: Vehicle
  customer?: Customer
}

export interface CustomerVehicle {
  id: string
  customer_id: string
  vehicle_id: string
  interest_level: InterestLevel
  created_at: string
}

export interface Activity {
  id: string
  user_id: string
  customer_id?: string
  vehicle_id?: string
  type: ActivityType
  direction?: ActivityDirection
  outcome?: ActivityOutcome
  body?: string
  due_at?: string
  completed_at?: string
  snoozed_until?: string
  addressed_at?: string | null
  duration_seconds?: number
  priority: ActivityPriority
  sequence_day?: number | null
  customer_sequence_id?: string | null
  external_id?: string | null
  created_by?: string | null
  gmail_message_id?: string | null
  gmail_thread_id?: string | null
  created_at: string
  customer?: Customer
  vehicle?: Vehicle
}

export interface Template {
  id: string
  user_id: string
  name: string
  channel: TemplateChannel
  category?: string | null
  subject?: string | null
  body: string
  variables?: string[]
  is_favorite?: boolean
  created_at: string
}

export interface PendingCall {
  activityId: string
  customerId: string
  customerName: string
  phone: string
}

export interface CustomerDocument {
  id: string
  user_id: string
  customer_id: string
  label: string
  file_name: string
  file_key: string
  file_size: number | null
  mime_type: string | null
  created_at: string
  signed_url?: string
}

export interface VehicleDocument {
  id: string
  user_id: string
  vehicle_id: string
  label: string
  file_name: string
  file_key: string
  file_size: number | null
  mime_type: string | null
  ai_summary: string | null
  created_at: string
  signed_url?: string
}

export interface VoiceSummaryJson {
  caller_name?:                 string | null
  vehicle_interest?:            string | null
  location?:                    string | null
  appointment_exact?:           string | null
  appointment_range?:           string | null
  intent?:                      string | null
  budget_mentioned?:            string | null
  trade_in?:                    boolean | null
  financing_interest?:          boolean | null
  restricted_topics_attempted?: string[]
  callback_phone?:              string | null
  additional_notes?:            string | null
  confidence_score?:            number
}

export interface VoiceCall {
  id:               string
  org_id:           string
  call_sid:         string
  recording_sid?:   string | null
  recording_url?:   string | null
  from_number:      string
  to_number:        string
  duration_seconds?: number | null
  transcript?:      string | null
  summary_json?:    VoiceSummaryJson | null
  status:           'in_progress' | 'dealer_answered' | 'completed' | 'failed' | 'too_short'
  customer_id?:     string | null
  activity_id?:     string | null
  task_id?:         string | null
  created_at:       string
  customer?: {
    id:            string
    name:          string
    primary_phone: string
  } | null
}

export type SequenceChannel = 'sms' | 'email'
export type SequenceAutoMode = 'manual' | 'semi_auto' | 'full_auto'
export type CustomerSequenceStatus = 'active' | 'paused' | 'completed' | 'cancelled'

export interface Sequence {
  id: string
  org_id: string
  name: string
  channel: SequenceChannel
  auto_mode: SequenceAutoMode
  created_at: string
}

export interface SequenceStep {
  id: string
  sequence_id: string
  sort_order: number
  day_offset: number
  send_hour: number
  template_id: string | null
  created_at: string
}

export interface CustomerSequence {
  id: string
  customer_id: string
  sequence_id: string
  org_id: string
  status: CustomerSequenceStatus
  enrolled_at: string
  completed_at: string | null
  created_at: string
}
