export const LEAD_STATES = [
  'new_lead',
  'contacted',
  'engaged',
  'appointment_set',
  'appointment_confirmed',
  'showed',
  'credit_app',
  'sold',
  'lost',
  'dormant',
  'custom_1',
  'custom_2',
  'custom_3',
  'custom_4',
  'custom_5',
] as const

export type LeadState = (typeof LEAD_STATES)[number]

export const LEAD_STATE_CONFIG: Record<string, { label: string; color: string }> = {
  new_lead:              { label: 'New Lead',     color: 'bg-blue-100 text-blue-700' },
  contacted:             { label: 'Contacted',    color: 'bg-yellow-100 text-yellow-700' },
  engaged:               { label: 'Interested',   color: 'bg-orange-100 text-orange-700' },
  appointment_set:       { label: 'Appt Set',     color: 'bg-purple-100 text-purple-700' },
  appointment_confirmed: { label: 'Negotiating',  color: 'bg-indigo-100 text-indigo-700' },
  showed:                { label: 'Showed',       color: 'bg-cyan-100 text-cyan-700' },
  credit_app:            { label: 'Credit App',   color: 'bg-amber-100 text-amber-700' },
  sold:                  { label: 'Sold',         color: 'bg-green-100 text-green-700' },
  lost:                  { label: 'Lost',         color: 'bg-red-100 text-red-700' },
  dormant:               { label: 'Dormant',      color: 'bg-gray-100 text-gray-500' },
  custom_1:              { label: 'Custom 1',     color: 'bg-pink-100 text-pink-700' },
  custom_2:              { label: 'Custom 2',     color: 'bg-teal-100 text-teal-700' },
  custom_3:              { label: 'Custom 3',     color: 'bg-violet-100 text-violet-700' },
  custom_4:              { label: 'Custom 4',     color: 'bg-rose-100 text-rose-700' },
  custom_5:              { label: 'Custom 5',     color: 'bg-lime-100 text-lime-700' },
}

/** Pipeline columns shown in board (excludes dormant — treated as archived) */
export const PIPELINE_STATES = [
  'new_lead', 'contacted', 'engaged', 'appointment_set',
  'appointment_confirmed', 'showed', 'credit_app', 'sold', 'lost',
]

/** System-defined stage keys (always present, cannot be deleted) */
export const SYSTEM_STAGE_KEYS = [
  'new_lead', 'contacted', 'engaged', 'appointment_set',
  'appointment_confirmed', 'showed', 'credit_app', 'sold', 'lost', 'dormant',
]

/** Custom placeholder stage keys */
export const CUSTOM_STAGE_KEYS = ['custom_1', 'custom_2', 'custom_3', 'custom_4', 'custom_5']

/** Org-customizable pipeline stage shape (from org_pipeline_stages table) */
export interface OrgStage {
  stage_key: string
  label: string
  color: string
  position: number
  is_hot: boolean
  is_active: boolean
}

