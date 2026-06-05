/**
 * Platform-default 15-touch email nurture — one message every 2 days (days 0–28).
 * Cloned per org and per agent; each copy is editable in Settings → Sequences.
 */

export const SAAS_EMAIL_NURTURE_SLUG = 'saas_email_nurture'
export const SAAS_EMAIL_NURTURE_NAME = 'New Lead — 15-Email Nurture (every 2 days)'

export type NurtureVertical = 'dealer' | 'real_estate'

export interface NurtureEmailStep {
  sort_order: number
  day_offset: number
  send_hour: number
  template: { name: string; subject: string; body: string }
}

const SEND_HOUR = 9

function stepsFor(
  vertical: NurtureVertical,
  emails: { name: string; subject: string; body: string }[],
): NurtureEmailStep[] {
  return emails.map((template, i) => ({
    sort_order: i,
    day_offset: i * 2,
    send_hour: SEND_HOUR,
    template,
  }))
}

const DEALER_EMAILS: { name: string; subject: string; body: string }[] = [
  {
    name: 'Day 1 — Thank you',
    subject: 'Thanks for reaching out',
    body: `Hi {firstName},

Thank you for contacting {dealerName}. I received your inquiry and I am here to help you find the right vehicle.

Reply to this email with any questions, or let me know a good time for a quick call.

{agentName}`,
  },
  {
    name: 'Day 3 — How can I help?',
    subject: 'Quick question about what you need',
    body: `Hi {firstName},

I wanted to follow up and learn a bit more about what you are looking for — budget range, must-haves, and timing.

That helps me send options that actually fit instead of a generic list.

{agentName}
{dealerName}`,
  },
  {
    name: 'Day 5 — Inventory match',
    subject: 'A few vehicles that may fit',
    body: `Hi {firstName},

Based on your inquiry, I can pull a short list of vehicles on our lot that match what you described.

Would you like me to email links and photos, or set up a time to see them in person?

{agentName}`,
  },
  {
    name: 'Day 7 — Financing',
    subject: 'Financing options (no pressure)',
    body: `Hi {firstName},

Many buyers ask about monthly payment and approval. We work with several lenders and can often get a pre-approval without hurting your credit score.

If you want, I can walk you through the steps — no obligation.

{agentName}`,
  },
  {
    name: 'Day 9 — Trade-in',
    subject: 'Do you have a trade-in?',
    body: `Hi {firstName},

If you have a vehicle to trade, send the year, make, model, mileage, and condition (or a few photos). I can get you a ballpark before you visit.

{agentName}
{dealerName}`,
  },
  {
    name: 'Day 11 — Test drive',
    subject: 'Schedule a test drive?',
    body: `Hi {firstName},

The best way to know if a vehicle is right is to drive it. I can reserve a time that works for you — weekdays or weekends.

What day tends to work best?

{agentName}`,
  },
  {
    name: 'Day 13 — Still researching?',
    subject: 'Still shopping?',
    body: `Hi {firstName},

No rush — buying a car is a big decision. If you are still comparing options, I am happy to answer questions about reliability, cost of ownership, or warranty.

Just reply when convenient.

{agentName}`,
  },
  {
    name: 'Day 15 — New arrivals',
    subject: 'New inventory this week',
    body: `Hi {firstName},

We added new inventory recently. If your first choice sold or your needs changed, tell me what you want now and I will check what just arrived.

{agentName}
{dealerName}`,
  },
  {
    name: 'Day 17 — Process overview',
    subject: 'What happens when you are ready to buy',
    body: `Hi {firstName},

When you find the right vehicle, the process is usually: test drive → quick paperwork → drive home (or schedule delivery). Most visits take about an hour if you have your license and insurance info.

I can explain each step when you are ready.

{agentName}`,
  },
  {
    name: 'Day 19 — Objections welcome',
    subject: 'Any concerns I can address?',
    body: `Hi {firstName},

Common questions I hear: out-the-door price, history report, and what is included in the price. Ask anything — transparent answers build trust.

{agentName}`,
  },
  {
    name: 'Day 21 — Gentle check-in',
    subject: 'Checking in',
    body: `Hi {firstName},

I have not heard back in a little while — totally fine if timing changed. If you are still in the market, I would like to help. If not, a quick "not now" saves us both inbox space.

{agentName}`,
  },
  {
    name: 'Day 23 — Social proof',
    subject: 'Happy to share references',
    body: `Hi {firstName},

If it helps, I can point you to recent reviews or customers who bought something similar. We focus on a straightforward, no-surprise experience.

{agentName}
{dealerName}`,
  },
  {
    name: 'Day 25 — Urgency (soft)',
    subject: 'Popular units move quickly',
    body: `Hi {firstName},

Just a heads-up: vehicles in your range often sell within a few days. If something specific caught your eye, I can hold it briefly while you decide.

{agentName}`,
  },
  {
    name: 'Day 27 — Open door',
    subject: 'Anything blocking you?',
    body: `Hi {firstName},

Is there anything holding you back — payment, trade value, distance, or timing? Often one conversation clears it up.

{agentName}`,
  },
  {
    name: 'Day 29 — Final follow-up',
    subject: 'Last check-in from me',
    body: `Hi {firstName},

This will be my last automated follow-up so I do not crowd your inbox. If you need a vehicle later, save this email and reach out anytime.

Wishing you the best,
{agentName}
{dealerName}`,
  },
]

