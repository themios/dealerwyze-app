import { redirect } from 'next/navigation'
import { requireProfile } from '@/lib/auth/profile'
import { isPlatformSuperAdmin } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'
import Link from 'next/link'
import SectionHeader from '@/components/admin/settings/SectionHeader'

export const dynamic = 'force-dynamic'

const ROLE_LABELS: Record<string, string> = {
  platform_admin:         'Admins',
  platform_staff_manager: 'Staff Managers',
  platform_sales_manager: 'Sales Managers',
  platform_staff:         'Support Staff',
}

export default async function SettingsTeamPage() {
  const profile = await requireProfile()
  const isSuperAdmin = await isPlatformSuperAdmin(profile.id)
  if (!isSuperAdmin) redirect('/admin')

  const supabase = createServiceClient()
  const { data: members } = await supabase
    .from('profiles')
    .select('platform_role')
    .not('platform_role', 'is', null)

  const counts: Record<string, number> = {}
  for (const m of members ?? []) {
    const r = m.platform_role as string
    counts[r] = (counts[r] ?? 0) + 1
  }

  return (
    <div className="p-6 max-w-3xl bg-[#07131F] min-h-full text-white">
      <SectionHeader
        title="Team"
        description="Platform staff and access management."
      />

      <div className="bg-[#0a1628] border border-[#1B4A8A]/30 rounded-xl p-4 space-y-3">
        {Object.entries(ROLE_LABELS).map(([role, label]) => (
          <div key={role} className="flex items-center justify-between py-1.5 border-b border-white/5 last:border-0">
            <span className="text-white/60 text-sm">{label}</span>
            <span className="text-white font-medium text-sm">{counts[role] ?? 0}</span>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <Link
          href="/admin/staff"
          className="inline-flex items-center gap-2 bg-[#1B4A8A] hover:bg-[#1B4A8A]/80 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          Manage Team →
        </Link>
        <p className="text-white/30 text-xs mt-2">
          Full team management — invite, edit roles, view ticket stats — lives at the staff page.
        </p>
      </div>
    </div>
  )
}
