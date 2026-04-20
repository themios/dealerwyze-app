/**
 * seedStarterSequences
 *
 * Creates the 3 default starter campaigns for a new org.
 * Safe to call multiple times — skips silently if org already has sequences.
 *
 * Used by:
 *  - POST /api/sequences/seed-starters  (manual "Load starter campaigns" button)
 *  - POST /api/onboarding/step { complete: true }  (auto-seeds on onboarding finish)
 */

import { createServiceClient } from '@/lib/supabase/service'

const STARTERS = [
  {
    name:      'New Lead - Email Follow-up (5 steps)',
    channel:   'email' as const,
    auto_mode: 'full_auto' as const,
    topic:     'new_lead',
    steps: [
      {
        sort_order: 0, day_offset: 0, send_hour: 9,
        template: {
          name:    'Day 1 - Thank You for Reaching Out',
          subject: 'Thanks for your inquiry',
          body:    `Hi {firstName},

Thank you for reaching out! I'd love to help you find the right vehicle.

Could you let me know a good time to connect, or feel free to reply to this email with any questions?

Looking forward to hearing from you.`,
        },
      },
      {
        sort_order: 1, day_offset: 2, send_hour: 10,
        template: {
          name:    'Day 3 - Following Up',
          subject: 'Following up on your inquiry',
          body:    `Hi {firstName},

I wanted to follow up on your recent inquiry. Do you have any questions I can answer about the vehicle or our inventory?

I'm here to help make this as easy as possible for you.`,
        },
      },
      {
        sort_order: 2, day_offset: 5, send_hour: 9,
        template: {
          name:    'Day 6 - Financing Options',
          subject: 'Financing options available',
          body:    `Hi {firstName},

I wanted to make sure you knew about the financing options we have available. We work with multiple lenders to get you the best rate possible.

Would you like me to run a quick pre-approval? It only takes a few minutes and won't affect your credit score.`,
        },
      },
      {
        sort_order: 3, day_offset: 10, send_hour: 10,
        template: {
          name:    'Day 11 - Schedule a Test Drive',
          subject: 'Schedule a test drive this week?',
          body:    `Hi {firstName},

Are you available this week for a test drive? I'd love to get you behind the wheel so you can experience the vehicle firsthand.

Let me know what day and time works best for you.`,
        },
      },
      {
        sort_order: 4, day_offset: 21, send_hour: 9,
        template: {
          name:    'Day 22 - Still Looking?',
          subject: 'Still looking for a vehicle?',
          body:    `Hi {firstName},

I wanted to check in one more time. We have new inventory arriving regularly, and I'd love to help you find exactly what you're looking for.

If your needs have changed or you've already found something, no worries at all - just let me know!`,
        },
      },
    ],
  },
  {
    name:      'New Lead - SMS Follow-up (3 steps)',
    channel:   'sms' as const,
    auto_mode: 'full_auto' as const,
    topic:     'new_lead',
    steps: [
      {
        sort_order: 0, day_offset: 0, send_hour: 9,
        template: {
          name:    'SMS Day 1 - Quick Reply',
          subject: '',
          body:    `Hi {firstName}, this is {dealerName}. You inquired about a vehicle - happy to answer any questions. Just text back!`,
        },
      },
      {
        sort_order: 1, day_offset: 2, send_hour: 10,
        template: {
          name:    'SMS Day 3 - Follow-up',
          subject: '',
          body:    `Hi {firstName}, following up on your inquiry. Any questions I can answer? We're here to help!`,
        },
      },
      {
        sort_order: 2, day_offset: 5, send_hour: 9,
        template: {
          name:    'SMS Day 6 - Last Check-in',
          subject: '',
          body:    `Hi {firstName}, last check-in from {dealerName}. Great vehicles and flexible financing available. Let me know if you'd like more info!`,
        },
      },
    ],
  },
  {
    name:      'Lost Lead Re-engagement (Email)',
    channel:   'email' as const,
    auto_mode: 'full_auto' as const,
    topic:     're_inquiry',
    steps: [
      {
        sort_order: 0, day_offset: 0, send_hour: 10,
        template: {
          name:    'Re-engage Day 1 - Checking In',
          subject: 'Checking in - still in the market?',
          body:    `Hi {firstName},

I wanted to reach out and see if you're still in the market for a vehicle. A lot can change, and I'd love to help if the timing is better now.

We've also got some new inventory that might be a great fit. Would you like me to send over some options?`,
        },
      },
      {
        sort_order: 1, day_offset: 7, send_hour: 10,
        template: {
          name:    'Re-engage Day 8 - New Inventory',
          subject: 'New vehicles just arrived',
          body:    `Hi {firstName},

Just a heads up - we have new vehicles that just came in that might be exactly what you were looking for.

No pressure at all. If now isn't the right time, I completely understand. But if you'd like to take a look, I'm happy to set something up.`,
        },
      },
      {
        sort_order: 2, day_offset: 14, send_hour: 9,
        template: {
          name:    'Re-engage Day 15 - Last Follow-up',
          subject: 'One last thing before I close your file',
          body:    `Hi {firstName},

This will be my last follow-up - I don't want to fill up your inbox!

If you're ever ready to start looking again, please don't hesitate to reach out. I'll make sure you get our best pricing and a smooth, no-hassle experience.

Wishing you the best!`,
        },
      },
    ],
  },
]

/**
 * Returns the number of sequences created, or 0 if org already had sequences.
 * Never throws.
 */
export async function seedStarterSequences(orgId: string): Promise<number> {
  try {
    const supabase = createServiceClient()

    // Skip if org already has sequences
    const { count } = await supabase
      .from('sequences')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)

    if ((count ?? 0) > 0) return 0

    let created = 0

    for (const starter of STARTERS) {
      const { data: seq, error: seqErr } = await supabase
        .from('sequences')
        .insert({
          org_id:    orgId,
          name:      starter.name,
          channel:   starter.channel,
          auto_mode: starter.auto_mode,
          topic:     starter.topic,
        })
        .select('id')
        .single()

      if (seqErr || !seq) continue

      for (const step of starter.steps) {
        const { data: tmpl } = await supabase
          .from('templates')
          .insert({
            user_id:  orgId,
            name:     step.template.name,
            subject:  step.template.subject || null,
            body:     step.template.body,
            category: 'sequence',
          })
          .select('id')
          .single()

        if (!tmpl) continue

        await supabase.from('sequence_steps').insert({
          sequence_id: seq.id,
          sort_order:  step.sort_order,
          day_offset:  step.day_offset,
          send_hour:   step.send_hour,
          template_id: tmpl.id,
        })
      }

      created++
    }

    return created
  } catch (err) {
    console.error('[seedStarterSequences] error:', err)
    return 0
  }
}
