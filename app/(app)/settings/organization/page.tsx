import TopBar from '@/components/layout/TopBar'
import BasicInfoSection            from './sections/BasicInfoSection'
import PhoneSection                from './sections/PhoneSection'
import EmailLeadSyncSection        from './sections/EmailLeadSyncSection'
import VoiceAgentSection           from './sections/VoiceAgentSection'
import GoogleBusinessProfileSection from './sections/GoogleBusinessProfileSection'
import GoogleCalendarSection       from './sections/GoogleCalendarSection'
import LocationsSection            from './sections/LocationsSection'
import EmailFromDomainSection      from './sections/EmailFromDomainSection'
import DangerZoneSection           from './sections/DangerZoneSection'

export default function OrganizationSettingsPage() {
  return (
    <div className="flex flex-col h-screen">
      <TopBar title="Organization" />
      <div className="flex-1 overflow-y-auto px-0 py-0 space-y-0">
        <BasicInfoSection />
        <PhoneSection />
        <EmailLeadSyncSection />
        <VoiceAgentSection />
        <GoogleBusinessProfileSection />
        <GoogleCalendarSection />
        <LocationsSection />
        <EmailFromDomainSection />
        <DangerZoneSection />
      </div>
    </div>
  )
}
