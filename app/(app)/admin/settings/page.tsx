import { redirect } from 'next/navigation'

export default function PlatformSettingsRoot() {
  redirect('/admin/settings/general')
}
