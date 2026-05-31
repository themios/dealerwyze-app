/**
 * Onboarding email HTML templates.
 * All text must be plain English. No em dashes. No jargon.
 */

type V = 'dealer' | 'real_estate'

// Shared email signature block used in every dealer-facing email.
function sig(appUrl: string, vertical: V = 'dealer'): string {
  const brand = vertical === 'real_estate' ? 'RealtyWyze' : 'DealerWyze'
  return `
    <div style="border-top:1px solid #F1F5F9;margin-top:28px;padding-top:20px">
      <p style="margin:0;font-size:14px;color:#374151;line-height:1.8">
        Tim Harmantzis<br>
        <span style="color:#64748B">Founder, ${brand}</span><br>
        <a href="sms:+18054043873" style="color:#F07018;text-decoration:none">(805) 404-3873</a><br>
        <a href="${appUrl}" style="color:#F07018;text-decoration:none">${appUrl.replace('https://', '')}</a>
      </p>
    </div>`
}

// Shared footer strip at the bottom of every email.
function footer(appUrl: string, vertical: V = 'dealer'): string {
  const brand = vertical === 'real_estate' ? 'RealtyWyze' : 'DealerWyze'
  return `
    <div style="padding:16px;text-align:center;color:#94A3B8;font-size:11px">
      ${brand} &nbsp;|&nbsp; <a href="${appUrl}" style="color:#94A3B8;text-decoration:underline">${appUrl.replace('https://', '')}</a> &nbsp;|&nbsp;
      <a href="${appUrl}/settings/billing" style="color:#94A3B8;text-decoration:underline">Manage subscription</a>
    </div>`
}

// Shared "ask for help" CTA used in follow-up emails.
function helpCta(vertical: V = 'dealer'): string {
  const supportEmail = vertical === 'real_estate' ? 'support@realtywyze.us' : 'support@dealerwyze.com'
  return `
    <div style="text-align:center;margin-top:24px">
      <a href="mailto:${supportEmail}?subject=I%20need%20help%20getting%20started"
         style="display:inline-block;background:#F8FAFC;border:1.5px solid #E2E8F0;color:#0D2B55;
                font-weight:700;font-size:13px;padding:10px 24px;border-radius:8px;text-decoration:none">
        Ask for help getting started
      </a>
    </div>`
}

