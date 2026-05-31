/**
 * Spanish email template for showing request notifications
 * Sent to agent when a buyer requests a showing
 */

import { sig, footer, helpCta } from '../onboarding'

export interface ShowingRequestItem {
  buyerName: string
  buyerEmail: string
  buyerPhone?: string
  listingAddress: string
  requestedTimes: string[]
  message?: string
}

export function buildShowingRequestNotificationHtmlEs(
  agentName: string,
  appUrl: string,
  request: ShowingRequestItem
): string {
  const timesList = request.requestedTimes
    .map(time => `<li style="margin-bottom:8px">${time}</li>`)
    .join('')

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:24px 16px">
  <tr><td>
    <div style="background:#0D2B55;border-radius:12px 12px 0 0;padding:24px 32px">
      <p style="margin:0;color:#F07018;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em">RealtyWyze</p>
      <h1 style="margin:8px 0 0;color:#FFFFFF;font-size:20px;font-weight:700">
        Nueva solicitud de cita
      </h1>
    </div>
    <div style="background:#FFFFFF;padding:32px;border:1px solid #E2E8F0;border-top:none">
      <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.7">
        Hola ${agentName}, ${request.buyerName} está interesado en ver ${request.listingAddress}.
      </p>

      <div style="background:#F0F7FF;border:1px solid #BFE7FF;border-radius:8px;padding:24px;margin:0 0 28px">
        <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#0D2B55">
          Información del Comprador
        </p>
        <p style="margin:0 0 4px;font-size:14px;color:#374151;font-weight:600">
          ${request.buyerName}
        </p>
        <p style="margin:0 0 2px;font-size:13px;color:#64748B">
          ${request.buyerEmail}
          ${request.buyerPhone ? `<br />${request.buyerPhone}` : ''}
        </p>

        <p style="margin:16px 0 8px;font-size:13px;font-weight:700;color:#0D2B55">
          Horarios Solicitados
        </p>
        <ul style="margin:0;padding-left:20px;font-size:13px;color:#374151">
          ${timesList}
        </ul>

        ${request.message ? `<p style="margin:16px 0 0;font-size:13px;color:#374151;font-style:italic">
          "${request.message}"
        </p>` : ''}
      </div>

      <div style="text-align:center;margin-bottom:28px">
        <a href="${appUrl}/es/app/showings"
           style="display:inline-block;background:#F07018;color:#FFFFFF;font-weight:700;
                  font-size:15px;padding:14px 40px;border-radius:8px;text-decoration:none">
          Ver Solicitud
        </a>
      </div>

      <p style="margin:0;font-size:14px;color:#374151;line-height:1.7">
        Revisa la solicitud en tu panel y confirma o rechaza uno de los horarios solicitados.
      </p>

      ${sig(appUrl, 'real_estate')}
    </div>
    ${footer(appUrl, 'real_estate')}
  </td></tr>
</table>
</body>
</html>`
}
