/**
 * Onboarding email HTML templates.
 * All text must be plain English. No em dashes. No jargon.
 */

export function buildWelcomeEmailHtml(dealerName: string, appUrl: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:24px 16px">
  <tr><td>

    <!-- Header -->
    <div style="background:#0D2B55;border-radius:12px 12px 0 0;padding:28px 32px">
      <p style="margin:0;color:#F07018;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em">DealerWyze</p>
      <h1 style="margin:8px 0 0;color:#FFFFFF;font-size:22px;font-weight:700;line-height:1.3">
        Welcome, ${dealerName}. Let's get your dealership ready today.
      </h1>
    </div>

    <!-- Body -->
    <div style="background:#FFFFFF;padding:32px;border:1px solid #E2E8F0;border-top:none">

      <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.7">
        DealerWyze brings your leads, inventory, texting, and customer follow-up into one place
        so nothing falls through the cracks. Setup takes about 10 minutes.
      </p>

      <!-- What you get -->
      <div style="background:#F0F7FF;border-radius:10px;padding:20px 24px;margin:0 0 24px">
        <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#0D2B55;text-transform:uppercase;letter-spacing:0.05em">What DealerWyze does for you</p>
        <table cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td style="padding:6px 0;font-size:14px;color:#1E293B">
              <span style="color:#F07018;font-weight:700;margin-right:8px">1.</span>
              Every lead from CarGurus, AutoTrader, email, and text in one inbox
            </td>
          </tr>
          <tr>
            <td style="padding:6px 0;font-size:14px;color:#1E293B">
              <span style="color:#F07018;font-weight:700;margin-right:8px">2.</span>
              Text and email customers without switching apps
            </td>
          </tr>
          <tr>
            <td style="padding:6px 0;font-size:14px;color:#1E293B">
              <span style="color:#F07018;font-weight:700;margin-right:8px">3.</span>
              AI voice agent answers calls when you are on the lot
            </td>
          </tr>
          <tr>
            <td style="padding:6px 0;font-size:14px;color:#1E293B">
              <span style="color:#F07018;font-weight:700;margin-right:8px">4.</span>
              Weekly market pricing report so your inventory is always competitively priced
            </td>
          </tr>
        </table>
      </div>

      <!-- Prep checklist -->
      <p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#0D2B55">Have these ready before you log in:</p>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px">
        ${[
          'Dealership legal name and DBA (if different)',
          'Business address and zip code',
          'Main business phone number',
          'Business hours (open and close times)',
          'Your vehicle inventory - year, make, model, VIN, price, and mileage for each car',
          'Staff to add - name and email for each person',
          'Gmail address for lead emails (optional but recommended)',
        ].map(item => `
        <tr>
          <td style="padding:5px 0;font-size:14px;color:#374151;vertical-align:top">
            <span style="color:#16A34A;font-weight:700;margin-right:8px">+</span>${item}
          </td>
        </tr>`).join('')}
      </table>

      <!-- CTA -->
      <div style="text-align:center;margin:8px 0 28px">
        <a href="${appUrl}/onboarding"
           style="display:inline-block;background:#F07018;color:#FFFFFF;font-weight:700;font-size:15px;
                  padding:15px 40px;border-radius:8px;text-decoration:none">
          Set Up My Dealership
        </a>
        <p style="margin:12px 0 0;font-size:12px;color:#94A3B8">Takes about 10 minutes</p>
      </div>

      <div style="border-top:1px solid #F1F5F9;padding-top:20px">
        <p style="margin:0;font-size:13px;color:#64748B;line-height:1.6">
          Questions or need help? Reply to this email or text Tim at
          <a href="sms:+18054043873" style="color:#F07018">(805) 404-3873</a>.
          We want to make sure your first day goes smoothly.
        </p>
      </div>
    </div>

    <!-- Footer -->
    <div style="padding:16px;text-align:center;color:#94A3B8;font-size:11px">
      DealerWyze - Dealer Management Platform<br>
      <a href="${appUrl}/settings/billing" style="color:#94A3B8;text-decoration:underline">Manage subscription</a>
    </div>

  </td></tr>
</table>
</body>
</html>`
}

export interface NudgeItem {
  title: string      // short label, e.g. "Business phone missing"
  detail: string     // what impact this has, plain English
  action: string     // exactly what to do
  link: string       // direct URL to fix it
  linkText: string   // button label
}

export function buildNudgeEmailHtml(dealerName: string, appUrl: string, incomplete: NudgeItem[]): string {
  const itemsHtml = incomplete.map((item, i) => `
  <tr>
    <td style="padding:16px 0;border-bottom:1px solid #F1F5F9;vertical-align:top">
      <table cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td style="width:28px;vertical-align:top;padding-top:2px">
            <div style="background:#FEF3E2;border:1.5px solid #F07018;color:#F07018;font-weight:700;
                        font-size:12px;width:22px;height:22px;border-radius:50%;text-align:center;
                        line-height:22px">${i + 1}</div>
          </td>
          <td style="padding-left:12px">
            <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#0D2B55">${item.title}</p>
            <p style="margin:0 0 6px;font-size:13px;color:#374151;line-height:1.6">${item.detail}</p>
            <p style="margin:0 0 8px;font-size:13px;color:#64748B;line-height:1.6">
              <strong>To fix:</strong> ${item.action}
            </p>
            <a href="${item.link}"
               style="font-size:12px;font-weight:600;color:#F07018;text-decoration:none">${item.linkText} &rarr;</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>`).join('')

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:24px 16px">
  <tr><td>
    <div style="background:#0D2B55;border-radius:12px 12px 0 0;padding:24px 32px">
      <p style="margin:0;color:#F07018;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em">DealerWyze</p>
      <h1 style="margin:8px 0 0;color:#FFFFFF;font-size:20px;font-weight:700;line-height:1.3">
        ${dealerName}, here's what still needs your attention
      </h1>
    </div>
    <div style="background:#FFFFFF;padding:32px;border:1px solid #E2E8F0;border-top:none">

      <p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.7">
        Your DealerWyze account is almost ready. A few things are missing or incomplete.
        Getting these done now means leads won't slip through and your market pricing will be accurate
        from day one.
      </p>

      ${incomplete.length > 0 ? `
      <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#0D2B55;text-transform:uppercase;letter-spacing:0.05em">
        ${incomplete.length} item${incomplete.length !== 1 ? 's' : ''} to complete
      </p>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px">
        ${itemsHtml}
      </table>` : `
      <div style="background:#F0FDF4;border:1px solid #86EFAC;border-radius:8px;padding:16px;margin-bottom:28px">
        <p style="margin:0;font-size:14px;color:#15803D;font-weight:600">Setup looks complete - finish the wizard to activate your account.</p>
      </div>`}

      <div style="text-align:center;margin-bottom:28px">
        <a href="${appUrl}/onboarding"
           style="display:inline-block;background:#F07018;color:#FFFFFF;font-weight:700;
                  font-size:15px;padding:14px 40px;border-radius:8px;text-decoration:none">
          Continue Setup
        </a>
      </div>

      <div style="border-top:1px solid #F1F5F9;padding-top:20px">
        <p style="margin:0;font-size:13px;color:#64748B;line-height:1.6">
          Stuck on anything? Reply to this email or text Tim at
          <a href="sms:+18054043873" style="color:#F07018">(805) 404-3873</a>.
          Setup usually takes under 10 minutes and we can walk you through it live.
        </p>
      </div>
    </div>
    <div style="padding:16px;text-align:center;color:#94A3B8;font-size:11px">
      DealerWyze - Dealer Management Platform<br>
      <a href="${appUrl}/settings/billing" style="color:#94A3B8;text-decoration:underline">Manage subscription</a>
    </div>
  </td></tr>
</table>
</body>
</html>`
}

