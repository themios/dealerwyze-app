import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * POST /api/sequences/seed-starters
 * Creates default starter campaigns (sequences + templates + steps) for the org.
 * Safe to call multiple times — skips if org already has sequences.
 */

const STARTERS = [
  {
    name:      'New Lead - Email Follow-up (5 steps)',
    channel:   'email' as const,
    auto_mode: 'full_auto' as const,
    steps: [
      {
        sort_order: 0, day_offset: 0, send_hour: 9,
        template: {
          name:    'Day 1 - Thank You for Reaching Out',
          subject: 'Thanks for your inquiry',
          body:    `Hi {customer_name},

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
          body:    `Hi {customer_name},

I wanted to follow up on your recent inquiry. Do you have any questions I can answer about the vehicle or our inventory?

I'm here to help make this as easy as possible for you.`,
        },
      },
      {
        sort_order: 2, day_offset: 5, send_hour: 9,
        template: {
          name:    'Day 6 - Financing Options',
          subject: 'Financing options available',
          body:    `Hi {customer_name},

I wanted to make sure you knew about the financing options we have available. We work with multiple lenders to get you the best rate possible.

Would you like me to run a quick pre-approval? It only takes a few minutes and won't affect your credit score.`,
        },
      },
      {
        sort_order: 3, day_offset: 10, send_hour: 10,
        template: {
          name:    'Day 11 - Schedule a Test Drive',
          subject: 'Schedule a test drive this week?',
          body:    `Hi {customer_name},

Are you available this week for a test drive? I'd love to get you behind the wheel so you can experience the vehicle firsthand.

Let me know what day and time works best for you.`,
        },
      },
      {
        sort_order: 4, day_offset: 21, send_hour: 9,
        template: {
          name:    'Day 22 - Still Looking?',
          subject: 'Still looking for a vehicle?',
          body:    `Hi {customer_name},

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
    steps: [
      {
        sort_order: 0, day_offset: 0, send_hour: 9,
        template: {
          name:    'SMS Day 1 - Quick Reply',
          subject: '',
          body:    `Hi {customer_name}, this is your dealer replying to your inquiry. Still interested? Happy to answer any questions - just text back!`,
        },
      },
      {
        sort_order: 1, day_offset: 2, send_hour: 10,
        template: {
          name:    'SMS Day 3 - Follow-up',
          subject: '',
          body:    `Hi {customer_name}, just following up on your inquiry. Do you have any questions I can answer? We're here to help!`,
        },
      },
      {
        sort_order: 2, day_offset: 5, send_hour: 9,
        template: {
          name:    'SMS Day 6 - Last Check-in',
          subject: '',
          body:    `Hi {customer_name}, last check-in from us. We have great vehicles available and flexible financing. Let me know if you'd like more info!`,
        },
      },
    ],
  },
  {
    name:      'Lost Lead Re-engagement (Email)',
    channel:   'email' as const,
    auto_mode: 'full_auto' as const,
    steps: [
      {
        sort_order: 0, day_offset: 0, send_hour: 10,
        template: {
          name:    'Re-engage Day 1 - Checking In',
          subject: 'Checking in - still in the market?',
          body:    `Hi {customer_name},

I wanted to reach out and see if you're still in the market for a vehicle. A lot can change, and I'd love to help if the timing is better now.

We've also got some new inventory that might be a great fit. Would you like me to send over some options?`,
        },
      },
      {
        sort_order: 1, day_offset: 7, send_hour: 10,
        template: {
          name:    'Re-engage Day 8 - New Inventory',
          subject: 'New vehicles just arrived',
          body:    `Hi {customer_name},

Just a heads up - we have new vehicles that just came in that might be exactly what you were looking for.

No pressure at all. If now isn't the right time, I completely understand. But if you'd like to take a look, I'm happy to set something up.`,
        },
      },
      {
        sort_order: 2, day_offset: 14, send_hour: 9,
        template: {
          name:    'Re-engage Day 15 - Special Offer',
          subject: 'One last thing before I close your file',
          body:    `Hi {customer_name},

This will be my last follow-up - I don't want to fill up your inbox!

If you're ever ready to start looking again, please don't hesitate to reach out. I'll make sure you get our best pricing and a smooth, no-hassle experience.

Wishing you the best!`,
        },
      },
    ],
  },
]

export async function POST() {
  const profile = await requireProfile()
  const service = createServiceClient()

  // Check if org already has sequences — don't double-seed
  const { count } = await service
    .from('sequences')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', profile.org_id)

  if ((count ?? 0) > 0) {
    return NextResponse.json({ error: 'Your account already has sequences. Add new ones from the sequences page.' }, { status: 422 })
  }

  let created = 0

  for (const starter of STARTERS) {
    // Create sequence
    const { data: seq, error: seqErr } = await service
      .from('sequences')
      .insert({ org_id: profile.org_id, name: starter.name, channel: starter.channel, auto_mode: starter.auto_mode })
      .select('id')
      .single()

    if (seqErr || !seq) continue

    // Create steps with templates
    for (const step of starter.steps) {
      const { data: tmpl } = await service
        .from('templates')
        .insert({
          user_id:  profile.org_id,
          name:     step.template.name,
          subject:  step.template.subject || null,
          body:     step.template.body,
          category: 'sequence',
        })
        .select('id')
        .single()

      if (!tmpl) continue

      await service.from('sequence_steps').insert({
        sequence_id:  seq.id,
        sort_order:   step.sort_order,
        day_offset:   step.day_offset,
        send_hour:    step.send_hour,
        template_id:  tmpl.id,
      })
    }

    created++
  }

  return NextResponse.json({ ok: true, created })
}
