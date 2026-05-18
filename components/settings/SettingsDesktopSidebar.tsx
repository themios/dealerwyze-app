import Link from 'next/link'
import { ArrowLeft, Settings } from 'lucide-react'
import { requireProfile } from '@/lib/auth/profile'
import SettingsDesktopNav from './SettingsDesktopNav'
import SignOutButton from './SignOutButton'

export default async function SettingsDesktopSidebar() {
  const profile = await requireProfile()

  // recon-template visibility gate (mirrors SettingsHomeClient logic)
  const canManageReconTemplate = profile.role === 'dealer_admin' || profile.role === 'admin'

  return (
    <aside className="hidden lg:flex flex-col w-60 shrink-0 h-dvh bg-[#0D1F33] border-r border-white/8 overflow-hidden">
      {/* Header */}
      <div className="px-4 pt-5 pb-4 border-b border-white/8">
        <Link
          href="/today"
          className="flex items-center gap-1.5 text-white/40 hover:text-white/70 text-xs mb-4 transition-colors w-fit"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to app
        </Link>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#F07018]/15 border border-[#F07018]/20">
            <Settings className="h-3.5 w-3.5 text-[#F07018]" />
          </div>
          <p className="text-sm font-semibold text-white">Settings</p>
        </div>
      </div>

      {/* Client nav with search */}
      <SettingsDesktopNav
        role={profile.role as Parameters<typeof SettingsDesktopNav>[0]['role']}
        canManageReconTemplate={canManageReconTemplate}
      />

      {/* Sign out — pinned to bottom of sidebar */}
      <div className="px-3 pb-4 pt-2 border-t border-white/8">
        <SignOutButton variant="dark" />
      </div>
    </aside>
  )
}
