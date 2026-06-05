import { headers } from 'next/headers'
import { requireProfile } from '@/lib/auth/profile'
import {
  ensureAgentSaasEmailAutoresponder,
  ensureOrgSaasEmailAutoresponder,
} from '@/lib/sequences/ensureSaasEmailAutoresponder'
import { createClientForRequest } from '@/lib/supabase/forRequest'
import AutomationClient from './AutomationClient'
import TemplatesClient from '../TemplatesClient'
import SettingsPageShell from '@/components/settings/SettingsPageShell'

export default async function AutomationSettingsPage() {
  const hdrs = await headers()
  const isRe = hdrs.get('x-vertical') === 'real_estate'
  const profile = await requireProfile()
  const supabase = await createClientForRequest()

  await ensureOrgSaasEmailAutoresponder(profile.org_id, supabase)
  const agentNurtureId = await ensureAgentSaasEmailAutoresponder(
    profile.org_id,
    profile.id,
    supabase,
  )

  const [{ data: autoSettings }, { data: templates }, { data: sequences }] = await Promise.all([
    supabase
      .from('org_settings')
      .select('automation_mode, lead_response_sla_minutes, followup_delay_hours, followup_next_day_hour, email_automation_mode, email_followup_delay_hours, email_followup_next_day_hour, email_signature, sms_consent_message, auto_respond_email_sequence_id, auto_respond_sms_sequence_id')
      .eq('org_id', profile.org_id)
      .maybeSingle(),
    supabase
      .from('templates')
      .select('*')
      .eq('user_id', profile.org_id)
      .order('created_at', { ascending: true }),
    supabase
      .from('sequences')
      .select('id, name, channel, topic, sequence_steps(count)')
      .eq('org_id', profile.org_id)
      .order('created_at', { ascending: true }),
  ])

  type AutoMode = 'manual' | 'semi_auto' | 'full_auto'
  const initial = {
    automation_mode:                   (autoSettings?.automation_mode              ?? 'manual') as AutoMode,
    lead_response_sla_minutes:         autoSettings?.lead_response_sla_minutes    ?? 10,
    followup_delay_hours:              autoSettings?.followup_delay_hours         ?? 2,
    followup_next_day_hour:            autoSettings?.followup_next_day_hour       ?? 10,
    email_automation_mode:             (autoSettings?.email_automation_mode        ?? 'manual') as AutoMode,
    email_followup_delay_hours:        autoSettings?.email_followup_delay_hours   ?? 4,
    email_followup_next_day_hour:      autoSettings?.email_followup_next_day_hour ?? 10,
    email_signature:                   autoSettings?.email_signature              ?? '',
    sms_consent_message:               autoSettings?.sms_consent_message          ?? '',
    auto_respond_email_sequence_id:    autoSettings?.auto_respond_email_sequence_id ?? null,
    auto_respond_sms_sequence_id:      autoSettings?.auto_respond_sms_sequence_id   ?? null,
  }

  return (
    <SettingsPageShell
      title="Automation & Timings"
      description="Lead response timing, autoresponder behavior, and shared message templates."
      type="form"
    >
      <div className="space-y-8">

        <AutomationClient
          initial={initial}
          sequences={sequences ?? []}
          isRe={isRe}
          myEmailNurtureSequenceId={agentNurtureId}
        />

        <section className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Templates</p>
          <p className="text-xs text-muted-foreground">
            Variables:{' '}
            <code className="bg-muted px-1 rounded">{'{firstName}'}</code>{' '}
            <code className="bg-muted px-1 rounded">{isRe ? '{property}' : '{vehicle}'}</code>{' '}
            <code className="bg-muted px-1 rounded">{'{price}'}</code>{' '}
            <code className="bg-muted px-1 rounded">{isRe ? '{agencyName}' : '{dealerName}'}</code>{' '}
            <code className="bg-muted px-1 rounded">{isRe ? '{agencyPhone}' : '{dealerPhone}'}</code>{' '}
            <code className="bg-muted px-1 rounded">{'{link}'}</code>
          </p>
          <TemplatesClient templates={templates || []} userId={profile.org_id} channel="sms" />
          <TemplatesClient templates={templates || []} userId={profile.org_id} channel="email" />
        </section>

      </div>
    </SettingsPageShell>
  )
}
