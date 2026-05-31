/**
 * Spanish email template for showing reminders
 * Sent to buyer the day before a confirmed showing
 */

export interface ShowingReminderItem {
  buyerName: string
  listingAddress: string
  showingTime: string
  agentName: string
  agentPhone?: string
}

export function buildShowingReminderHtmlEs(
  appUrl: string,
  reminder: ShowingReminderItem
): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:24px 16px">
  <tr><td>
    <div style="background:#0D2B55;border-radius:12px 12px 0 0;padding:24px 32px">
      <p style="margin:0;color:#F07018;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em">RealtyWyze</p>
      <h1 style="margin:8px 0 0;color:#FFFFFF;font-size:20px;font-weight:700">
        Recordatorio: Cita mañana
      </h1>
    </div>
    <div style="background:#FFFFFF;padding:32px;border:1px solid #E2E8F0;border-top:none">
      <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.7">
        Hola ${reminder.buyerName},
      </p>
      <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.7">
        Este es un recordatorio de tu cita de mañana:
      </p>

      <div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:8px;padding:24px;margin:0 0 28px">
        <p style="margin:0 0 16px;font-size:13px;font-weight:700;color:#92400E">
          Detalles de la Cita
        </p>

        <table cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td style="font-size:13px;font-weight:700;color:#374151;padding-right:12px;width:80px">Propiedad:</td>
            <td style="font-size:14px;color:#374151">${reminder.listingAddress}</td>
          </tr>
          <tr>
            <td style="font-size:13px;font-weight:700;color:#374151;padding-right:12px;padding-top:12px">Hora:</td>
            <td style="font-size:14px;color:#374151;padding-top:12px;font-weight:600">${reminder.showingTime}</td>
          </tr>
          <tr>
            <td style="font-size:13px;font-weight:700;color:#374151;padding-right:12px;padding-top:12px">Agente:</td>
            <td style="font-size:14px;color:#374151;padding-top:12px">
              ${reminder.agentName}
              ${reminder.agentPhone ? `<br /><a href="tel:${reminder.agentPhone}" style="color:#F07018;text-decoration:none">${reminder.agentPhone}</a>` : ''}
            </td>
          </tr>
        </table>
      </div>

      <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.7">
        Por favor, asegúrate de llegar 5-10 minutos antes de la hora programada.
      </p>
      <p style="margin:0;font-size:14px;color:#374151;line-height:1.7">
        Si necesitas cancelar o reprogramar, por favor contacta al agente lo antes posible.
      </p>

      <div style="border-top:1px solid #E2E8F0;margin-top:32px;padding-top:20px">
        <p style="margin:0;font-size:12px;color:#64748B">
          RealtyWyze<br />
          ${new Date().getFullYear()}
        </p>
      </div>
    </div>
  </td></tr>
</table>
</body>
</html>`
}
