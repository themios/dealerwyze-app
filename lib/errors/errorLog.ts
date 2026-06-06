import { createServiceClient } from '@/lib/supabase/service'
import { sendNotificationEmail } from '@/lib/email/notify'

export type ErrorSeverity = 'error' | 'warning' | 'critical'

interface ErrorLogInput {
  message: string
  stack_trace?: string | null
  severity?: ErrorSeverity
  org_id?: string | null
  user_id?: string | null
  url?: string | null
  digest?: string | null
  context?: Record<string, unknown> | null
}

/**
 * Log an error to the database and send alerts to the platform owner.
 * Never throws — failures to log don't cascade.
 * Call from server-side contexts only (API routes, server actions, cron jobs).
 */
export async function logError(input: ErrorLogInput): Promise<void> {
  if (!process.env.PLATFORM_OWNER_EMAIL) return

  try {
    const supabase = createServiceClient()

    // Insert error log
    const { data, error: insertErr } = await supabase
      .from('error_log')
      .insert({
        message: input.message,
        stack_trace: input.stack_trace,
        severity: input.severity || 'error',
        org_id: input.org_id || null,
        user_id: input.user_id || null,
        url: input.url,
        digest: input.digest,
        context: input.context || null,
      })
      .select('id')
      .single()

    if (insertErr || !data) {
      console.error('[errorLog] Failed to insert:', insertErr?.message)
      return
    }

    // Send email alert for critical/high-priority errors
    if (input.severity === 'critical' || input.severity === 'error') {
      const subject =
        input.severity === 'critical'
          ? `🚨 CRITICAL: ${input.message}`
          : `⚠️ Error: ${input.message}`

      const context = input.context
        ? Object.entries(input.context)
            .map(([k, v]) => `<strong>${k}:</strong> ${JSON.stringify(v)}`)
            .join('<br>')
        : 'None'

      const html = `
<h2>${subject}</h2>
<p><strong>Error ID:</strong> ${data.id}</p>
<p><strong>Severity:</strong> ${input.severity}</p>
<p><strong>Message:</strong> ${input.message}</p>

<h3>Details</h3>
<p><strong>URL:</strong> ${input.url || 'Unknown'}</p>
<p><strong>Org ID:</strong> ${input.org_id || 'Unknown'}</p>
<p><strong>User ID:</strong> ${input.user_id || 'Unknown'}</p>

<h3>Context</h3>
<p>${context}</p>

<h3>Stack Trace</h3>
<pre>${input.stack_trace || 'None'}</pre>

<p><a href="https://dealerwyze.com/admin/error-log">View in Dashboard</a></p>
`.trim()

      await sendNotificationEmail({
        to: process.env.PLATFORM_OWNER_EMAIL,
        subject,
        html,
      }).catch(err => {
        console.error('[errorLog] Failed to send email:', err)
      })
    }
  } catch (err) {
    console.error('[errorLog] Unexpected error:', err)
  }
}

/**
 * Resolve an error log entry (mark as fixed).
 */
export async function resolveError(
  errorId: string,
  userId: string,
  notes?: string,
): Promise<void> {
  try {
    const supabase = createServiceClient()
    await supabase
      .from('error_log')
      .update({
        resolved: true,
        resolved_at: new Date().toISOString(),
        resolved_by: userId,
        notes: notes || null,
      })
      .eq('id', errorId)
  } catch (err) {
    console.error('[errorLog] Failed to resolve:', err)
  }
}
