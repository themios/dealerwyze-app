import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { isPlatformSuperAdmin } from '@/lib/auth/platform'
import { sendTelegramMessage } from '@/lib/notifications/telegram'
import { sendNotificationEmail } from '@/lib/email/notify'
import { writeAuditLog } from '@/lib/audit/log'

export const dynamic = 'force-dynamic'

type Channel = 'email' | 'telegram'
type ResultState = 'sent' | 'skipped' | 'error'

function isValidChannels(value: unknown): value is Channel[] {
  if (!Array.isArray(value) || value.length === 0) return false
  return value.every((item) => item === 'email' || item === 'telegram')
}

export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const isSuperAdmin = await isPlatformSuperAdmin(profile.id)
  if (!isSuperAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const json = await req.json().catch(() => null)
  const channels = json?.channels

  if (!isValidChannels(channels)) {
    return NextResponse.json(
      { error: 'Invalid channels. Must include one or more of: email, telegram' },
      { status: 400 }
    )
  }

  const results: { email?: ResultState; telegram?: ResultState } = {}

  if (channels.includes('telegram')) {
    try {
      await sendTelegramMessage(
        '🔔 DealerWyze platform test notification - settings check from admin.'
      )
      results.telegram = process.env.TELEGRAM_CHAT_ID ? 'sent' : 'skipped'
    } catch {
      results.telegram = 'error'
    }
  }

  if (channels.includes('email')) {
    const ownerEmail = process.env.PLATFORM_OWNER_EMAIL
    if (!ownerEmail) {
      results.email = 'skipped'
    } else {
      try {
        await sendNotificationEmail({
          to: ownerEmail,
          subject: 'DealerWyze - Test Notification',
          html: '<p>This is a test notification from the DealerWyze platform settings.</p>',
        })
        results.email = 'sent'
      } catch {
        results.email = 'error'
      }
    }
  }

  await writeAuditLog({
    orgId: null,
    actorId: profile.id,
    actorType: 'staff',
    action: 'settings_updated',
    entityType: 'platform_settings',
    entityId: null,
    metadata: {
      action: 'test_notification_sent',
      channels,
      results,
    },
  })

  return NextResponse.json({ results })
}
