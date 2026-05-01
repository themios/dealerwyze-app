import { createClientForRequest } from '@/lib/supabase/forRequest'
import { requireProfile } from '@/lib/auth/profile'
import { isDealerAdmin } from '@/lib/auth/dealerRoles'
import TopBar from '@/components/layout/TopBar'
import SettingsHomeClient from '@/components/settings/SettingsHomeClient'

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function SettingsPage() {
  const profile = await requireProfile()
  const supabase = await createClientForRequest()
  const canManageReconTemplate = isDealerAdmin(profile.role)

  const [{ data: orgSettings }, { data: emailAccounts }] = await Promise.all([
    supabase
      .from('org_settings')
      .select('feed_cg_last_synced_at, feed_cg_last_count, feed_cg_last_error, feed_fb_last_synced_at, feed_fb_last_count, feed_fb_last_error, telegram_chat_id, twilio_phone_number')
      .eq('org_id', profile.org_id)
      .maybeSingle(),
    supabase
      .from('email_accounts')
      .select('provider, enabled, last_polled_at, last_error')
      .eq('org_id', profile.org_id),
  ])

  const enabledEmailAccounts = (emailAccounts ?? []).filter(account => account.enabled)
  const emailError = enabledEmailAccounts.find(account => account.last_error)
  const mostRecentPoll = enabledEmailAccounts
    .map(account => account.last_polled_at)
    .filter(Boolean)
    .sort()
    .at(-1)

  const inventoryFeedError = orgSettings?.feed_cg_last_error || orgSettings?.feed_fb_last_error
  const inventoryFeedActive = orgSettings?.feed_cg_last_synced_at || orgSettings?.feed_fb_last_synced_at

  const statusItems = [
    {
      id: 'lead-inbox',
      title: 'Lead Inbox Sync',
      tone: emailError ? 'error' : enabledEmailAccounts.length ? 'connected' : 'optional',
      summary: emailError
        ? String(emailError.last_error).slice(0, 120)
        : enabledEmailAccounts.length
          ? `${enabledEmailAccounts.length} connected account${enabledEmailAccounts.length === 1 ? '' : 's'}${mostRecentPoll ? ` • last polled ${new Date(mostRecentPoll).toLocaleDateString()}` : ''}`
          : 'No connected email inbox yet.',
    },
    {
      id: 'inventory-feeds',
      title: 'Inventory Feeds',
      tone: inventoryFeedError ? 'error' : inventoryFeedActive ? 'healthy' : 'pending',
      summary: inventoryFeedError
        ? String(inventoryFeedError).slice(0, 120)
        : inventoryFeedActive
          ? `CarGurus ${orgSettings?.feed_cg_last_count ?? 0} • Facebook ${orgSettings?.feed_fb_last_count ?? 0}`
          : 'No feed sync has completed yet.',
    },
    {
      id: 'twilio',
      title: 'Twilio',
      tone: orgSettings?.twilio_phone_number ? 'connected' : 'optional',
      summary: orgSettings?.twilio_phone_number
        ? `Inbound and outbound messaging routed through ${orgSettings.twilio_phone_number}.`
        : 'Phone messaging is not configured for this dealership.',
    },
    {
      id: 'telegram',
      title: 'Telegram',
      tone: orgSettings?.telegram_chat_id ? 'connected' : 'optional',
      summary: orgSettings?.telegram_chat_id
        ? 'Lead alerts are connected to Telegram.'
        : 'Telegram alerts are available but not connected.',
    },
  ] as const

  const routeRuntime = {
    organization: {
      status: emailError ? 'error' : enabledEmailAccounts.length || orgSettings?.twilio_phone_number ? 'connected' : 'pending',
      summary: enabledEmailAccounts.length
        ? `${enabledEmailAccounts.length} inbox integration${enabledEmailAccounts.length === 1 ? '' : 's'}`
        : 'Email and phone intake connections need review.',
    },
    website: {
      status: inventoryFeedError ? 'error' : inventoryFeedActive ? 'healthy' : 'pending',
      summary: inventoryFeedActive ? 'Inventory feed health available.' : 'Public inventory feed has not synced yet.',
    },
    social: {
      status: 'optional',
      summary: 'Connect social channels when ready for auto-posting.',
    },
    video: {
      status: 'optional',
      summary: 'Templates and rendering defaults live here.',
    },
    payments: {
      status: orgSettings?.twilio_phone_number ? 'connected' : 'optional',
      summary: 'Booking and customer payment configuration share one surface.',
    },
    pulse: {
      status: orgSettings?.twilio_phone_number ? 'connected' : 'optional',
      summary: 'Survey and review requests depend on messaging setup.',
    },
    retention: {
      status: 'optional',
      summary: 'Retention campaigns are configurable from the root hub.',
    },
    transfer: {
      status: 'pending',
      summary: 'High-risk ownership transfer flow with admin approval.',
    },
  } satisfies Record<string, { status?: 'connected' | 'healthy' | 'optional' | 'pending' | 'error'; summary?: string }>

  return (
    <div>
      <TopBar title="Settings" hideSearch />
      <div className="px-4 py-4">
      <SettingsHomeClient
        role={profile.role}
        displayName={profile.display_name}
        canManageReconTemplate={canManageReconTemplate}
        telegramBotUsername={process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? 'ApolloTim_bot'}
        telegramConnected={!!orgSettings?.telegram_chat_id}
        statusItems={statusItems.map(item => ({ ...item }))}
        routeRuntime={routeRuntime}
      />
      </div>
    </div>
  )
}
