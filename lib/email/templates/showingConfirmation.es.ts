/**
 * Spanish email template for showing confirmation
 * Sent to buyer when a showing is confirmed
 */

export interface ShowingConfirmationItem {
  buyerName: string
  listingAddress: string
  confirmedTime: string
  agentName: string
  agentPhone?: string
  specialInstructions?: string
}

export function buildShowingConfirmationHtmlEs(
  appUrl: string,
  confirmation: ShowingConfirmationItem
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
        Tu cita ha sido confirmada
      </h1>
    </div>
    <div style="background:#FFFFFF;padding:32px;border:1px solid #E2E8F0;border-top:none">
      <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.7">
        Hola ${confirmation.buyerName},
      </p>
      <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.7">
        Tu cita para ver la propiedad ha sido confirmada. Aquí están los detalles:
      </p>

      <div style="background:#F0F7FF;border:1px solid #BFE7FF;border-radius:8px;padding:24px;margin:0 0 28px">
        <p style="margin:0 0 16px;font-size:13px;font-weight:700;color:#0D2B55;text-transform:uppercase;letter-spacing:0.05em">
          Detalles de la Cita
        </p>

        <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#374151">
          Propiedad
        </p>
        <p style="margin:0 0 16px;font-size:14px;color:#374151">
          ${confirmation.listingAddress}
        </p>

        <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#374151">
          Fecha y Hora
        </p>
        <p style="margin:0 0 16px;font-size:14px;color:#374151;font-weight:600">
          ${confirmation.confirmedTime}
        </p>

        <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#374151">
          Agente
        </p>
        <p style="margin:0 0 16px;font-size:14px;color:#374151">
          ${confirmation.agentName}
          ${confirmation.agentPhone ? `<br /><a href="tel:${confirmation.agentPhone}" style="color:#F07018;text-decoration:none">${confirmation.agentPhone}</a>` : ''}
        </p>

        ${confirmation.specialInstructions ? `<p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#374151">
          Instrucciones Especiales
        </p>
        <p style="margin:0;font-size:13px;color:#374151">
          ${confirmation.specialInstructions}
        </p>` : ''}
      </div>

      <p style="margin:0 0 8px;font-size:14px;color:#374151;line-height:1.7">
        Si no puedes asistir, por favor contacta al agente lo antes posible.
      </p>
      <p style="margin:0;font-size:14px;color:#374151;line-height:1.7">
        ¡Esperamos que disfrutes viendo esta propiedad!
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
