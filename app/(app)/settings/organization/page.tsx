'use client'

import { useVertical } from '@/hooks/useVertical'
import SettingsPageShell from '@/components/settings/SettingsPageShell'
import BasicInfoSection            from './sections/BasicInfoSection'
import PhoneSection                from './sections/PhoneSection'
import EmailLeadSyncSection        from './sections/EmailLeadSyncSection'
import VoiceAgentSection           from './sections/VoiceAgentSection'
import GoogleBusinessProfileSection from './sections/GoogleBusinessProfileSection'
import GoogleCalendarSection       from './sections/GoogleCalendarSection'
import EmailFromDomainSection      from './sections/EmailFromDomainSection'
import SocialPostingSection        from './sections/SocialPostingSection'
import BhphPaymentMethodsSection   from './sections/BhphPaymentMethodsSection'
import AuctionSyncSection          from './sections/AuctionSyncSection'
import DataExportSection           from './sections/DataExportSection'
import DangerZoneSection           from './sections/DangerZoneSection'

export default function OrganizationSettingsPage() {
  const { vertical } = useVertical()
  const isRE = vertical === 'real_estate'

  return (
    <SettingsPageShell
      title="Organization"
      description="Business profile, intake channels, integrations, and advanced controls."
      type="form"
    >
      <div className="space-y-4">
        <BasicInfoSection isRE={isRE} />
        <PhoneSection />
        {/* BHPH payment reminders are dealer-only */}
        {!isRE && <BhphPaymentMethodsSection />}
        {/* Auction sync is dealer-only */}
        {!isRE && <AuctionSyncSection />}
        <EmailLeadSyncSection isRE={isRE} />
        <VoiceAgentSection isRE={isRE} />
        <GoogleBusinessProfileSection />
        <GoogleCalendarSection />
        <EmailFromDomainSection />
        <SocialPostingSection isRE={isRE} />
        <DataExportSection isRE={isRE} />
        <DangerZoneSection isRE={isRE} />
      </div>
    </SettingsPageShell>
  )
}
