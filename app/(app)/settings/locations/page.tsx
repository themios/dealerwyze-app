import SettingsPageShell from '@/components/settings/SettingsPageShell'
import LocationsManager from '@/components/settings/LocationsManager'

export const dynamic = 'force-dynamic'

export default function LocationsSettingsPage() {
  return (
    <SettingsPageShell
      title="Locations"
      description="Manage store locations, staff assignments, and per-location outbound details."
      type="form"
    >
      <LocationsManager />
    </SettingsPageShell>
  )
}
