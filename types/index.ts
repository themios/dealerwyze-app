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
  location_id?: string | null
  location_source?: string | null
  /** Resolved on the server for Leads list (assignee display / filter). Not a DB column. */
  assignee?: { id: string; display_name: string } | null
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
  lead_intent_scored_at?: string | null
  lead_intent_input_hash?: string | null
  lead_intent_score_error?: boolean
  lead_intent_score_failures?: number
  lead_intent_manual_tier?: LeadIntentTier | null
  lead_intent_manual_expires_at?: string | null
  lead_intent_next_action?: string | null
  avg_reply_speed_minutes?: number | null
  inbound_message_count?: number
  last_inbound_at?: string | null
  last_outbound_at?: string | null
  last_ditch_sent_at?: string | null
  prior_purchase_count?: number
  repeat_lead?: boolean
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
  ai_last_analyzed_at?: string | null
  /** Plain text for AI only (reanalyze); not shown on public site */
  overview_enrichment_text?: string | null
  nhtsa_recall_count?: number | null
  reliability_tier?: 'low' | 'moderate' | 'high' | null
  purchase_price?: number | null
  purchased_at?: string | null
  purchased_from?: string | null
  lead_count_30d?: number
  appt_conversion_rate?: number | null
  avg_intent_score?: number | null
  demand_signal?: 'high_demand' | 'needs_price_drop' | 'needs_financing_push' | 'buy_signal' | null
  demand_updated_at?: string | null
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
  /** Annual nominal rate, e.g. 0.24 = 24% */
  interest_rate?: number
  principal_balance?: number | null
  total_interest_paid?: number
  last_payment_date?: string | null
  stripe_customer_id?: string | null
  stripe_payment_method_id?: string | null
  payment_method_type?: 'card' | 'ach' | 'manual'
  bank_verification_status?: 'pending' | 'verified' | 'failed' | null
  bank_verified_at?: string | null
  ach_setup_sent_at?: string | null
  /** Customer texted PAID (Zelle/Venmo/Cash App); dealer confirms in app */
  pending_manual_payment_at?: string | null
  pending_manual_payment_amount?: number | null
  manual_payment_confirmed_at?: string | null
  manual_payment_confirmed_by?: string | null
  vehicle?: Vehicle
  customer?: Customer
}

export interface BhphPaymentLedgerEntry {
  id: string
  user_id: string
  bhph_contract_id: string
  customer_id: string
  payment_date: string
  amount_paid: number
  interest_portion: number
  principal_portion: number
  principal_balance_after: number
  days_since_last: number | null
  payment_type: 'regular' | 'partial' | 'extra' | 'payoff' | 'failed_ach' | 'manual'
  stripe_payment_intent_id: string | null
  notes: string | null
  recorded_by: string | null
  created_at: string
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
  today_section_override?: 'replied' | 'human_now' | 'ai_handling' | 'follow_up_later' | 'low_roi' | null
  today_park_until?: string | null
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
  /** inventory = dealer private; website = VDP downloads + AI overview context */
  document_scope?: 'inventory' | 'website'
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
