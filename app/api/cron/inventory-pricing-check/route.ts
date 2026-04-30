import { NextRequest, NextResponse } from 'next/server'
import { validateCronAuth } from '@/lib/cron/validateCronAuth'
import { createServiceClient } from '@/lib/supabase/service'
import { sendNotificationEmail } from '@/lib/email/notify'
import { startCronRun, finishCronRun } from '@/lib/cron/runLogger'
import { assessPricing, type PricingRating } from '@/lib/pricing/pricingAssessment'
import { formatCurrency } from '@/lib/utils'

export const runtime = 'nodejs'
export const maxDuration = 55

interface MarketDataLike {
  fairMarketPrice?: number | null
  fastSalePrice?: number | null
  maxReturnPrice?: number | null
  fmvRangeLow?: number | null
  fmvRangeHigh?: number | null
  confidence?: string | null
  avgDom?: number | null
}

export async function GET(req: NextRequest) {
  const denied = validateCronAuth(req)
  if (denied) return denied

  const runId = await startCronRun('inventory-pricing-check')
  const supabase = createServiceClient()
  let emailsSent = 0

  try {
    // Get all active orgs
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id, name')
      .in('subscription_status', ['active', 'trialing'])

    for (const org of orgs ?? []) {
      // Get available vehicles with a price set
      const { data: vehicles } = await supabase
        .from('vehicles')
        .select('id, year, make, model, trim, price, mileage, stock_no, created_at, status, market_data_json, market_checked_at')
        .eq('user_id', org.id)
        .eq('status', 'available')
        .not('price', 'is', null)
        .order('created_at', { ascending: true })

      if (!vehicles || vehicles.length === 0) continue

      // Get dealer admin emails
      const { data: admins } = await supabase
        .from('profiles')
        .select('id, display_name')
        .eq('org_id', org.id)
        .eq('role', 'dealer_admin')
        .is('deactivated_at', null)

      if (!admins || admins.length === 0) continue

      // Assess each vehicle
      const assessed = vehicles.map(v => {
        const daysOnLot = Math.floor((Date.now() - new Date(v.created_at).getTime()) / 86400000)
        const pricing = assessPricing(v.price, v.market_data_json as MarketDataLike | null | undefined)
        return { v, pricing, daysOnLot }
      })

      const grouped = {
        overpriced:  assessed.filter(a => a.pricing.rating === 'overpriced'),
        high:        assessed.filter(a => a.pricing.rating === 'high'),
        good:        assessed.filter(a => a.pricing.rating === 'good'),
        underpriced: assessed.filter(a => a.pricing.rating === 'underpriced'),
        no_data:     assessed.filter(a => a.pricing.rating === 'no_data'),
      }

      const needsAttention = [...grouped.overpriced, ...grouped.high]
      const totalWithData = assessed.length - grouped.no_data.length

      // Build email for each admin
      for (const admin of admins) {
        const { data: authUser } = await supabase.auth.admin.getUserById(admin.id)
        const email = authUser?.user?.email
        if (!email) continue

        const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
        const subject = `Your Monday Pricing Report - ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`

        const html = buildPricingEmail({
          dealerName: org.name,
          dateStr,
          assessed,
          grouped,
          needsAttention,
          totalWithData,
          appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'https://dealerwyze.com',
        })

        await sendNotificationEmail({ to: email, subject, html })
        emailsSent++
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await finishCronRun(runId, 'error', emailsSent, message)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }

  await finishCronRun(runId, 'success', emailsSent)
  return NextResponse.json({ ok: true, emails_sent: emailsSent })
}

// ── Email builder ─────────────────────────────────────────────────────────────

interface VehicleRow {
  v: {
    year: number
    make: string
    model: string
    trim: string | null
    price: number | null
    stock_no: string | null
    market_checked_at: string | null
  }
  pricing: ReturnType<typeof assessPricing>
  daysOnLot: number
}

function buildPricingEmail({
  dealerName,
  dateStr,
  assessed,
  grouped,
  needsAttention,
  totalWithData,
  appUrl,
}: {
  dealerName: string
  dateStr: string
  assessed: VehicleRow[]
  grouped: Record<PricingRating, VehicleRow[]>
  needsAttention: VehicleRow[]
  totalWithData: number
  appUrl: string
}): string {
  const summaryBar = [
    { label: 'Total', count: assessed.length, color: '#64748B' },
    { label: 'Well Priced', count: grouped.good.length, color: '#16A34A' },
    { label: 'Above Market', count: grouped.high.length, color: '#EA580C' },
    { label: 'Overpriced', count: grouped.overpriced.length, color: '#DC2626' },
    { label: 'Underpriced', count: grouped.underpriced.length, color: '#2563EB' },
    { label: 'No Data', count: grouped.no_data.length, color: '#94A3B8' },
  ].filter(s => s.count > 0)

  const healthScore = totalWithData > 0
    ? Math.round((grouped.good.length / totalWithData) * 100)
    : null

  function vehicleRow(row: VehicleRow, highlight: boolean): string {
    const { v, pricing, daysOnLot } = row
    const name = `${v.year} ${v.make} ${v.model}${v.trim ? ' ' + v.trim : ''}`
    const ratingColors: Record<PricingRating, string> = {
      overpriced:  '#DC2626',
      high:        '#EA580C',
      good:        '#16A34A',
      underpriced: '#2563EB',
      no_data:     '#94A3B8',
    }
    const color = ratingColors[pricing.rating]
    const deltaLabel = pricing.pctDelta !== 0
      ? `${pricing.pctDelta > 0 ? '+' : ''}${Math.abs(pricing.pctDelta).toFixed(1)}% ${pricing.pctDelta > 0 ? 'above' : 'below'} market`
      : 'At market'

    const suggestion = pricing.suggestedPrice
      ? `<br><span style="font-size:11px;color:#64748B">Suggest: ${formatCurrency(pricing.suggestedPrice)}</span>`
      : ''

    const urgency = pricing.rating === 'overpriced' && daysOnLot >= 45
      ? `<span style="font-size:10px;background:#FEE2E2;color:#DC2626;padding:2px 6px;border-radius:4px;margin-left:6px">🔥 ${daysOnLot}d on lot</span>`
      : daysOnLot >= 60
        ? `<span style="font-size:10px;color:#94A3B8;margin-left:6px">${daysOnLot}d on lot</span>`
        : ''

    return `
      <tr style="background:${highlight ? '#F8FAFC' : '#FFFFFF'}">
        <td style="padding:10px 12px;border-bottom:1px solid #F1F5F9">
          <span style="font-size:13px;font-weight:600;color:#0F172A">${name}</span>
          ${v.stock_no ? `<br><span style="font-size:11px;color:#F07018;font-family:monospace">#${v.stock_no}</span>` : ''}
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #F1F5F9;text-align:right">
          <span style="font-size:14px;font-weight:700;color:#0D2B55">${v.price ? formatCurrency(v.price) : '—'}</span>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #F1F5F9;text-align:center;white-space:nowrap">
          ${pricing.fastSalePrice ? formatCurrency(pricing.fastSalePrice) : '—'}<br>
          <span style="font-size:10px;color:#94A3B8">Fast sale</span>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #F1F5F9;text-align:center;white-space:nowrap">
          ${pricing.fairMarketPrice ? `<strong>${formatCurrency(pricing.fairMarketPrice)}</strong>` : '—'}<br>
          <span style="font-size:10px;color:#94A3B8">Fair market</span>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #F1F5F9;text-align:center;white-space:nowrap">
          ${pricing.maxReturnPrice ? formatCurrency(pricing.maxReturnPrice) : '—'}<br>
          <span style="font-size:10px;color:#94A3B8">Max return</span>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #F1F5F9;text-align:right;white-space:nowrap">
          <span style="font-size:12px;font-weight:600;color:${color}">${deltaLabel}</span>
          ${urgency}
          ${suggestion}
        </td>
      </tr>`
  }

  const attentionRows = needsAttention.sort((a, b) => b.pricing.pctDelta - a.pricing.pctDelta)
    .map((row, i) => vehicleRow(row, i % 2 === 0)).join('')

  const goodRows = grouped.good
    .map((row, i) => vehicleRow(row, i % 2 === 0)).join('')

  const underpricedRows = grouped.underpriced
    .map((row, i) => vehicleRow(row, i % 2 === 0)).join('')

  const tableHeader = `
    <tr style="background:#F8FAFC">
      <th style="padding:8px 12px;text-align:left;font-size:11px;color:#64748B;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #E2E8F0">Vehicle</th>
      <th style="padding:8px 12px;text-align:right;font-size:11px;color:#64748B;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #E2E8F0">Your Price</th>
      <th style="padding:8px 12px;text-align:center;font-size:11px;color:#64748B;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #E2E8F0">Fast Sale</th>
      <th style="padding:8px 12px;text-align:center;font-size:11px;color:#64748B;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #E2E8F0">Fair Market</th>
      <th style="padding:8px 12px;text-align:center;font-size:11px;color:#64748B;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #E2E8F0">Max Return</th>
      <th style="padding:8px 12px;text-align:right;font-size:11px;color:#64748B;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;border-bottom:2px solid #E2E8F0">Assessment</th>
    </tr>`

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:700px;margin:0 auto;padding:24px 16px">
  <tr><td>

    <!-- Header -->
    <div style="background:#0D2B55;border-radius:12px 12px 0 0;padding:24px 28px">
      <p style="margin:0;color:#F07018;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em">DealerWyze</p>
      <h1 style="margin:6px 0 0;color:#FFFFFF;font-size:22px;font-weight:700">Monday Pricing Report</h1>
      <p style="margin:4px 0 0;color:rgba(255,255,255,0.6);font-size:13px">${dateStr} - ${dealerName}</p>
    </div>

    <!-- Summary bar -->
    <div style="background:#FFFFFF;padding:20px 28px;display:flex;gap:16px;flex-wrap:wrap;border-left:1px solid #E2E8F0;border-right:1px solid #E2E8F0">
      ${summaryBar.map(s => `
        <div style="text-align:center;min-width:60px">
          <p style="margin:0;font-size:24px;font-weight:700;color:${s.color}">${s.count}</p>
          <p style="margin:2px 0 0;font-size:10px;color:#94A3B8;font-weight:600;text-transform:uppercase;letter-spacing:0.05em">${s.label}</p>
        </div>
      `).join('<div style="width:1px;background:#F1F5F9;align-self:stretch"></div>')}
      ${healthScore !== null ? `
        <div style="margin-left:auto;text-align:right">
          <p style="margin:0;font-size:11px;color:#94A3B8">Pricing Health</p>
          <p style="margin:2px 0 0;font-size:22px;font-weight:700;color:${healthScore >= 70 ? '#16A34A' : healthScore >= 40 ? '#EA580C' : '#DC2626'}">${healthScore}%</p>
        </div>
      ` : ''}
    </div>

    ${needsAttention.length > 0 ? `
    <!-- Needs attention -->
    <div style="margin-top:24px">
      <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#DC2626;text-transform:uppercase;letter-spacing:0.05em">
        ⚠️ Needs Price Review (${needsAttention.length})
      </p>
      <div style="border-radius:8px;overflow:hidden;border:1px solid #FECACA">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
          ${tableHeader}${attentionRows}
        </table>
      </div>
    </div>
    ` : ''}

    ${grouped.underpriced.length > 0 ? `
    <!-- Underpriced -->
    <div style="margin-top:24px">
      <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#2563EB;text-transform:uppercase;letter-spacing:0.05em">
        💙 Priced Below Market - You Could Charge More (${grouped.underpriced.length})
      </p>
      <div style="border-radius:8px;overflow:hidden;border:1px solid #BFDBFE">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
          ${tableHeader}${underpricedRows}
        </table>
      </div>
    </div>
    ` : ''}

    ${grouped.good.length > 0 ? `
    <!-- Well priced -->
    <div style="margin-top:24px">
      <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#16A34A;text-transform:uppercase;letter-spacing:0.05em">
        ✅ Well Priced (${grouped.good.length})
      </p>
      <div style="border-radius:8px;overflow:hidden;border:1px solid #BBF7D0">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
          ${tableHeader}${goodRows}
        </table>
      </div>
    </div>
    ` : ''}

    ${grouped.no_data.length > 0 ? `
    <!-- No market data -->
    <div style="margin-top:24px;padding:16px 20px;background:#F8FAFC;border-radius:8px;border:1px solid #E2E8F0">
      <p style="margin:0;font-size:13px;color:#64748B">
        <strong>${grouped.no_data.length} vehicle${grouped.no_data.length !== 1 ? 's' : ''}</strong> haven't had a market price check yet.
        Open each vehicle in DealerWyze and tap "Price Check" to see where you stand.
      </p>
    </div>
    ` : ''}

    <!-- CTA -->
    <div style="margin-top:28px;text-align:center">
      <a href="${appUrl}/vehicles" style="display:inline-block;background:#F07018;color:#FFFFFF;font-weight:700;font-size:14px;padding:14px 32px;border-radius:8px;text-decoration:none">
        View Inventory in DealerWyze
      </a>
    </div>

    <!-- Footer -->
    <p style="margin:24px 0 0;text-align:center;font-size:11px;color:#CBD5E1">
      DealerWyze - sent every Monday morning<br>
      <a href="${appUrl}/settings" style="color:#CBD5E1">Manage notification preferences</a>
    </p>

  </td></tr>
</table>
</body>
</html>`
}
