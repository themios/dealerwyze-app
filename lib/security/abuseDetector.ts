/**
 * lib/security/abuseDetector.ts
 * Bulk export / API scraping detection (Vector 8).
 *
 * Tracks large record fetches per org in a sliding 10-minute window.
 * If >500 records are fetched from a single org in 10 min, logs an
 * abuse_flag and admin_audit_log entry (fire-and-forget).
 */

import { createServiceClient } from '@/lib/supabase/service'

interface FetchWindow { count: number; resetAt: number }
const bulkStore = new Map<string, FetchWindow>()

const BULK_WINDOW_MS  = 10 * 60 * 1000  // 10 minutes
const BULK_THRESHOLD  = 500             // records

export function trackBulkFetch(orgId: string, recordCount: number): void {
  const now   = Date.now()
  const key   = `bulk:${orgId}`
  const entry = bulkStore.get(key)

  if (!entry || now > entry.resetAt) {
    bulkStore.set(key, { count: recordCount, resetAt: now + BULK_WINDOW_MS })
    return
  }

  entry.count += recordCount

  if (entry.count >= BULK_THRESHOLD) {
    // Reset window to avoid repeated alerts for the same burst
    bulkStore.set(key, { count: 0, resetAt: now + BULK_WINDOW_MS })
    // Log async — never block the API response
    void logBulkExport(orgId, entry.count)
  }
}

async function logBulkExport(orgId: string, count: number): Promise<void> {
  const supabase = createServiceClient()
  const now = new Date().toISOString()

  await Promise.all([
    // Deduplicated abuse flag (idempotent-ish via short window reset)
    supabase.from('abuse_flags').insert({
      org_id:    orgId,
      flag_type: 'bulk_export',
      severity:  'medium',
      details: {
        records_fetched: count,
        window_minutes:  10,
        note: 'Org fetched >500 customer records within 10 minutes — possible API scraping.',
      },
    }),
    // Admin audit log for searchable history
    supabase.from('admin_audit_log').insert({
      admin_id:   orgId,   // actor = the org (not a staff admin)
      action:     'bulk_export_detected',
      org_id:     orgId,
      details: { records_fetched: count, detected_at: now },
    }),
  ])
}
