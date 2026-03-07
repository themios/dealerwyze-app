/**
 * Structured sync errors for the UI: friendly message, reason, action, support code, and optional account email(s).
 * Users can send the code in a ticket so we can look up technical details.
 */
export type SyncErrorDetail = {
  message: string
  reason: string
  action: string
  code: string
  /** Display email(s) so the user knows which account failed when they have multiple (e.g. "a@x.com" or "a@x.com, b@y.com") */
  accountEmail?: string
}

const ERRORS: Record<string, Omit<SyncErrorDetail, 'accountEmail'>> = {
  SYNC_001: {
    message: 'Email sync took too long and was stopped.',
    reason: 'Your inbox or the number of messages we scan exceeded our time limit (45 seconds).',
    action: 'Try syncing again in a few minutes. If it keeps happening, reduce inbox volume or contact support.',
    code: 'SYNC-001',
  },
  SYNC_002: {
    message: 'Email sync failed.',
    reason: 'The sync service reported an error while reading your email.',
    action: 'Check that your email connection is still valid in Settings → Organization. If the problem continues, contact support with the reference code below.',
    code: 'SYNC-002',
  },
  SYNC_003: {
    message: 'We couldn’t sync your email.',
    reason: 'Your email account may be disconnected or the connection may have expired.',
    action: 'Go to Settings → Organization and reconnect your email account, then try syncing again.',
    code: 'SYNC-003',
  },
}

export function getSyncError(
  code: keyof typeof ERRORS,
  options?: { technicalReason?: string; accountEmail?: string },
): SyncErrorDetail {
  const base = ERRORS[code]
  const detail: SyncErrorDetail = { ...base }
  if (options?.technicalReason) detail.reason = `${base.reason} (${options.technicalReason})`
  if (options?.accountEmail) detail.accountEmail = options.accountEmail
  return detail
}

export type SyncErrorCode = keyof typeof ERRORS
