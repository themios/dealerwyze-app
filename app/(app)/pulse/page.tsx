// app/(app)/pulse/page.tsx
import { requireProfile } from '@/lib/auth/profile'
import { redirect } from 'next/navigation'
import { canManageUsers } from '@/lib/auth/dealerRoles'
import type { UserRole } from '@/types/index'
import TopBar from '@/components/layout/TopBar'
import PulseDashboard from './PulseDashboard'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default async function PulsePage() {
  const profile = await requireProfile()
  if (!canManageUsers(profile.role as UserRole) && profile.role !== 'dealer_manager') {
    redirect('/today')
  }
  return (
    <div className="flex flex-col h-screen">
      <TopBar
        title="Customer Pulse"
        right={
          <div className="flex gap-1">
            <Link href="/pulse/actions">
              <Button variant="ghost" size="sm" className="text-xs h-7 px-2">Board</Button>
            </Link>
            <Link href="/pulse/team">
              <Button variant="ghost" size="sm" className="text-xs h-7 px-2">Team</Button>
            </Link>
          </div>
        }
      />
      <div className="flex-1 overflow-y-auto">
        <PulseDashboard />
      </div>
    </div>
  )
}
