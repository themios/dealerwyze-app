import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { sendNotificationEmail } from '@/lib/email/notify'

const TYPE_LABELS: Record<string, string> = {
  bug:        '🐛 Bug Report',
  suggestion: '💡 Suggestion',
  question:   '❓ Question',
  compliment: '⭐ Compliment',
}

export async function POST(req: NextRequest) {
  const profile = await requireProfile()

  const body = await req.json().catch(() => null)
  const type    = String(body?.type    ?? 'suggestion').slice(0, 20)
  const message = String(body?.message ?? '').trim().slice(0, 5000)

  if (!message) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 })
  }

  const label = TYPE_LABELS[type] ?? '📩 Feedback'

  await sendNotificationEmail({
    to:      'support@dealerwyze.com',
    from:    `DealerWyze Feedback <noreply@${process.env.RESEND_FROM_DOMAIN ?? 'mail.dealerwyze.com'}>`,
    subject: `[Beta Feedback] ${label} from ${profile.display_name}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#0D2B55">${label}</h2>
        <p><strong>From:</strong> ${profile.display_name} (org: ${profile.org_id})</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0"/>
        <p style="white-space:pre-wrap;font-size:15px;color:#1f2937">${message}</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0"/>
        <p style="font-size:12px;color:#9ca3af">Sent from DealerWyze beta feedback widget</p>
      </div>
    `,
  })

  return NextResponse.json({ ok: true })
}
