/**
 * BHPH Reminder Message Templates (TCPA-compliant)
 *
 * Rules:
 * - Every message identifies the business by name.
 * - Every message includes "Reply STOP to opt out."
 * - No promotional language — these are transactional messages only.
 * - Tone escalates from friendly → firm as lateness increases.
 */

export type ReminderType = 'pre_3day' | 'due_day' | 'late_2day' | 'late_7day'

export interface MessageVars {
  customerName: string
  amount: number
  dueDate: string      // human-readable e.g. "Mon Feb 27" (ISO ymd in dueDate field for formatDate)
  dealerPhone: string
  dealerName: string   // e.g. "Apollo Auto"
  vehicleLabel: string // e.g. "2019 Honda CR-V"
  paymentContext?: 'loan' | 'deferred_down_payment'
  /** Two-tier SMS (optional) */
  paymentLink?: string
  achSetupLink?: string
  achVerified?: boolean
  zelle?: string
  venmo?: string
  cashapp?: string
  manualInstructionsEnabled?: boolean
  achPromptsEnabled?: boolean
}

const STOP_SUFFIX = 'Reply STOP to opt out.'

function fmt(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function formatDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

/** Core reminder text without the STOP suffix (for two-tier composition). */
export function smsReminderMainBody(type: ReminderType, vars: MessageVars): string {
  const { customerName, amount, dueDate, dealerPhone, dealerName, vehicleLabel, paymentContext } = vars
  const first = customerName.split(' ')[0]
  const d = formatDate(dueDate)
  const a = fmt(amount)
  const paymentLabel = paymentContext === 'deferred_down_payment'
    ? `deferred down payment installment of ${a}`
    : `payment of ${a}`
  const accountLabel = paymentContext === 'deferred_down_payment'
    ? `for your ${vehicleLabel}`
    : `for your ${vehicleLabel}`

  switch (type) {
    case 'pre_3day':
      return `Hi ${first}, this is a reminder from ${dealerName} that your ${paymentLabel} ${accountLabel} is due on ${d}. Questions? Call us at ${dealerPhone}.`

    case 'due_day':
      return `Hi ${first}, your ${paymentLabel} to ${dealerName} is due TODAY ${accountLabel}. Please call ${dealerPhone} or stop by to make your payment. Reply PAY to confirm you are coming in.`

    case 'late_2day':
      return `Hi ${first}, your ${paymentLabel} to ${dealerName} ${accountLabel} is now 2 days past due. Please contact us at ${dealerPhone} as soon as possible to keep your account current.`

    case 'late_7day':
      return `Hi ${first}, your ${paymentLabel} to ${dealerName} ${accountLabel} is 7 days past due. Please call ${dealerPhone} immediately to discuss payment options and avoid further action on your account.`
  }
}

function buildManualP2pLine(vars: MessageVars): string | null {
  if (!vars.manualInstructionsEnabled) return null
  const parts: string[] = []
  const z = vars.zelle?.trim()
  const v = vars.venmo?.trim()
  const c = vars.cashapp?.trim()
  if (z) parts.push(`Zelle ${z}`)
  if (v) parts.push(`Venmo ${v}`)
  if (c) parts.push(`Cash App ${c}`)
  if (parts.length === 0) return null
  return `Pay free via ${parts.join(' / ')} — reply PAID when sent.`
}

/**
 * Two-tier reminder SMS: auto-pull ACH, or card + optional ACH setup + optional P2P handles.
 * Caller must still ensure TCPA consent / opt-out checks before sending.
 */
export function buildTwoTierSmsMessage(type: ReminderType, vars: MessageVars): string {
  const { customerName, amount, dueDate, dealerPhone, vehicleLabel } = vars
  const first = customerName.split(' ')[0]
  const d = formatDate(dueDate)
  const a = fmt(amount)

  if (vars.achVerified) {
    return `Hi ${first}, your ${a} payment for your ${vehicleLabel} pulls automatically from your bank on ${d}. Questions? Call ${dealerPhone}. ${STOP_SUFFIX}`
  }

  const main = smsReminderMainBody(type, vars)
  const manualLine = buildManualP2pLine(vars)
  const achOn = vars.achPromptsEnabled !== false
  const hasAchLink = !!vars.achSetupLink?.trim()
  const payLink = vars.paymentLink?.trim() ?? ''

  let body = main

  if (achOn && hasAchLink) {
    const lines = [body]
    if (payLink) lines.push(`Pay by card: ${payLink}`)
    lines.push(`Set up free bank payments: ${vars.achSetupLink!.trim()}`)
    if (manualLine) lines.push(manualLine)
    body = lines.join('\n')
  } else {
    const lines = [body]
    if (payLink) lines.push(`Pay here: ${payLink}`)
    if (manualLine) lines.push(manualLine)
    body = lines.join('\n')
  }

  return `${body} ${STOP_SUFFIX}`
}

export function buildSmsMessage(type: ReminderType, vars: MessageVars): string {
  return `${smsReminderMainBody(type, vars)} ${STOP_SUFFIX}`
}

export function buildEmailSubject(type: ReminderType, vehicleLabel: string): string {
  switch (type) {
    case 'pre_3day': return `Payment Reminder: Your payment is due in 3 days — ${vehicleLabel}`
    case 'due_day':  return `Payment Due Today — ${vehicleLabel}`
    case 'late_2day': return `Past Due Notice — ${vehicleLabel}`
    case 'late_7day': return `Urgent: Account Past Due — ${vehicleLabel}`
  }
}

export function buildEmailBody(type: ReminderType, vars: MessageVars): string {
  const { customerName, amount, dueDate, dealerPhone, dealerName, vehicleLabel, paymentContext } = vars
  const d = formatDate(dueDate)
  const a = fmt(amount)
  const paymentLabel = paymentContext === 'deferred_down_payment'
    ? `deferred down payment installment of <strong>${a}</strong>`
    : `payment of <strong>${a}</strong>`

  const header = `Dear ${customerName},`
  const footer = `
<p style="margin-top:24px;font-size:12px;color:#666;">
  ${dealerName} &bull; ${dealerPhone}<br>
  To opt out of text messages, reply STOP to any message from us.<br>
  To unsubscribe from email reminders, reply to this email with "unsubscribe".
</p>`

  let body = ''
  switch (type) {
    case 'pre_3day':
      body = `<p>This is a friendly reminder that your ${paymentLabel} for your <strong>${vehicleLabel}</strong> is due on <strong>${d}</strong>.</p>
<p>If you have already made your payment, please disregard this notice. Thank you for your business!</p>`
      break
    case 'due_day':
      body = `<p>Your ${paymentLabel} for your <strong>${vehicleLabel}</strong> is due <strong>today</strong>.</p>
<p>Please call us at <strong>${dealerPhone}</strong> or visit us to make your payment.</p>`
      break
    case 'late_2day':
      body = `<p>Your ${paymentLabel} for your <strong>${vehicleLabel}</strong> is now <strong>2 days past due</strong>.</p>
<p>Please contact us at <strong>${dealerPhone}</strong> as soon as possible to bring your account current and avoid any additional issues.</p>`
      break
    case 'late_7day':
      body = `<p>Your account for your <strong>${vehicleLabel}</strong> is now <strong>7 days past due</strong>. The past-due amount is <strong>${a}</strong>.</p>
<p>Please call us immediately at <strong>${dealerPhone}</strong> to discuss payment arrangements.</p>`
      break
  }

  return `<!DOCTYPE html><html><body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
<h2 style="color:#1a1a1a;">${dealerName} — Payment Notice</h2>
<p>${header}</p>
${body}
${footer}
</body></html>`
}
