/**
 * Type definitions for property document upload and summarization.
 * Keep separate to allow client component imports without server-only dependencies.
 */

export interface PropertyDocument {
  id: string
  property_id: string | null
  org_id: string
  file_name: string
  file_path: string
  mime_type: string
  summary: string | null
  uploaded_by: string | null
  created_at: string
  updated_at: string
}

export interface DocumentSummaryResult {
  file_name: string
  summary: string | null
  error?: string | null
}

export const SUPPORTED_DOCUMENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
])

export const MAX_DOCUMENT_SIZE = 5 * 1024 * 1024 // 5MB