export function buildWelcomeEmailHtml(dealerName: string, appUrl: string, vertical: V = 'dealer'): string {
  const isRe = vertical === 'real_estate'
  const brand = isRe ? 'RealtyWyze' : 'DealerWyze'
  const welcomeHeadline = isRe
    ? `Welcome, ${dealerName}. Let's get your brokerage ready today.`
    : `Welcome, ${dealerName}. Let's get your dealership ready today.`
  const intro = isRe
    ? `Thanks for signing up. RealtyWyze puts every prospect, every listing, and every client conversation in one place so you never lose a transaction because something slipped through the cracks. Setup takes about 10 minutes.`
    : `Thanks for signing up. DealerWyze puts every lead, every car, and every customer conversation in one place so you never lose a deal because something slipped through the cracks. Setup takes about 10 minutes.`
  const bullets = isRe
    ? [
        'Every inquiry from Zillow, Realtor.com, email, and text in one inbox',
        'Text and email clients without switching apps',
        'AI voice agent answers calls when you are showing a property',
        'Weekly market report so your listings stay competitive',
      ]
    : [
        'Every lead from CarGurus, AutoTrader, email, and text in one inbox',
        'Text and email customers without switching apps',
        'AI voice agent answers calls when you are on the lot',
        'Weekly market pricing report so your inventory stays competitive',
      ]
  const checklist = isRe
    ? [
        'Brokerage legal name and DBA (if different)',
        'Business address and zip code',
        'Main business phone number',
        'Business hours',
        'Your active listings (address, asking price, beds, baths, square footage)',
        'Agent names and emails',
        'Gmail address for inquiry emails (optional but recommended)',
      ]
    : [
        'Dealership legal name and DBA (if different)',
        'Business address and zip code',
        'Main business phone number',
        'Business hours',
        'Your vehicle inventory (year, make, model, VIN, price, and mileage)',
        'Staff names and emails',
        'Gmail address for lead emails (optional but recommended)',
      ]
  const ctaLabel = isRe ? 'Set Up My Brokerage' : 'Set Up My Dealership'

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:24px 16px">
  <tr><td>

    <div style="background:#0D2B55;border-radius:12px 12px 0 0;padding:28px 32px">
      <p style="margin:0;color:#F07018;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em">${brand}</p>
      <h1 style="margin:8px 0 0;color:#FFFFFF;font-size:22px;font-weight:700;line-height:1.3">
        ${welcomeHeadline}
      </h1>
    </div>

    <div style="background:#FFFFFF;padding:32px;border:1px solid #E2E8F0;border-top:none">

      <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.7">
        ${intro}
      </p>

      <div style="background:#F0F7FF;border-radius:10px;padding:20px 24px;margin:0 0 24px">
        <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#0D2B55;text-transform:uppercase;letter-spacing:0.05em">What ${brand} does for you</p>
        <table cellpadding="0" cellspacing="0" width="100%">
          ${bullets.map((item, i) => `
          <tr>
            <td style="padding:6px 0;font-size:14px;color:#1E293B">
              <span style="color:#F07018;font-weight:700;margin-right:8px">${i + 1}.</span>${item}
            </td>
          </tr>`).join('')}
        </table>
      </div>

      <p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#0D2B55">Have these ready before you log in:</p>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px">
        ${checklist.map(item => `
        <tr>
          <td style="padding:5px 0;font-size:14px;color:#374151;vertical-align:top">
            <span style="color:#16A34A;font-weight:700;margin-right:8px">+</span>${item}
          </td>
        </tr>`).join('')}
      </table>

      <div style="text-align:center;margin:8px 0 28px">
        <a href="${appUrl}/onboarding"
           style="display:inline-block;background:#F07018;color:#FFFFFF;font-weight:700;font-size:15px;
                  padding:15px 40px;border-radius:8px;text-decoration:none">
          ${ctaLabel}
        </a>
        <p style="margin:12px 0 0;font-size:12px;color:#94A3B8">Takes about 10 minutes</p>
      </div>

      <p style="margin:0 0 4px;font-size:14px;color:#374151;line-height:1.7">
        If you have any questions or want a hand getting started, just reply to this email or give me a text.
        I want to make sure your first day goes well.
      </p>

      ${sig(appUrl, vertical)}
    </div>

    ${footer(appUrl, vertical)}

  </td></tr>
</table>
</body>
</html>`
}

export interface NudgeItem {
  title: string
  detail: string
  action: string
  link: string
  linkText: string
}

export function buildNudgeEmailHtml(dealerName: string, appUrl: string, incomplete: NudgeItem[], vertical: V = 'dealer'): string {
  const isRe = vertical === 'real_estate'
  const brand = isRe ? 'RealtyWyze' : 'DealerWyze'
  const intro = isRe
    ? `Your RealtyWyze account is almost ready. A few things are still missing. Taking care of these now means inquiries won't slip through and your pricing data will be accurate from day one.`
    : `Your DealerWyze account is almost ready. A few things are still missing. Taking care of these now means leads won't slip through and your pricing data will be accurate from day one.`
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
      <p style="margin:0;color:#F07018;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em">${brand}</p>
      <h1 style="margin:8px 0 0;color:#FFFFFF;font-size:20px;font-weight:700;line-height:1.3">
        ${dealerName}, a few things still need your attention
      </h1>
    </div>
    <div style="background:#FFFFFF;padding:32px;border:1px solid #E2E8F0;border-top:none">

      <p style="margin:0 0 20px;color:#374151;font-size:14px;line-height:1.7">
        ${intro}
      </p>

      ${incomplete.length > 0 ? `
      <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#0D2B55;text-transform:uppercase;letter-spacing:0.05em">
        ${incomplete.length} item${incomplete.length !== 1 ? 's' : ''} to complete
      </p>
      <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px">
        ${itemsHtml}
      </table>` : `
      <div style="background:#F0FDF4;border:1px solid #86EFAC;border-radius:8px;padding:16px;margin-bottom:28px">
        <p style="margin:0;font-size:14px;color:#15803D;font-weight:600">Setup looks complete. Finish the wizard to activate your account.</p>
      </div>`}

      <div style="text-align:center;margin-bottom:28px">
        <a href="${appUrl}/onboarding"
           style="display:inline-block;background:#F07018;color:#FFFFFF;font-weight:700;
                  font-size:15px;padding:14px 40px;border-radius:8px;text-decoration:none">
          Continue Setup
        </a>
      </div>

      <p style="margin:0;font-size:14px;color:#374151;line-height:1.7">
        If you hit a snag, just reply here or send me a text. Setup usually takes under 10 minutes
        and I am happy to walk you through it.
      </p>

      ${sig(appUrl, vertical)}
    </div>
    ${footer(appUrl, vertical)}
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
          body: 'Go to Inventory and tap the Market Check button. DealerWyze pulls live market data and tells you if each car is priced right for your area.',
          link: `${appUrl}/vehicles`,
          linkText: 'View Inventory',
        },
        {
          num: '2',
          title: 'Connect Gmail to pull in leads automatically',
          body: 'Go to Settings and connect your Gmail account. Every inquiry that lands in your inbox will show up in DealerWyze within 15 minutes. This is the one step that makes the biggest difference.',
          link: `${appUrl}/settings`,
          linkText: 'Connect Gmail',
        },
        {
          num: '3',
          title: 'Check your Today page every morning',
          body: 'Your Today page shows who is waiting for a reply, your upcoming tasks, and your daily numbers. Make it your first stop each morning and you will not miss a lead.',
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
            <a href="${tip.link}" style="font-size:12px;color:#F07018;font-weight:600;text-decoration:none">${tip.linkText} &rarr;</a>
          </div>
        </div>
      </div>`).join('')}

      <p style="margin:0;font-size:14px;color:#374151;line-height:1.7">
        Any questions, just reply here. I read everything personally.
      </p>

      ${sig(appUrl)}
      ${helpCta()}
    </div>
    ${footer(appUrl)}
  </td></tr>
</table>
</body>
</html>`
}