/** Default stages — used as fallback when org stages not yet seeded */
export const DEFAULT_ORG_STAGES: OrgStage[] = [
  { stage_key: 'new_lead',              label: 'New Lead',    color: 'bg-blue-100 text-blue-700',    position: 0,  is_hot: false, is_active: true },
  { stage_key: 'contacted',             label: 'Contacted',   color: 'bg-yellow-100 text-yellow-700',position: 1,  is_hot: false, is_active: true },
  { stage_key: 'engaged',               label: 'Interested',  color: 'bg-orange-100 text-orange-700',position: 2,  is_hot: false, is_active: true },
  { stage_key: 'appointment_set',       label: 'Appt Set',    color: 'bg-purple-100 text-purple-700',position: 3,  is_hot: false, is_active: true },
  { stage_key: 'appointment_confirmed', label: 'Negotiating', color: 'bg-indigo-100 text-indigo-700',position: 4,  is_hot: false, is_active: true },
  { stage_key: 'showed',                label: 'Showed',      color: 'bg-cyan-100 text-cyan-700',    position: 5,  is_hot: false, is_active: true },
  { stage_key: 'credit_app',            label: 'Credit App',  color: 'bg-amber-100 text-amber-700',  position: 6,  is_hot: true,  is_active: true },
  { stage_key: 'sold',                  label: 'Sold',        color: 'bg-green-100 text-green-700',  position: 7,  is_hot: false, is_active: true },
  { stage_key: 'lost',                  label: 'Lost',        color: 'bg-red-100 text-red-700',      position: 8,  is_hot: false, is_active: true },
  { stage_key: 'dormant',               label: 'Dormant',     color: 'bg-gray-100 text-gray-500',    position: 9,  is_hot: false, is_active: true },
  { stage_key: 'custom_1',              label: 'Custom 1',    color: 'bg-pink-100 text-pink-700',    position: 10, is_hot: false, is_active: false },
  { stage_key: 'custom_2',              label: 'Custom 2',    color: 'bg-teal-100 text-teal-700',    position: 11, is_hot: false, is_active: false },
  { stage_key: 'custom_3',              label: 'Custom 3',    color: 'bg-violet-100 text-violet-700',position: 12, is_hot: false, is_active: false },
  { stage_key: 'custom_4',              label: 'Custom 4',    color: 'bg-rose-100 text-rose-700',    position: 13, is_hot: false, is_active: false },
  { stage_key: 'custom_5',              label: 'Custom 5',    color: 'bg-lime-100 text-lime-700',    position: 14, is_hot: false, is_active: false },
]

/** RE-specific default pipeline stages seeded on real_estate org creation */
export const DEFAULT_RE_ORG_STAGES: OrgStage[] = [
  { stage_key: 'new_lead',              label: 'New Inquiry',    color: 'bg-blue-100 text-blue-700',    position: 0,  is_hot: false, is_active: true },
  { stage_key: 'contacted',             label: 'Contacted',      color: 'bg-yellow-100 text-yellow-700',position: 1,  is_hot: false, is_active: true },
  { stage_key: 'engaged',               label: 'Qualified',      color: 'bg-orange-100 text-orange-700',position: 2,  is_hot: false, is_active: true },
  { stage_key: 'appointment_set',       label: 'Showing Set',    color: 'bg-purple-100 text-purple-700',position: 3,  is_hot: false, is_active: true },
  { stage_key: 'appointment_confirmed', label: 'Under Contract', color: 'bg-indigo-100 text-indigo-700',position: 4,  is_hot: true,  is_active: true },
  { stage_key: 'showed',                label: 'Showed',         color: 'bg-cyan-100 text-cyan-700',    position: 5,  is_hot: false, is_active: true },
  { stage_key: 'credit_app',            label: 'Offer Made',     color: 'bg-amber-100 text-amber-700',  position: 6,  is_hot: true,  is_active: true },
  { stage_key: 'sold',                  label: 'Closed',         color: 'bg-green-100 text-green-700',  position: 7,  is_hot: false, is_active: true },
  { stage_key: 'lost',                  label: 'Lost',           color: 'bg-red-100 text-red-700',      position: 8,  is_hot: false, is_active: true },
  { stage_key: 'dormant',               label: 'Dormant',        color: 'bg-gray-100 text-gray-500',    position: 9,  is_hot: false, is_active: true },
  { stage_key: 'custom_1',              label: 'Custom 1',       color: 'bg-pink-100 text-pink-700',    position: 10, is_hot: false, is_active: false },
  { stage_key: 'custom_2',              label: 'Custom 2',       color: 'bg-teal-100 text-teal-700',    position: 11, is_hot: false, is_active: false },
  { stage_key: 'custom_3',              label: 'Custom 3',       color: 'bg-violet-100 text-violet-700',position: 12, is_hot: false, is_active: false },
  { stage_key: 'custom_4',              label: 'Custom 4',       color: 'bg-rose-100 text-rose-700',    position: 13, is_hot: false, is_active: false },
  { stage_key: 'custom_5',              label: 'Custom 5',       color: 'bg-lime-100 text-lime-700',    position: 14, is_hot: false, is_active: false },
]

/** Returns the correct default pipeline stages for the given vertical */
export function defaultStagesForVertical(vertical: 'dealer' | 'real_estate'): OrgStage[] {
  return vertical === 'real_estate' ? DEFAULT_RE_ORG_STAGES : DEFAULT_ORG_STAGES
}
