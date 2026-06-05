/**
 * Type definitions for property document upload and summarization.
 * Keep separate to allow client component imports without server-only dependencies.
 */

export interface PropertyDocument {
  id: string
  property_id: string
  org_id: string
  filename: string
  mime_type: string
  storage_key: string
  summary: string | null
  created_at: string
  updated_at: string
}

export interface DocumentSummaryResult {
  filename: string
  summary: string | null
  error?: string | null
}

export const SUPPORTED_DOCUMENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
])

export const MAX_DOCUMENT_SIZE = 5 * 1024 * 1024 // 5MB
