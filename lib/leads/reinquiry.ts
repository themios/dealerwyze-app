import type { ParsedLead } from '@/lib/leads/parser'

export interface ReInquiryCandidate {
  id: string
  name: string | null
  interested_in?: string | null
  zip_code?: string | null
  lead_source?: string | null
  lead_intent_tier?: string | null
  lead_intent_score?: number | null
  lead_intent_flags?: string[] | null
  lead_intent_summary?: string | null
  lead_intent_source?: string | null
  lead_intent_manual_note?: string | null
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function pickReInquiryCandidate(
  lead: ParsedLead,
  candidates: ReInquiryCandidate[],
): ReInquiryCandidate | null {
  const leadName = normalizeName(lead.name)
  if (!leadName) return null

  const qualified = candidates.filter(candidate => {
    if (normalizeName(candidate.name ?? '') !== leadName) return false

    const candidateVehicle = normalizeText(candidate.interested_in ?? '')
    const leadVehicle = normalizeText(lead.vehicle ?? '')
    const vehicleMatch = !!leadVehicle && !!candidateVehicle && (
      candidateVehicle.includes(leadVehicle) || leadVehicle.includes(candidateVehicle)
    )

    const zipMatch = !!lead.zip && !!candidate.zip_code && lead.zip.trim() === candidate.zip_code.trim()
    const sourceMatch = !!lead.source && !!candidate.lead_source && lead.source === candidate.lead_source

    return vehicleMatch || (zipMatch && sourceMatch)
  })

  return qualified.length === 1 ? qualified[0] : null
}
