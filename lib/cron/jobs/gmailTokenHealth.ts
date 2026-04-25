/** Proactively test each Gmail OAuth account; disable revoked tokens and notify dealer admin. */

import { sendNotificationEmail } from '@/lib/email/notify'
import type { createServiceClient } from '@/lib/supabase/service'

export async function runGmailTokenHealth(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<{ gmailTokensOk: number; gmailTokensRevoked: number }> {
  let gmailTokensOk = 0
  let gmailTokensRevoked = 0

  try {
    const { google } = await import('googleapis')
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

    const { data: gmailAccounts } = await supabase
      .from('email_accounts')
      .select('id, org_id, email, oauth_refresh_token, label')
      .not('oauth_refresh_token', 'is', null)
      .eq('enabled', true)

    for (const acct of gmailAccounts ?? []) {
      try {
        const auth = new google.auth.OAuth2(
          process.env.GMAIL_CLIENT_ID,
          process.env.GMAIL_CLIENT_SECRET,
        )
        auth.setCredentials({ refresh_token: acct.oauth_refresh_token })
        await auth.getAccessToken()
        gmailTokensOk++
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        if (!msg.includes('invalid_grant') && !msg.includes('Token has been expired')) continue

        gmailTokensRevoked++
        console.warn(`[check-tasks] Job 15 Gmail token revoked for account ${acct.id} (${acct.email})`)

        await supabase.from('email_accounts').update({
          enabled:    false,
          last_error: 'Connection expired - please reconnect this account in Settings',
        }).eq('id', acct.id)

        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        const { data: existing } = await supabase
          .from('admin_alerts')
          .select('id')
          .eq('org_id', acct.org_id)
          .eq('alert_type', 'gmail_token_expired')
          .eq('metadata->>account_id', acct.id)
          .gt('created_at', sevenDaysAgo)
          .maybeSingle()
        if (existing) continue

        await supabase.from('admin_alerts').insert({
          org_id:     acct.org_id,
          alert_type: 'gmail_token_expired',
          severity:   'warning',
          metadata:   { account_id: acct.id, email: acct.email },
        })

        const { data: adminProfile } = await supabase
          .from('profiles')
          .select('display_name, email:id')
          .eq('org_id', acct.org_id)
          .eq('role', 'dealer_admin')
          .order('created_at')
          .limit(1)
          .maybeSingle()
        if (adminProfile?.email) {
          const { data: { users } } = await supabase.auth.admin.listUsers()
          const adminUser = users?.find((u: { id: string }) => u.id === adminProfile.email)
          if (adminUser?.email) {
            void sendNotificationEmail({
              to: adminUser.email,
              subject: 'Action needed: Your email connection needs to be reconnected',
              html: `
                <p>Hi ${adminProfile.display_name ?? 'there'},</p>
                <p>Your <strong>${acct.label || acct.email}</strong> inbox connection has expired and lead syncing has paused for that account.</p>
                <p>This happens periodically and is quick to fix.</p>
                <p><a href="${appUrl}/settings/organization" style="background:#F07018;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;margin:12px 0">Reconnect Gmail in Settings</a></p>
                <p>Once reconnected, lead syncing will resume automatically.</p>
                <p>- The DealerWyze Team</p>
              `,
            })
          }
        }
      }
    }

    if (gmailTokensRevoked > 0) {
      console.log(`[check-tasks] Job 15 Gmail tokens: ${gmailTokensOk} ok, ${gmailTokensRevoked} revoked + notified`)
    }
  } catch (e) {
    console.error('[check-tasks] Job 15 Gmail token health check error:', e)
  }

  return { gmailTokensOk, gmailTokensRevoked }
}
