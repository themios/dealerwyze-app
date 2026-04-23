import { requireProfile } from '@/lib/auth/profile'
import { redirect } from 'next/navigation'
import { canManageUsers } from '@/lib/auth/dealerRoles'
import type { UserRole } from '@/types/index'
import TopBar from '@/components/layout/TopBar'
import PdcaBoard from './PdcaBoard'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

export default async function PdcaPage() {
  const profile = await requireProfile()
  if (!canManageUsers(profile.role as UserRole) && profile.role !== 'dealer_manager') {
    redirect('/today')
  }
  return (
    <div className="flex flex-col h-screen">
      <TopBar
        left={
          <Link href="/pulse" className="flex items-center gap-1 text-sm text-white/80 hover:text-white">
            <ChevronLeft className="h-4 w-4" />Pulse
          </Link>
        }
        title="Improvement Board"
      />
      <div className="flex-1 overflow-y-auto">
        <PdcaBoard />
      </div>
    </div>
  )
}
