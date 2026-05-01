import type { ParsedLead } from './parser'
import type { LeadScanResult } from './visionIngestTypes'
import { normalizePhone } from '@/lib/utils/phone'

function cleanInline(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

function cleanMultiline(value: string | null | undefined): string {
  return (value ?? '').trim()
}

function extractEmail(value: string | null | undefined): string {
  const match = cleanInline(value).match(/[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}/)
  return match?.[0]?.toLowerCase() ?? ''
}

function normalizeScannedPhone(value: string | null | undefined): string {
  const raw = cleanInline(value)
  if (!raw) return ''
  const digits = normalizePhone(raw)
  return digits.length === 10 ? digits : raw
}

export function scanResultToParsedLead(scan: LeadScanResult): ParsedLead {
  const firstName = cleanInline(scan.first_name.value)
  const lastName = cleanInline(scan.last_name.value)
  const name = `${firstName} ${lastName}`.trim() || 'Unknown'
  const email = extractEmail(scan.email.value)
  const phone = normalizeScannedPhone(scan.phone.value)
  const zip = cleanInline(scan.zip.value)
  const vin = cleanInline(scan.vehicle_vin.value).toUpperCase()

  const vehicleParts = [
    scan.vehicle_year.value,
    cleanInline(scan.vehicle_make.value),
    cleanInline(scan.vehicle_model.value),
    cleanInline(scan.vehicle_trim.value),
  ].filter(Boolean).join(' ')

  const noteParts = [
    cleanMultiline(scan.notes.value),
    scan.trade_in.value ? `Trade-in: ${cleanInline(scan.trade_in.value)}` : null,
    scan.budget.value ? `Budget: $${scan.budget.value.toLocaleString()}` : null,
    scan.urgency.value === 'high' ? 'Buyer marked as urgent' : null,
  ].filter(Boolean).join('\n')

  const src = scan.lead_source.value?.toLowerCase() ?? ''
  let source: ParsedLead['source'] = 'other'
  if (src.includes('cargurus')) source = 'cargurus'
  else if (src.includes('autotrader')) source = 'autotrader'
  else if (src.includes('offerup')) source = 'offerup'
  else if (src.includes('facebook')) source = 'facebook'
  else if (src.includes('kbb')) source = 'kbb'
  else if (src.includes('autolist')) source = 'autolist'
  else if (src.includes('carsforsale')) source = 'carsforsale'

  return {
    name,
    email,
    phone: phone || (email ? name : ''),
    zip,
    vehicle: vehicleParts,
    vin,
    listed_price: null,
    comments: noteParts,
    source,
    raw_text: '[scanned]',
  }
}
