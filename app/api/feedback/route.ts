import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { sendNotificationEmail } from '@/lib/email/notify'

const TYPE_LABELS: Record<string, string> = {
  bug:        '🐛 Bug Report',
  suggestion: '💡 Suggestion',
  question:   '❓ Question',
  compliment: '⭐ Compliment',
}

const MAX_ATTACHMENTS = 5
const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5MB per file
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

function sanitizeFilename(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80)
  const ext = base.includes('.') ? base.slice(base.lastIndexOf('.')) : '.jpg'
  return base.endsWith(ext) ? base : `feedback${ext}`
}

export async function POST(req: NextRequest) {
  const profile = await requireProfile()

  let type: string
  let message: string
  const attachments: { filename: string; content: string }[] = []

  const contentType = req.headers.get('content-type') ?? ''
  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData()
    type = String(formData.get('type') ?? 'suggestion').slice(0, 20)
    message = String(formData.get('message') ?? '').trim().slice(0, 5000)
    const files = formData.getAll('attachments').filter((f): f is File => f instanceof File)
    for (let i = 0; i < Math.min(files.length, MAX_ATTACHMENTS); i++) {
      const file = files[i]
      if (file.size > MAX_FILE_BYTES || !ALLOWED_TYPES.includes(file.type)) continue
      const buffer = Buffer.from(await file.arrayBuffer())
      attachments.push({
        filename: sanitizeFilename(file.name || `image-${i + 1}.jpg`),
        content: buffer.toString('base64'),
      })
    }
  } else {
    const body = await req.json().catch(() => null)
    type = String(body?.type ?? 'suggestion').slice(0, 20)
    message = String(body?.message ?? '').trim().slice(0, 5000)
  }

  if (!message) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 })
  }

  const label = TYPE_LABELS[type] ?? '📩 Feedback'
  const attachmentNote = attachments.length
    ? `<p style="font-size:12px;color:#6b7280">Attachments: ${attachments.length} image(s)</p>`
    : ''

  await sendNotificationEmail({
    to:         'support@dealerwyze.com',
    from:       `DealerWyze Feedback <noreply@${process.env.RESEND_FROM_DOMAIN ?? 'mail.dealerwyze.com'}>`,
    subject:    `[Beta Feedback] ${label} from ${profile.display_name}`,
    attachments: attachments.length ? attachments : undefined,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#0D2B55">${label}</h2>
        <p><strong>From:</strong> ${profile.display_name} (org: ${profile.org_id})</p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0"/>
        <p style="white-space:pre-wrap;font-size:15px;color:#1f2937">${message}</p>
        ${attachmentNote}
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0"/>
        <p style="font-size:12px;color:#9ca3af">Sent from DealerWyze beta feedback widget</p>
      </div>
    `,
  })

  return NextResponse.json({ ok: true })
}
