/**
 * cardBatch — generates a multi-page HTML document for batch card printing.
 * Each page is one customer card (4x6 postcard layout).
 * The HTML is uploaded to Supabase Storage as a .html file; dealers print it
 * from the browser (Ctrl+P / File > Print).
 *
 * Uses pure HTML + inline CSS — no external PDF library dependency.
 * Each card page uses @page + page-break-after for clean printing.
 */

export interface CardRecipient {
  name:          string
  address?:      string
  city?:         string
  state?:        string
  zip_code?:     string
  triggerType:   string   // 'birthday' | 'sale_anniversary' | 'service_due' | 'post_sale' | 'referral_thankyou'
  vehicleLabel?: string   // e.g. '2021 Honda Accord'
  messageBody:   string   // personalized message text
}

export interface BatchCardOptions {
  dealerName:    string
  dealerAddress: string
  dealerPhone:   string
  recipients:    CardRecipient[]
  weekLabel:     string   // e.g. 'Week of March 17, 2026'
}

const TRIGGER_LABELS: Record<string, string> = {
  birthday:          'Happy Birthday',
  sale_anniversary:  'Anniversary',
  service_due:       'Service Reminder',
  post_sale:         'Thank You',
  referral_thankyou: 'Referral Thank You',
}

function cardPage(r: CardRecipient, dealer: { name: string; address: string; phone: string }, idx: number, total: number): string {
  const heading = TRIGGER_LABELS[r.triggerType] ?? 'From Your Dealer'
  const recipientLines = [
    r.name,
    r.address,
    r.city && r.state ? `${r.city}, ${r.state} ${r.zip_code ?? ''}`.trim() : r.zip_code,
  ].filter(Boolean).join('<br>')

  return `
  <div class="card-page">
    <!-- Front / Message side -->
    <div class="card-front">
      <div class="card-header">${escHtml(heading)}</div>
      <div class="card-body">${escHtml(r.messageBody)}</div>
      ${r.vehicleLabel ? `<div class="card-vehicle">${escHtml(r.vehicleLabel)}</div>` : ''}
      <div class="card-signature">
        <strong>${escHtml(dealer.name)}</strong><br>
        ${escHtml(dealer.phone)}
      </div>
    </div>
    <!-- Address side -->
    <div class="card-back">
      <div class="card-back-from">
        <strong>${escHtml(dealer.name)}</strong><br>
        ${escHtml(dealer.address)}
      </div>
      <div class="card-back-to">
        <div class="card-back-to-label">MAIL TO:</div>
        <div>${recipientLines}</div>
      </div>
      <div class="card-counter">${idx + 1} of ${total}</div>
    </div>
  </div>`
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function generateBatchCardHtml(opts: BatchCardOptions): string {
  const { dealerName, dealerAddress, dealerPhone, recipients, weekLabel } = opts
  const dealer = { name: dealerName, address: dealerAddress, phone: dealerPhone }

  const pages = recipients
    .map((r, i) => cardPage(r, dealer, i, recipients.length))
    .join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escHtml(dealerName)} - Cards ${escHtml(weekLabel)}</title>
<style>
  @page {
    size: 6in 4in;
    margin: 0;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: Georgia, 'Times New Roman', serif;
    background: #fff;
    color: #1a1a1a;
  }
  .card-page {
    width: 6in;
    height: 8in; /* front + back stacked */
    page-break-after: always;
    display: flex;
    flex-direction: column;
  }
  .card-front, .card-back {
    width: 6in;
    height: 4in;
    padding: 0.4in;
    border: 1px solid #ccc;
    position: relative;
    overflow: hidden;
  }
  .card-front {
    background: #fff;
    border-bottom: 2px dashed #ccc;
  }
  .card-back {
    background: #fafafa;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 0.3in;
  }
  .card-header {
    font-size: 22pt;
    font-weight: bold;
    color: #1a3c5e;
    margin-bottom: 14px;
    border-bottom: 2px solid #1a3c5e;
    padding-bottom: 8px;
  }
  .card-body {
    font-size: 11pt;
    line-height: 1.6;
    color: #333;
    margin-bottom: 12px;
    white-space: pre-wrap;
  }
  .card-vehicle {
    font-size: 9pt;
    color: #555;
    font-style: italic;
    margin-bottom: 12px;
  }
  .card-signature {
    position: absolute;
    bottom: 0.35in;
    right: 0.4in;
    text-align: right;
    font-size: 9pt;
    color: #444;
    line-height: 1.5;
  }
  .card-back-from {
    font-size: 9pt;
    line-height: 1.6;
    color: #555;
    width: 2in;
    flex-shrink: 0;
  }
  .card-back-to {
    flex: 1;
    font-size: 11pt;
    line-height: 1.8;
    color: #1a1a1a;
  }
  .card-back-to-label {
    font-size: 8pt;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: #888;
    margin-bottom: 6px;
  }
  .card-counter {
    position: absolute;
    bottom: 10px;
    right: 12px;
    font-size: 7pt;
    color: #bbb;
  }
  /* Print: hide screen chrome */
  @media print {
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
<!-- Print instructions (hidden when printing) -->
<div class="no-print" style="padding:16px;background:#f0f4ff;border-bottom:2px solid #1a3c5e;font-family:sans-serif;font-size:13px;">
  <strong>${escHtml(dealerName)} - ${escHtml(weekLabel)}</strong> &nbsp;|&nbsp;
  ${recipients.length} card${recipients.length !== 1 ? 's' : ''} to print &nbsp;|&nbsp;
  <a href="javascript:window.print()">Print all cards</a>
</div>
${pages}
</body>
</html>`
}
