/**
 * Type definitions for RE prospect extraction.
 * Exported so client components can import without server-only deps.
 */

import type { ScanField, Confidence } from '@/lib/leads/visionIngestTypes'

export interface ProspectExtractionResult {
  first_name: ScanField
  last_name: ScanField
  phone: ScanField
  phone2: ScanField
  email: ScanField
  city: ScanField
  state: ScanField
  zip: ScanField
  property_type: ScanField
  property_address: ScanField
  property_city: ScanField
  budget: ScanField<number>
  prospect_intent: ScanField
  lead_source: ScanField
  notes: ScanField
  urgency: ScanField
  overall_confidence: Confidence
}

export type ExtractionMethod = 'text' | 'image' | 'pdf'

export const CONFIDENCE_COLORS: Record<Confidence, string> = {
  high: 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400',
  medium: 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
  low: 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400',
}

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}
