import Link from 'next/link'
import { redirect } from 'next/navigation'
import SectionHeader from '@/components/admin/settings/SectionHeader'
import { requireProfile } from '@/lib/auth/profile'
import { isPlatformSuperAdmin } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

function formatMostRecentDate(value: string | null | undefined) {
  if (!value) return 'No entries'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'No entries'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function PrivacyValue({
  href,
  label,
}: {
  href: string | null | undefined
  label: string
}) {
  if (!href) {
    return <span className="text-white/20 text-sm">Not configured</span>
  }
  return (
    <a href={href} className="text-[#F07018] text-sm hover:underline" target="_blank" rel="noreferrer">
      {label}
    </a>
  )
}

export default async function ComplianceSettingsPage() {
  const profile = await requireProfile()
  const isSuperAdmin = await isPlatformSuperAdmin(profile.id)
  if (!isSuperAdmin) {
    redirect('/admin')
  }

  const supabase = createServiceClient()
  // eslint-disable-next-line react-hooks/purity -- intentional: server component, not a hook
  const since30d = new Date(Date.now() - 30 * 86400000).toISOString()

  const [{ count: totalCount }, { data: mostRecent }, { count: recentCount }, { data: settings }] =
    await Promise.all([
      supabase.from('audit_log').select('id', { count: 'exact', head: true }),
      supabase
        .from('audit_log')
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('audit_log')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since30d),
      supabase
        .from('platform_settings')
        .select('help_url,terms_url,privacy_url,support_email')
        .limit(1)
        .single(),
    ])

  return (
    <div className="p-6 max-w-3xl bg-[#07131F] min-h-full text-white">
      <SectionHeader
        title="Compliance"
        description="Data governance, audit trail, and platform retention summary."
      />

      <div className="bg-[#0a1628] border border-[#1B4A8A]/30 rounded-xl p-4">
        <h3 className="text-white font-medium text-sm mb-3">Audit Log</h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-white/60 text-sm">Total entries</span>
            <span className="text-white/40 text-sm">{totalCount ?? 0}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-white/60 text-sm">Last 30 days</span>
            <span className="text-white/40 text-sm">{recentCount ?? 0}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-white/60 text-sm">Most recent</span>
            <span className="text-white/40 text-sm">{formatMostRecentDate(mostRecent?.created_at)}</span>
          </div>
        </div>
        <Link href="/admin/audit-log" className="text-[#F07018] text-sm hover:underline mt-4 inline-block">
          View full audit log →
        </Link>
      </div>

      <div className="bg-[#0a1628] border border-[#1B4A8A]/30 rounded-xl p-4 mt-4">
        <h3 className="text-white font-medium text-sm mb-3">Data Retention</h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-white/60 text-sm">Audit log</span>
            <span className="text-white/40 text-sm">Retained indefinitely</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-white/60 text-sm">Activity logs</span>
            <span className="text-white/40 text-sm">365 days (rolling)</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-white/60 text-sm">SMS message bodies</span>
            <span className="text-white/40 text-sm">90 days (rolling)</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-white/60 text-sm">Customer records</span>
            <span className="text-white/40 text-sm">Until manually deleted or org canceled</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-white/60 text-sm">Video renders</span>
            <span className="text-white/40 text-sm">Until manually deleted</span>
          </div>
        </div>
        <p className="text-white/40 text-xs mt-3">
          Retention periods reflect current policy. Contact legal before modifying.
        </p>
      </div>

      <div className="bg-[#0a1628] border border-[#1B4A8A]/30 rounded-xl p-4 mt-4">
        <h3 className="text-white font-medium text-sm mb-3">Privacy</h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-white/60 text-sm">Help URL</span>
            <PrivacyValue href={settings?.help_url} label="Open help center" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-white/60 text-sm">Terms URL</span>
            <PrivacyValue href={settings?.terms_url} label="Open terms" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-white/60 text-sm">Privacy URL</span>
            <PrivacyValue href={settings?.privacy_url} label="Open privacy policy" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-white/60 text-sm">Support email</span>
            <span className="text-white/40 text-sm">{settings?.support_email || 'Not configured'}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
