export const LEAD_STATES = [
  'new_lead',
  'contacted',
  'engaged',
  'appointment_set',
  'appointment_confirmed',
  'showed',
  'sold',
  'lost',
  'dormant',
] as const

export type LeadState = (typeof LEAD_STATES)[number]

export const LEAD_STATE_CONFIG: Record<LeadState, { label: string; color: string }> = {
  new_lead:              { label: 'New Lead',     color: 'bg-blue-100 text-blue-700' },
  contacted:             { label: 'Contacted',    color: 'bg-yellow-100 text-yellow-700' },
  engaged:               { label: 'Interested',   color: 'bg-orange-100 text-orange-700' },
  appointment_set:       { label: 'Appt Set',     color: 'bg-purple-100 text-purple-700' },
  appointment_confirmed: { label: 'Negotiating',  color: 'bg-indigo-100 text-indigo-700' },
  showed:                { label: 'Showed',       color: 'bg-cyan-100 text-cyan-700' },
  sold:                  { label: 'Sold',         color: 'bg-green-100 text-green-700' },
  lost:                  { label: 'Lost',         color: 'bg-red-100 text-red-700' },
  dormant:               { label: 'Dormant',      color: 'bg-gray-100 text-gray-500' },
}

/** Pipeline columns (excludes dormant — treated as archived) */
export const PIPELINE_STATES: LeadState[] = [
  'new_lead',
  'contacted',
  'engaged',
  'appointment_set',
  'appointment_confirmed',
  'showed',
  'sold',
  'lost',
]
