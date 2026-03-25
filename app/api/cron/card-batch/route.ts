/**
 * GET /api/cron/card-batch
 * Runs every Monday morning (0 14 * * 1 = 6am PT).
 * For each org using print_and_mail delivery:
 *   1. Finds all card_mailings with status='pending' and delivery_method='print_and_mail'
 *   2. Generates a batch HTML file (multi-page printable card sheet)
 *   3. Uploads it to Supabase Storage (bucket: card-batches)
 *   4. Creates one receptionist task: "Print and mail this week's cards"
 *   5. Marks the card_mailings rows as print_ready + sets batch_week
 *   6. Sends dealer admin a weekly digest email with download link
 *
 * For orgs using PostGrid delivery:
 *   Submits each pending card to PostGrid and marks as queued.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { startCronRun, finishCronRun } from '@/lib/cron/runLogger'
import { sendNotificationEmail } from '@/lib/email/notify'
import { generateBatchCardHtml, type CardRecipient } from '@/lib/pdf/cardBatch'
import { createPostGridLetter } from '@/lib/postgrid/client'

export const runtime     = 'nodejs'
export const maxDuration = 55

// ISO week label: e.g. "2026-W12"
function isoWeekLabel(d: Date): string {
  const date  = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const weekNo    = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

function humanWeekLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

export async function GET(req: NextRequest) {
  const bearerOk = req.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`
  const legacyOk = req.headers.get('x-cron-secret') === process.env.LEADS_POLL_SECRET
  if (!bearerOk && !legacyOk) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const runId    = await startCronRun('card-batch')
  const supabase = createServiceClient()
  const now      = new Date()
  const weekLabel = isoWeekLabel(now)

  let batchesCreated = 0
  let postgridQueued = 0

  // Get all orgs with pending card mailings
  const { data: pendingMailings } = await supabase
    .from('card_mailings')
    .select(`
      id, org_id, customer_id, trigger_type, delivery_method,
      customers(name, email, primary_phone, address, city, state, zip_code)
    `)
    .eq('status', 'pending')

  if (!pendingMailings || pendingMailings.length === 0) {
    await finishCronRun(runId, 'success', 0)
    return NextResponse.json({ ok: true, batchesCreated: 0, postgridQueued: 0 })
  }

  // Group by org
  const byOrg = new Map<string, typeof pendingMailings>()
  for (const m of pendingMailings) {
    const arr = byOrg.get(m.org_id) ?? []
    arr.push(m)
    byOrg.set(m.org_id, arr)
  }

  for (const [orgId, mailings] of byOrg) {
    // Fetch org settings
    const { data: orgSettings } = await supabase
      .from('org_settings')
      .select('business_name, business_phone, business_address, postgrid_api_key')
      .eq('org_id', orgId)
      .maybeSingle()

    // Fetch retention settings for card delivery preference
    const { data: retSettings } = await supabase
      .from('retention_settings')
      .select('card_delivery_method')
      .eq('org_id', orgId)
      .maybeSingle()

    const deliveryMethod = retSettings?.card_delivery_method ?? 'print_and_mail'

    // Fetch dealer admin email for digest
    const { data: adminProfile } = await supabase
      .from('profiles')
      .select('email')
      .eq('org_id', orgId)
      .eq('role', 'dealer_admin')
      .maybeSingle()

    const dealerName    = orgSettings?.business_name    ?? 'Your Dealership'
    const dealerPhone   = orgSettings?.business_phone   ?? ''
    const dealerAddress = orgSettings?.business_address ?? ''

    // ── Print & Mail: generate batch HTML ──────────────────────────────────
    if (deliveryMethod === 'print_and_mail') {
      const printMailings = mailings.filter(m => m.delivery_method !== 'postgrid')
      if (printMailings.length === 0) continue

      const recipients: CardRecipient[] = printMailings.map(m => {
        const cust = Array.isArray(m.customers) ? m.customers[0] : m.customers
        return {
          name:        cust?.name ?? 'Valued Customer',
          address:     cust?.address ?? undefined,
          city:        cust?.city ?? undefined,
          state:       cust?.state ?? undefined,
          zip_code:    cust?.zip_code ?? undefined,
          triggerType: m.trigger_type ?? 'post_sale',
          messageBody: buildCardMessage(m.trigger_type ?? 'post_sale', cust?.name ?? 'Valued Customer', dealerName),
        }
      })

      const html = generateBatchCardHtml({
        dealerName,
        dealerAddress,
        dealerPhone,
        recipients,
        weekLabel: `Week of ${humanWeekLabel(now)}`,
      })

      // Upload to Supabase Storage (bucket: card-batches)
      const fileName    = `${orgId}/${weekLabel}.html`
      const htmlBuffer  = Buffer.from(html, 'utf-8')
      const { error: uploadError } = await supabase.storage
        .from('card-batches')
        .upload(fileName, htmlBuffer, {
          contentType: 'text/html',
          upsert: true,
        })

      let pdfUrl: string | null = null
      if (!uploadError) {
        const { data: urlData } = supabase.storage
          .from('card-batches')
          .getPublicUrl(fileName)
        pdfUrl = urlData?.publicUrl ?? null
      }

      // Create receptionist task (deduped by batch_week)
      const { data: existingTask } = await supabase
        .from('tasks')
        .select('id')
        .eq('user_id', orgId)
        .eq('task_type', 'card_batch_print')
        .eq('status', 'open')
        .like('title', `%${weekLabel}%`)
        .maybeSingle()

      let taskId: string | null = null
      if (!existingTask) {
        const dueDate = new Date(now)
        dueDate.setUTCDate(dueDate.getUTCDate() + 3) // due in 3 days
        const { data: task } = await supabase.from('tasks').insert({
          user_id:   orgId,
          title:     `Print and mail cards - ${printMailings.length} customer${printMailings.length !== 1 ? 's' : ''} (${weekLabel})`,
          task_type: 'card_batch_print',
          priority:  'normal',
          status:    'open',
          due_at:    dueDate.toISOString(),
          notes:     pdfUrl ? `Download and print: ${pdfUrl}` : 'Cards ready to print.',
        }).select('id').single()
        taskId = task?.id ?? null
      }

      // Mark mailings as print_ready
      const mailingIds = printMailings.map(m => m.id)
      await supabase
        .from('card_mailings')
        .update({
          status:     'print_ready',
          batch_week: weekLabel,
          pdf_url:    pdfUrl,
          print_task_id: taskId,
        })
        .in('id', mailingIds)

      batchesCreated++

      // Send weekly digest email to dealer admin
      if (adminProfile?.email) {
        const digestHtml = buildDigestEmail({
          dealerName,
          weekLabel: `Week of ${humanWeekLabel(now)}`,
          mailings:  printMailings,
          pdfUrl,
          deliveryMethod: 'print_and_mail',
        })
        await sendNotificationEmail({
          to:      adminProfile.email,
          subject: `${printMailings.length} retention card${printMailings.length !== 1 ? 's' : ''} ready to print - ${humanWeekLabel(now)}`,
          html:    digestHtml,
        })
      }
    }

    // ── PostGrid: submit each card ─────────────────────────────────────────
    if (deliveryMethod === 'postgrid' && orgSettings?.postgrid_api_key) {
      const pgMailings = mailings.filter(m => m.delivery_method === 'postgrid')
      for (const m of pgMailings) {
        const cust = Array.isArray(m.customers) ? m.customers[0] : m.customers
        if (!cust?.address || !cust?.city || !cust?.state) {
          await supabase
            .from('card_mailings')
            .update({ status: 'failed', error_msg: 'Missing mailing address' })
            .eq('id', m.id)
          continue
        }

        try {
          const result = await createPostGridLetter({
            apiKey: orgSettings.postgrid_api_key,
            to: {
              firstName:       cust.name.split(' ')[0],
              lastName:        cust.name.split(' ').slice(1).join(' ') || undefined,
              addressLine1:    cust.address,
              city:            cust.city,
              provinceOrState: cust.state,
              postalOrZip:     cust.zip_code ?? '',
              countryCode:     'US',
            },
            from: {
              companyName:     dealerName,
              addressLine1:    dealerAddress || '123 Main St',
              city:            '',
              provinceOrState: '',
              postalOrZip:     '',
              countryCode:     'US',
            },
            html: `<p>${buildCardMessage(m.trigger_type ?? 'post_sale', cust.name, dealerName)}</p>`,
            description: `${m.trigger_type ?? 'retention'} card for ${cust.name}`,
          })

          await supabase
            .from('card_mailings')
            .update({
              status:            'queued',
              postgrid_job_id:   result.postgridJobId,
              estimated_delivery: result.estimatedDelivery?.toISOString().slice(0, 10) ?? null,
              batch_week:        weekLabel,
            })
            .eq('id', m.id)

          postgridQueued++
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'PostGrid error'
          await supabase
            .from('card_mailings')
            .update({ status: 'failed', error_msg: msg.slice(0, 200) })
            .eq('id', m.id)
        }
      }
    }
  }

  await finishCronRun(runId, 'success', batchesCreated + postgridQueued)
  return NextResponse.json({ ok: true, batchesCreated, postgridQueued })
}

// ── Message generator ─────────────────────────────────────────────────────────
function buildCardMessage(triggerType: string, customerName: string, dealerName: string): string {
  const first = customerName.split(' ')[0]
  switch (triggerType) {
    case 'birthday':
      return `Dear ${first},\n\nWishing you a wonderful birthday! It has been a pleasure serving you, and we look forward to helping you again in the future.\n\nWarm regards,\n${dealerName}`
    case 'sale_anniversary':
      return `Dear ${first},\n\nCan you believe it has already been a year? We hope you are still loving your vehicle. If you ever have questions or are ready for your next car, we are here for you.\n\nThank you for your business,\n${dealerName}`
    case 'service_due':
      return `Dear ${first},\n\nYour vehicle may be due for service. Staying on top of maintenance keeps your car running great and holds its value. Give us a call - we would love to help.\n\nYours truly,\n${dealerName}`
    case 'post_sale':
      return `Dear ${first},\n\nThank you for your recent purchase! We are so glad you chose us and hope you are enjoying your new vehicle. Do not hesitate to reach out if you need anything.\n\nWith appreciation,\n${dealerName}`
    case 'referral_thankyou':
      return `Dear ${first},\n\nThank you for referring a friend or family member to us - that means the world to us! Great customers like you are what make our business thrive.\n\nWith gratitude,\n${dealerName}`
    default:
      return `Dear ${first},\n\nThank you for being a valued customer. We appreciate your trust and look forward to serving you again.\n\nSincerely,\n${dealerName}`
  }
}

// ── Digest email HTML ─────────────────────────────────────────────────────────
function buildDigestEmail({
  dealerName,
  weekLabel,
  mailings,
  pdfUrl,
  deliveryMethod,
}: {
  dealerName:     string
  weekLabel:      string
  mailings:       { trigger_type?: string | null; customers?: unknown }[]
  pdfUrl:         string | null
  deliveryMethod: string
}): string {
  const rows = mailings.map(m => {
    const cust = Array.isArray(m.customers) ? m.customers[0] : (m.customers as { name?: string } | null)
    const name = cust?.name ?? 'Customer'
    const type = m.trigger_type?.replace(/_/g, ' ') ?? 'retention'
    return `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;">${name}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;text-transform:capitalize;">${type}</td></tr>`
  }).join('')

  const printSection = pdfUrl
    ? `<p style="margin:20px 0;"><a href="${pdfUrl}" style="background:#1a3c5e;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Download and Print Cards</a></p>`
    : `<p style="color:#666;font-style:italic;">Card file could not be generated. Please check your storage settings.</p>`

  const mailingNote = deliveryMethod === 'print_and_mail'
    ? '<p style="color:#555;font-size:14px;">Print the cards, sign each one, address the envelopes, and drop them in the mail. Mark the task complete in DealerWyze when done.</p>'
    : '<p style="color:#555;font-size:14px;">Cards have been submitted to PostGrid for automated mailing.</p>'

  return `
<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;">
  <div style="background:#1a3c5e;color:#fff;padding:24px;border-radius:8px 8px 0 0;">
    <h1 style="margin:0;font-size:20px;">Retention Cards - ${weekLabel}</h1>
    <p style="margin:6px 0 0;opacity:0.8;font-size:14px;">${dealerName}</p>
  </div>
  <div style="background:#fff;padding:24px;border:1px solid #eee;border-top:none;">
    <p style="font-size:16px;"><strong>${mailings.length} card${mailings.length !== 1 ? 's' : ''}</strong> to send this week:</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <thead>
        <tr style="background:#f5f5f5;">
          <th style="padding:8px 12px;text-align:left;font-size:13px;color:#555;">Customer</th>
          <th style="padding:8px 12px;text-align:left;font-size:13px;color:#555;">Card Type</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    ${printSection}
    ${mailingNote}
  </div>
  <div style="padding:16px;font-size:12px;color:#999;text-align:center;">
    DealerWyze - Automated Retention System
  </div>
</div>`
}