export function buildDayOneTipsEmailHtml(dealerName: string, appUrl: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:24px 16px">
  <tr><td>
    <div style="background:#0D2B55;border-radius:12px 12px 0 0;padding:24px 32px">
      <p style="margin:0;color:#F07018;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em">DealerWyze</p>
      <h1 style="margin:8px 0 0;color:#FFFFFF;font-size:20px;font-weight:700">3 things to do first, ${dealerName}</h1>
    </div>
    <div style="background:#FFFFFF;padding:32px;border:1px solid #E2E8F0;border-top:none">
      ${[
        {
          num: '1',
          title: 'Run Market Intelligence on your inventory',
          body: 'Go to Inventory and tap the "Market Check" button. DealerWyze will pull live market data and tell you if each car is priced right.',
          link: `${appUrl}/vehicles`,
          linkText: 'View Inventory',
        },
        {
          num: '2',
          title: 'Connect Gmail to pull in leads automatically',
          body: 'Go to Settings and connect your Gmail account. Every inquiry that lands in your inbox will show up in DealerWyze within 15 minutes.',
          link: `${appUrl}/settings`,
          linkText: 'Connect Gmail',
        },
        {
          num: '3',
          title: 'Check your Today page every morning',
          body: 'Your Today page shows who is waiting for a reply, upcoming tasks, and your daily performance snapshot. Make it your first stop each morning.',
          link: `${appUrl}/today`,
          linkText: 'Open Today',
        },
      ].map(tip => `
      <div style="margin-bottom:24px;padding-bottom:24px;border-bottom:1px solid #F1F5F9">
        <div style="display:flex;gap:12px;align-items:flex-start">
          <div style="background:#F07018;color:#fff;font-weight:700;font-size:14px;
                      min-width:28px;height:28px;border-radius:50%;display:flex;
                      align-items:center;justify-content:center;text-align:center;
                      line-height:28px;flex-shrink:0">${tip.num}</div>
          <div>
            <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#0D2B55">${tip.title}</p>
            <p style="margin:0 0 10px;font-size:13px;color:#374151;line-height:1.6">${tip.body}</p>
            <a href="${tip.link}" style="font-size:12px;color:#F07018;font-weight:600;text-decoration:none">${tip.linkText} -></a>
          </div>
        </div>
      </div>`).join('')}
      <p style="margin:0;font-size:13px;color:#64748B">
        Questions? Reply here or text Tim at (805) 404-3873. We are here to help.
      </p>
    </div>
    <div style="padding:16px;text-align:center;color:#94A3B8;font-size:11px">
      DealerWyze - <a href="${appUrl}/settings/billing" style="color:#94A3B8">Manage subscription</a>
    </div>
  </td></tr>
</table>
</body>
</html>`
}