const REAL_ESTATE_EMAILS: { name: string; subject: string; body: string }[] = [
  {
    name: 'Day 1 — Thank you',
    subject: 'Thanks for your inquiry',
    body: `Hi {firstName},

Thank you for reaching out to {dealerName}. I received your message and would love to help with your home search or sale.

Feel free to reply with questions or a good time to talk.

{agentName}`,
  },
  {
    name: 'Day 3 — Goals',
    subject: 'What are you looking for?',
    body: `Hi {firstName},

To point you in the right direction: are you buying, selling, or both? Preferred areas, price range, and move-in timing all help me tailor options.

{agentName}`,
  },
  {
    name: 'Day 5 — Search help',
    subject: 'I can narrow your search',
    body: `Hi {firstName},

I can set up saved searches and send listings that match your criteria — beds, baths, schools, commute, and must-haves.

What is your top priority right now?

{agentName}`,
  },
  {
    name: 'Day 7 — Pre-approval',
    subject: 'Financing / pre-approval',
    body: `Hi {firstName},

If you are buying, a lender pre-approval clarifies budget and strengthens offers. I can recommend local lenders or you can use your own — your choice.

{agentName}`,
  },
  {
    name: 'Day 9 — Virtual tour',
    subject: 'Photos or a quick video walkthrough?',
    body: `Hi {firstName},

Before you drive across town, I can send detailed photos or arrange a video tour of properties that fit.

Interested in any addresses you have seen so far?

{agentName}`,
  },
  {
    name: 'Day 11 — Neighborhood',
    subject: 'Neighborhood questions welcome',
    body: `Hi {firstName},

I am happy to share context on schools, commute, HOA, and typical days on market for areas you are considering — without hype, just facts.

{agentName}
{dealerName}`,
  },
  {
    name: 'Day 13 — Showing',
    subject: 'Schedule a showing?',
    body: `Hi {firstName},

When you are ready, I can coordinate showings around your schedule. Weekday evenings and weekends both work.

What times usually work for you?

{agentName}`,
  },
  {
    name: 'Day 15 — Similar homes',
    subject: 'Similar listings you may like',
    body: `Hi {firstName},

The market moves — I can send a fresh batch of similar homes if your first picks are pending or sold.

Reply with any must-haves I should filter on.

{agentName}`,
  },
  {
    name: 'Day 17 — Buyer representation',
    subject: 'How I work with buyers',
    body: `Hi {firstName},

As your agent, my job is to advocate for you — pricing, inspections, timelines, and paperwork. You can ask anything about the process; no obligation to tour until you are ready.

{agentName}`,
  },
  {
    name: 'Day 19 — Timeline',
    subject: 'What is your timeline?',
    body: `Hi {firstName},

Are you hoping to move in 30, 60, or 90+ days? That affects which listings and offer strategies make sense.

A quick reply helps me prioritize what I send you.

{agentName}`,
  },
  {
    name: 'Day 21 — Offer process',
    subject: 'From offer to keys',
    body: `Hi {firstName},

When you find the right home, typical steps are: offer → inspection → appraisal → closing. I will guide each step and keep you updated.

Happy to explain over a short call if useful.

{agentName}`,
  },
  {
    name: 'Day 23 — Check-in',
    subject: 'Still in the market?',
    body: `Hi {firstName},

I have not heard back recently — if plans changed, no problem. If you are still looking, tell me what shifted (budget, area, or property type) and I will adjust.

{agentName}`,
  },
  {
    name: 'Day 25 — Market note',
    subject: 'Quick market update',
    body: `Hi {firstName},

Inventory and pricing shift weekly in our area. I can send a brief snapshot for your target ZIPs if that helps your decision.

{agentName}
{dealerName}`,
  },
  {
    name: 'Day 27 — Blockers',
    subject: 'Anything I can clarify?',
    body: `Hi {firstName},

Sometimes buyers pause over rates, competition, or lease timing. If something is unclear, reply here — one email often unlocks the next step.

{agentName}`,
  },
  {
    name: 'Day 29 — Final follow-up',
    subject: 'Last automated note from me',
    body: `Hi {firstName},

This is my last scheduled follow-up so I respect your inbox. When you are ready to buy or sell, reply anytime and I will pick up personally.

Best,
{agentName}
{dealerName}`,
  },
]

export function getSaasEmailNurtureSteps(vertical: NurtureVertical): NurtureEmailStep[] {
  return stepsFor(vertical, vertical === 'real_estate' ? REAL_ESTATE_EMAILS : DEALER_EMAILS)
}