export function buildDayThreeFollowUpHtml(dealerName: string, appUrl: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:24px 16px">
  <tr><td>
    <div style="background:#0D2B55;border-radius:12px 12px 0 0;padding:24px 32px">
      <p style="margin:0;color:#F07018;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em">DealerWyze</p>
      <h1 style="margin:8px 0 0;color:#FFFFFF;font-size:20px;font-weight:700">Hey ${dealerName}, how is setup going?</h1>
    </div>
    <div style="background:#FFFFFF;padding:32px;border:1px solid #E2E8F0;border-top:none">
      <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7">
        You signed up a few days ago and I wanted to check in. Most dealers finish setup in one sitting
        but life gets busy. No pressure.
      </p>
      <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.7">
        The two things that make the biggest difference on day one:
      </p>
      <div style="background:#F0F7FF;border-radius:10px;padding:20px 24px;margin:0 0 28px">
        <p style="margin:0 0 10px;font-size:14px;color:#1E293B">
          <span style="color:#F07018;font-weight:700;margin-right:8px">1.</span>
          <strong>Add your inventory.</strong> Even one vehicle unlocks market pricing analysis.
        </p>
        <p style="margin:0;font-size:14px;color:#1E293B">
          <span style="color:#F07018;font-weight:700;margin-right:8px">2.</span>
          <strong>Connect Gmail.</strong> Lead emails from CarGurus and AutoTrader will flow in automatically.
        </p>
      </div>
      <div style="text-align:center;margin-bottom:24px">
        <a href="${appUrl}/onboarding"
           style="display:inline-block;background:#F07018;color:#FFFFFF;font-weight:700;
                  font-size:15px;padding:14px 40px;border-radius:8px;text-decoration:none">
          Finish Setup
        </a>
      </div>
      <p style="margin:0;font-size:14px;color:#374151;line-height:1.7">
        If you ran into a problem or just have a question, reply here or send me a text.
        Happy to walk you through it.
      </p>
      ${sig(appUrl)}
      ${helpCta()}
    </div>
    ${footer(appUrl)}
  </td></tr>
</table>
</body>
</html>`
}

export function buildDaySevenFollowUpHtml(dealerName: string, appUrl: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:24px 16px">
  <tr><td>
    <div style="background:#0D2B55;border-radius:12px 12px 0 0;padding:24px 32px">
      <p style="margin:0;color:#F07018;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em">DealerWyze</p>
      <h1 style="margin:8px 0 0;color:#FFFFFF;font-size:20px;font-weight:700">Still here for you, ${dealerName}</h1>
    </div>
    <div style="background:#FFFFFF;padding:32px;border:1px solid #E2E8F0;border-top:none">
      <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7">
        It has been about a week since you signed up. Your account is ready and waiting whenever you are.
      </p>
      <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.7">
        If something got in the way or you have a question before you start, just reply to this email.
        I read every message personally and I am happy to jump on a quick call or text.
      </p>
      <div style="background:#FEF9F0;border:1px solid #FED7AA;border-radius:10px;padding:20px 24px;margin:0 0 28px">
        <p style="margin:0;font-size:14px;color:#92400E;line-height:1.7">
          Dealers who finish setup in their first week typically see their first inbound lead within 48 hours
          of connecting Gmail. The dealer who replies first usually wins the sale.
        </p>
      </div>
      <div style="text-align:center;margin-bottom:24px">
        <a href="${appUrl}/onboarding"
           style="display:inline-block;background:#F07018;color:#FFFFFF;font-weight:700;
                  font-size:15px;padding:14px 40px;border-radius:8px;text-decoration:none">
          Set Up My Account
        </a>
      </div>
      ${sig(appUrl)}
      ${helpCta()}
    </div>
    ${footer(appUrl)}
  </td></tr>
</table>
</body>
</html>`
}

