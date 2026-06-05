/**
 * Ensures org-wide and per-agent copies of the 15-email SaaS nurture sequence exist.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getSaasEmailNurtureSteps,
  SAAS_EMAIL_NURTURE_NAME,
  SAAS_EMAIL_NURTURE_SLUG,
  type NurtureEmailStep,
  type NurtureVertical,
} from '@/lib/sequences/saasEmailAutoresponderContent'

async function orgVertical(
  supabase: SupabaseClient,
  orgId: string,
): Promise<NurtureVertical> {
  const { data } = await supabase
    .from('organizations')
    .select('vertical')
    .eq('id', orgId)
    .maybeSingle()
  return data?.vertical === 'real_estate' ? 'real_estate' : 'dealer'
}

async function insertSequenceWithSteps(
  supabase: SupabaseClient,
  orgId: string,
  steps: NurtureEmailStep[],
  ownerUserId: string | null,
): Promise<string | null> {
  const { data: seq, error: seqErr } = await supabase
    .from('sequences')
    .insert({
      org_id: orgId,
      name: ownerUserId ? `${SAAS_EMAIL_NURTURE_NAME} (my copy)` : SAAS_EMAIL_NURTURE_NAME,
      channel: 'email',
      auto_mode: 'full_auto',
      topic: 'new_lead',
      slug: SAAS_EMAIL_NURTURE_SLUG,
      owner_user_id: ownerUserId,
    })
    .select('id')
    .single()

  if (seqErr || !seq) {
    console.error('[ensureSaasEmailAutoresponder] sequence insert:', seqErr?.message)
    return null
  }

  for (const step of steps) {
    const { data: tmpl } = await supabase
      .from('templates')
      .insert({
        user_id: orgId,
        name: step.template.name,
        subject: step.template.subject,
        body: step.template.body,
        category: 'sequence',
      })
      .select('id')
      .single()

    if (!tmpl) continue

    await supabase.from('sequence_steps').insert({
      sequence_id: seq.id,
      sort_order: step.sort_order,
      day_offset: step.day_offset,
      send_hour: step.send_hour,
      template_id: tmpl.id,
    })
  }

  return seq.id as string
}

async function cloneSequenceSteps(
  supabase: SupabaseClient,
  orgId: string,
  sourceSequenceId: string,
  targetSequenceId: string,
): Promise<void> {
  const { data: steps } = await supabase
    .from('sequence_steps')
    .select('sort_order, day_offset, send_hour, template:templates(id, name, subject, body)')
    .eq('sequence_id', sourceSequenceId)
    .order('sort_order', { ascending: true })

  for (const step of steps ?? []) {
    const rawTemplate = step.template
    const tmpl = (Array.isArray(rawTemplate) ? rawTemplate[0] : rawTemplate) as {
      name: string
      subject: string | null
      body: string
    } | null
    if (!tmpl) continue

    const { data: newTmpl } = await supabase
      .from('templates')
      .insert({
        user_id: orgId,
        name: tmpl.name,
        subject: tmpl.subject,
        body: tmpl.body,
        category: 'sequence',
      })
      .select('id')
      .single()

    if (!newTmpl) continue

    await supabase.from('sequence_steps').insert({
      sequence_id: targetSequenceId,
      sort_order: step.sort_order,
      day_offset: step.day_offset,
      send_hour: step.send_hour,
      template_id: newTmpl.id,
    })
  }
}

/** Org-wide default nurture (editable by admins). */
export async function ensureOrgSaasEmailAutoresponder(
  orgId: string,
  supabase: SupabaseClient,
  vertical?: NurtureVertical,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from('sequences')
    .select('id')
    .eq('org_id', orgId)
    .eq('slug', SAAS_EMAIL_NURTURE_SLUG)
    .is('owner_user_id', null)
    .maybeSingle()

  if (existing?.id) return existing.id as string

  const v = vertical ?? (await orgVertical(supabase, orgId))
  const steps = getSaasEmailNurtureSteps(v)
  const id = await insertSequenceWithSteps(supabase, orgId, steps, null)

  if (id) {
    await supabase
      .from('org_settings')
      .update({ auto_respond_email_sequence_id: id })
      .eq('org_id', orgId)
  }

  return id
}

/** Per-agent copy — cloned from org default when possible. */
export async function ensureAgentSaasEmailAutoresponder(
  orgId: string,
  ownerUserId: string,
  supabase: SupabaseClient,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from('sequences')
    .select('id')
    .eq('org_id', orgId)
    .eq('slug', SAAS_EMAIL_NURTURE_SLUG)
    .eq('owner_user_id', ownerUserId)
    .maybeSingle()

  if (existing?.id) return existing.id as string

  const orgSeqId = await ensureOrgSaasEmailAutoresponder(orgId, supabase)

  const { data: seq, error: seqErr } = await supabase
    .from('sequences')
    .insert({
      org_id: orgId,
      name: `${SAAS_EMAIL_NURTURE_NAME} (my copy)`,
      channel: 'email',
      auto_mode: 'full_auto',
      topic: 'new_lead',
      slug: SAAS_EMAIL_NURTURE_SLUG,
      owner_user_id: ownerUserId,
    })
    .select('id')
    .single()

  if (seqErr || !seq) return null

  if (orgSeqId) {
    await cloneSequenceSteps(supabase, orgId, orgSeqId, seq.id as string)
  } else {
    const v = await orgVertical(supabase, orgId)
    const steps = getSaasEmailNurtureSteps(v)
    for (const step of steps) {
      const { data: tmpl } = await supabase
        .from('templates')
        .insert({
          user_id: orgId,
          name: step.template.name,
          subject: step.template.subject,
          body: step.template.body,
          category: 'sequence',
        })
        .select('id')
        .single()
      if (tmpl) {
        await supabase.from('sequence_steps').insert({
          sequence_id: seq.id,
          sort_order: step.sort_order,
          day_offset: step.day_offset,
          send_hour: step.send_hour,
          template_id: tmpl.id,
        })
      }
    }
  }

  return seq.id as string
}

/** Pick sequence for new-lead auto-respond: assigned agent copy → org default → org_settings. */
export async function resolveAutorespondEmailSequenceId(
  supabase: SupabaseClient,
  orgId: string,
  assignedToUserId: string | null | undefined,
): Promise<string | null> {
  if (assignedToUserId) {
    const { data: agentSeq } = await supabase
      .from('sequences')
      .select('id')
      .eq('org_id', orgId)
      .eq('slug', SAAS_EMAIL_NURTURE_SLUG)
      .eq('owner_user_id', assignedToUserId)
      .maybeSingle()
    if (agentSeq?.id) return agentSeq.id as string
  }

  const { data: orgSeq } = await supabase
    .from('sequences')
    .select('id')
    .eq('org_id', orgId)
    .eq('slug', SAAS_EMAIL_NURTURE_SLUG)
    .is('owner_user_id', null)
    .maybeSingle()
  if (orgSeq?.id) return orgSeq.id as string

  const { data: settings } = await supabase
    .from('org_settings')
    .select('auto_respond_email_sequence_id')
    .eq('org_id', orgId)
    .maybeSingle()

  return (settings?.auto_respond_email_sequence_id as string | null) ?? null
}
