'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowRightLeft } from 'lucide-react'

export default function DangerZoneSection({ isRE = false }: { isRE?: boolean }) {
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .catch(() => ({ role: 'agent' }))
      .then(me => setIsAdmin(me?.role === 'admin' || me?.role === 'dealer_admin'))
  }, [])

  if (!isAdmin) return null

  return (
    <div className="px-4 border-t pt-4 mt-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Danger Zone</p>
      <Link
        href="/settings/transfer"
        className="flex items-center gap-2 w-full rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900 px-4 py-3 text-sm text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/40 transition-colors"
      >
        <ArrowRightLeft className="h-4 w-4 shrink-0" />
        Transfer Business Ownership
      </Link>
      <p className="text-xs text-muted-foreground mt-1.5">
        {isRE ? 'Transfer this agency to a new owner. Your account will be deactivated.' : 'Sell or transfer this dealership to a new owner. Your account will be deactivated.'}
      </p>
    </div>
  )
}
