export type ActivityType = 'call' | 'sms' | 'email' | 'note' | 'task' | 'appointment'
export type ActivityDirection = 'inbound' | 'outbound' | null
export type ActivityOutcome = 'answered' | 'no_answer' | 'left_vm' | 'pending' | null
export type ActivityPriority = 'high' | 'normal' | 'low'
export type VehicleStatus = 'available' | 'pending' | 'sold'
export type InterestLevel = 'hot' | 'warm' | 'cold'
export type TemplateChannel = 'sms' | 'email'
export type UserRole = 'admin' | 'agent'

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
  created_at: string
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
  duration_seconds?: number
  priority: ActivityPriority
  sequence_day?: number | null
  external_id?: string | null
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
  location?:                    'Simi Valley' | 'El Monte' | null
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
