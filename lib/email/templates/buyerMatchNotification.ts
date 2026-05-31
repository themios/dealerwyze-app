/**
 * Email template for buyer match notifications
 * Sent when new listings match a buyer profile
 */

import { sig, footer, helpCta } from '../onboarding'

export interface MatchItem {
  buyerName: string
  listingAddress: string
  listingPrice: number | null
  bedroomsBathrooms: string
  mls_number?: string
}

function formatPrice(price: number | null): string {
  if (!price) return 'Price TBD'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(price)
}

export function buildBuyerMatchNotificationHtml(
  agentName: string,
  appUrl: string,
  matches: MatchItem[]
): string {
  const matchRows = matches
    .map(
      m => `
    <tr style="border-bottom:1px solid #F1F5F9">
      <td style="padding:16px 0;vertical-align:top">
        <table cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td>
              <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#0D2B55">
                ${m.buyerName}
              </p>
              <p style="margin:0 0 2px;font-size:13px;color:#374151">
                ${m.listingAddress}
              </p>
              <p style="margin:0;font-size:13px;color:#64748B">
                ${m.bedroomsBathrooms} &nbsp;|&nbsp; ${formatPrice(m.listingPrice)}
                ${m.mls_number ? ` &nbsp;|&nbsp; MLS ${m.mls_number}` : ''}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>`
    )
    .join('')

  const matchCount = matches.length
  const pluralMatch = matchCount === 1 ? 'match' : 'matches'

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:24px 16px">
  <tr><td>
    <div style="background:#0D2B55;border-radius:12px 12px 0 0;padding:24px 32px">
      <p style="margin:0;color:#F07018;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em">RealtyWyze</p>
      <h1 style="margin:8px 0 0;color:#FFFFFF;font-size:20px;font-weight:700">
        ${matchCount} new buyer ${pluralMatch}
      </h1>
    </div>
    <div style="background:#FFFFFF;padding:32px;border:1px solid #E2E8F0;border-top:none">
      <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.7">
        Hey ${agentName}, we found ${matchCount} listing${matchCount !== 1 ? 's' : ''} that match your buyer criteria.
        Review ${matchCount === 1 ? 'it' : 'them'} below and reach out to your buyers who might be interested.
      </p>

      <div style="background:#F0F7FF;border:1px solid #BFE7FF;border-radius:8px;padding:24px;margin:0 0 28px">
        <p style="margin:0 0 16px;font-size:13px;font-weight:700;color:#0D2B55;text-transform:uppercase;letter-spacing:0.05em">
          New ${pluralMatch}
        </p>
        <table cellpadding="0" cellspacing="0" width="100%">
          ${matchRows}
        </table>
      </div>

      <div style="text-align:center;margin-bottom:28px">
        <a href="${appUrl}/app/matches"
           style="display:inline-block;background:#F07018;color:#FFFFFF;font-weight:700;
                  font-size:15px;padding:14px 40px;border-radius:8px;text-decoration:none">
          Review Your Matches
        </a>
      </div>

      <p style="margin:0 0 8px;font-size:14px;color:#374151;line-height:1.7">
        You can manage all your buyer matches from your dashboard. Mark them as sent, reviewed, or closed.
      </p>
      <p style="margin:0;font-size:14px;color:#374151;line-height:1.7">
        New listings will continue to match automatically throughout the day.
      </p>

      ${sig(appUrl, 'real_estate')}
    </div>
    ${footer(appUrl, 'real_estate')}
  </td></tr>
</table>
</body>
</html>`
}
