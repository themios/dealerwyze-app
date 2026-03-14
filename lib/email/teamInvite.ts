export function buildTeamInviteEmailHtml(recipientName: string, appUrl: string): string {
  const safeName = recipientName || 'Your sales cockpit is ready'
  const inviteLink = `${appUrl}/login`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>You've been invited to DealerWyze</title>
</head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;padding:24px 16px">
    <tr>
      <td>
        <div style="background:#0D2B55;border-radius:12px 12px 0 0;padding:24px 28px">
          <p style="margin:0;color:#FBBF24;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em">
            DealerWyze Invitation
          </p>
          <h1 style="margin:8px 0 4px;color:#FFFFFF;font-size:20px;font-weight:700;line-height:1.3">
            Your sales cockpit is ready, ${safeName}.
          </h1>
          <p style="margin:6px 0 0;color:#E2E8F0;font-size:14px;line-height:1.7;max-width:520px">
            You&apos;ve been invited to join <span style="font-weight:600;">DealerWyze</span> — the lead and communication hub
            your dealership is using to keep deals, follow-ups, and conversations under control.
          </p>
        </div>

        <div style="background:#FFFFFF;padding:24px 28px 22px;border:1px solid #E2E8F0;border-top:none;border-radius:0 0 12px 12px">
          <!-- Core pitch -->
          <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.08em;color:#0F172A;text-transform:uppercase;">
            Why this matters for you
          </p>
          <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#374151;">
            DealerWyze is built to do one thing extremely well:
            <span style="font-weight:600;color:#0D2B55;"> help you close more deals with less chaos.</span>
            It pulls every lead and every conversation into one place, so nothing slips and every opportunity gets a clean next step.
          </p>

          <!-- Three-column benefits -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px">
            <tr>
              <td width="33%" style="padding:4px 4px 8px;">
                <div style="background:#ECFEF3;border-radius:8px;padding:10px 11px;border:1px solid #BBF7D0;">
                  <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.08em;color:#15803D;text-transform:uppercase;">
                    More Sales
                  </p>
                  <p style="margin:0;font-size:12px;line-height:1.6;color:#14532D;">
                    See every hot lead in one list, with the next action clearly marked so you always know who to call, text, or email next.
                  </p>
                </div>
              </td>
              <td width="33%" style="padding:4px 4px 8px;">
                <div style="background:#EEF2FF;border-radius:8px;padding:10px 11px;border:1px solid #C7D2FE;">
                  <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.08em;color:#312E81;text-transform:uppercase;">
                    Total Visibility
                  </p>
                  <p style="margin:0;font-size:12px;line-height:1.6;color:#1E293B;">
                    Every email, text, and note with a customer is tracked automatically — no more digging through inboxes or asking who talked to this lead last.
                  </p>
                </div>
              </td>
              <td width="33%" style="padding:4px 4px 8px;">
                <div style="background:#FEF9C3;border-radius:8px;padding:10px 11px;border:1px solid #FACC15;">
                  <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:0.08em;color:#854D0E;text-transform:uppercase;">
                    Less Stress
                  </p>
                  <p style="margin:0;font-size:12px;line-height:1.6;color:#713F12;">
                    Start your day with a clean Today list — who is waiting, who is hot, and what is overdue — so you can stay in control instead of putting out fires.
                  </p>
                </div>
              </td>
            </tr>
          </table>

          <!-- What they'll do inside DealerWyze -->
          <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:0.08em;color:#0F172A;text-transform:uppercase;">
            What you&apos;ll be able to do inside DealerWyze
          </p>
          <ul style="margin:0 0 14px 18px;padding:0;color:#374151;font-size:13px;line-height:1.7;">
            <li style="margin-bottom:4px;">
              See <span style="font-weight:600;">every lead from every source</span> (CarGurus, AutoTrader, website, Facebook, phone, walk-ins) in one inbox.
            </li>
            <li style="margin-bottom:4px;">
              <span style="font-weight:600;">Call, text, and email</span> directly from the same screen — with full history attached to each customer.
            </li>
            <li style="margin-bottom:4px;">
              Get a <span style="font-weight:600;">simple Today view</span> of who is waiting on you, so you can protect every opportunity without living in spreadsheets.
            </li>
            <li style="margin-bottom:4px;">
              Track replies automatically, so you know <span style="font-weight:600;">who is actually engaging</span> and who needs a different approach.
            </li>
            <li style="margin-bottom:4px;">
              Give your manager a clear view of your pipeline, so <span style="font-weight:600;">your work is visible and your wins are obvious</span>.
            </li>
          </ul>

          <!-- Emotional hook -->
          <div style="background:#EFF6FF;border-radius:8px;padding:10px 12px;border:1px solid #BFDBFE;margin:0 0 14px;">
            <p style="margin:0;font-size:13px;line-height:1.7;color:#1E3A8A;">
              Your dealership chose DealerWyze because they want a <span style="font-weight:600;">tighter, more professional follow-up game</span>.
              When you run your day from DealerWyze, you are not just closing more deals — you are showing up as the kind of salesperson
              <span style="font-weight:600;">owners trust with their best opportunities.</span>
            </p>
          </div>

          <!-- CTA -->
          <p style="margin:0 0 8px;font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#6B7280;">
            Get started
          </p>
          <p style="margin:0 0 14px;font-size:13px;line-height:1.7;color:#374151;">
            Click the button below to create your password and activate your DealerWyze account. It takes about 60 seconds.
          </p>
          <table cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px;">
            <tr>
              <td>
                <a href="${inviteLink}" 
                   style="display:inline-block;background:#F07018;color:#FFFFFF;font-weight:700;font-size:14px;line-height:1.2;text-decoration:none;padding:11px 26px;border-radius:999px;border:1px solid #EA580C;">
                  Activate my DealerWyze login
                </a>
              </td>
            </tr>
          </table>
          <p style="margin:0;font-size:11px;line-height:1.6;color:#6B7280;">
            Or copy and paste this link into your browser:<br />
            <span style="color:#0F172A;font-family:monospace;font-size:11px;word-break:break-all;">${inviteLink}</span>
          </p>

          <!-- Footer -->
          <div style="border-top:1px solid #E5E7EB;padding-top:10px;margin-top:14px">
            <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#0F172A;">
              DealerWyze
            </p>
            <p style="margin:0 0 4px;font-size:11px;color:#6B7280;line-height:1.6;">
              One place for your leads, follow-ups, and customer conversations — so your team can sell more without burning out.
            </p>
            <p style="margin:0;font-size:11px;color:#9CA3AF;">
              If you were not expecting this invite, you can safely ignore this email.
            </p>
          </div>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`
}