// ── RealtyWyze follow-up sequence ─────────────────────────────────────────────

function reTip(num: string, title: string, body: string, link: string, linkText: string): string {
  return `
      <div style="margin-bottom:24px;padding-bottom:24px;border-bottom:1px solid #F1F5F9">
        <div style="display:flex;gap:12px;align-items:flex-start">
          <div style="background:#F07018;color:#fff;font-weight:700;font-size:14px;
                      min-width:28px;height:28px;border-radius:50%;display:flex;
                      align-items:center;justify-content:center;text-align:center;
                      line-height:28px;flex-shrink:0">${num}</div>
          <div>
            <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#0D2B55">${title}</p>
            <p style="margin:0 0 10px;font-size:13px;color:#374151;line-height:1.6">${body}</p>
            <a href="${link}" style="font-size:12px;color:#F07018;font-weight:600;text-decoration:none">${linkText} &rarr;</a>
          </div>
        </div>
      </div>`
}

export function buildReDayOneTipsEmailHtml(agentName: string, appUrl: string): string {
  const reUrl = appUrl.replace('dealerwyze.com', 'realtywyze.us')
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:24px 16px">
  <tr><td>
    <div style="background:#0D2B55;border-radius:12px 12px 0 0;padding:24px 32px">
      <p style="margin:0;color:#F07018;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em">RealtyWyze</p>
      <h1 style="margin:8px 0 0;color:#FFFFFF;font-size:20px;font-weight:700">3 things to do first, ${agentName}</h1>
    </div>
    <div style="background:#FFFFFF;padding:32px;border:1px solid #E2E8F0;border-top:none">
      ${reTip('1', 'Add your first listing',
        'Go to Listings and tap the + button to add a property. Fill in the address, beds, baths, and asking price. Your public listing page goes live the moment you save.',
        `${reUrl}/vehicles/new`, 'Add a Listing')}
      ${reTip('2', 'Connect Gmail to pull in inquiries automatically',
        'Go to Settings and connect your Gmail account. Every showing request and buyer inquiry that lands in your inbox will show up in RealtyWyze within 15 minutes.',
        `${reUrl}/settings`, 'Connect Gmail')}
      ${reTip('3', 'Check your Today page every morning',
        'Your Today page shows who is waiting for a reply, your upcoming showings, and your daily numbers. Make it your first stop each morning and you will not miss a prospect.',
        `${reUrl}/today`, 'Open Today')}

      <p style="margin:0;font-size:14px;color:#374151;line-height:1.7">
        Any questions, just reply here. I read everything personally.
      </p>

      ${sig(reUrl, 'real_estate')}
      ${helpCta()}
    </div>
    ${footer(reUrl, 'real_estate')}
  </td></tr>
</table>
</body>
</html>`
}

export function buildReDayThreeFollowUpHtml(agentName: string, appUrl: string): string {
  const reUrl = appUrl.replace('dealerwyze.com', 'realtywyze.us')
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:24px 16px">
  <tr><td>
    <div style="background:#0D2B55;border-radius:12px 12px 0 0;padding:24px 32px">
      <p style="margin:0;color:#F07018;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em">RealtyWyze</p>
      <h1 style="margin:8px 0 0;color:#FFFFFF;font-size:20px;font-weight:700">Hey ${agentName}, how is setup going?</h1>
    </div>
    <div style="background:#FFFFFF;padding:32px;border:1px solid #E2E8F0;border-top:none">
      <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7">
        You signed up a few days ago and I wanted to check in. Most agents finish setup in one sitting
        but life gets busy. No pressure.
      </p>
      <p style="margin:0 0 20px;color:#374151;font-size:15px;line-height:1.7">
        The two things that make the biggest difference on day one:
      </p>
      <div style="background:#F0F7FF;border-radius:10px;padding:20px 24px;margin:0 0 28px">
        <p style="margin:0 0 10px;font-size:14px;color:#1E293B">
          <span style="color:#F07018;font-weight:700;margin-right:8px">1.</span>
          <strong>Add your first listing.</strong> Even one property unlocks your public listing page.
        </p>
        <p style="margin:0;font-size:14px;color:#1E293B">
          <span style="color:#F07018;font-weight:700;margin-right:8px">2.</span>
          <strong>Connect Gmail.</strong> Inquiries from Zillow and Realtor.com will flow in automatically.
        </p>
      </div>
      <div style="text-align:center;margin-bottom:24px">
        <a href="${reUrl}/onboarding"
           style="display:inline-block;background:#F07018;color:#FFFFFF;font-weight:700;
                  font-size:15px;padding:14px 40px;border-radius:8px;text-decoration:none">
          Finish Setup
        </a>
      </div>
      <p style="margin:0;font-size:14px;color:#374151;line-height:1.7">
        If you ran into a problem or just have a question, reply here or send me a text.
        Happy to walk you through it.
      </p>
      ${sig(reUrl, 'real_estate')}
      ${helpCta()}
    </div>
    ${footer(reUrl, 'real_estate')}
  </td></tr>
</table>
</body>
</html>`
}

