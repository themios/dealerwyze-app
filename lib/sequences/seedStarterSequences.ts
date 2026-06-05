/**
 * seedStarterSequences
 *
 * Creates the 3 default starter campaigns for a new org.
 * Safe to call multiple times — skips silently if org already has sequences.
 *
 * Uses an RLS-scoped Supabase client from the caller (e.g. createClient() in API routes).
 * Do not pass the service-role client here.
 *
 * Used by:
 *  - POST /api/sequences/seed-starters  (manual "Load starter campaigns" button)
 *  - POST /api/onboarding/step { complete: true }  (auto-seeds on onboarding finish)
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { ensureOrgSaasEmailAutoresponder } from '@/lib/sequences/ensureSaasEmailAutoresponder'

const STARTERS = [
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
export async function seedStarterSequences(
  orgId: string,
  supabase: SupabaseClient,
): Promise<number> {
  try {
    let created = 0

    // Always ensure platform 15-email nurture exists (org-wide, every 2 days)
    const nurtureId = await ensureOrgSaasEmailAutoresponder(orgId, supabase)
    if (nurtureId) created++

    const { count } = await supabase
      .from('sequences')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .neq('slug', 'saas_email_nurture')

    if ((count ?? 0) > 0) return created

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
