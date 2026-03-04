/**
 * Types for lead scan / vision ingest only.
 * Keep in a separate file so client components (e.g. LeadScanner) can import
 * these types without pulling in the Anthropic SDK and triggering
 * "Neither apiKey nor config.authenticator provided" in the browser.
 */

export type Confidence = 'high' | 'medium' | 'low'

export interface ScanField<T = string> {
  value: T | null
  confidence: Confidence
}

export interface LeadScanResult {
  first_name:     ScanField
  last_name:      ScanField
  phone:          ScanField
  phone2:         ScanField
  email:          ScanField
  city:           ScanField
  state:          ScanField
  zip:            ScanField
  vehicle_year:   ScanField<number>
  vehicle_make:   ScanField
  vehicle_model:  ScanField
  vehicle_trim:   ScanField
  vehicle_vin:    ScanField
  budget:         ScanField<number>
  lead_source:    ScanField
  notes:          ScanField
  urgency:        ScanField
  trade_in:       ScanField
  overall_confidence: Confidence
}