export function buildReDaySevenFollowUpHtml(agentName: string, appUrl: string): string {
  const reUrl = appUrl.replace('dealerwyze.com', 'realtywyze.us')
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:24px 16px">
  <tr><td>
    <div style="background:#0D2B55;border-radius:12px 12px 0 0;padding:24px 32px">
      <p style="margin:0;color:#F07018;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em">RealtyWyze</p>
      <h1 style="margin:8px 0 0;color:#FFFFFF;font-size:20px;font-weight:700">Still here for you, ${agentName}</h1>
    </div>
    <div style="background:#FFFFFF;padding:32px;border:1px solid #E2E8F0;border-top:none">
      <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.7">
        It has been about a week since you signed up. Your account is ready and waiting whenever you are.
      </p>
      <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.7">
        If something got in the way or you have a question before you start, just reply to this email.
        I read every message personally and I am happy to jump on a quick call or text.
      </p>
      <div style="background:#FEF9F0;border:1px solid #FED7AA;border-radius:10px;padding:20px 24px;margin:0 0 28px">
        <p style="margin:0;font-size:14px;color:#92400E;line-height:1.7">
          Agents who finish setup in their first week typically see their first inquiry within 48 hours
          of connecting Gmail. The agent who replies first usually wins the showing.
        </p>
      </div>
      <div style="text-align:center;margin-bottom:24px">
        <a href="${reUrl}/onboarding"
           style="display:inline-block;background:#F07018;color:#FFFFFF;font-weight:700;
                  font-size:15px;padding:14px 40px;border-radius:8px;text-decoration:none">
          Set Up My Account
        </a>
      </div>
      ${sig(reUrl, 'real_estate')}
      ${helpCta()}
    </div>
    ${footer(reUrl, 'real_estate')}
  </td></tr>
</table>
</body>
</html>`
}
