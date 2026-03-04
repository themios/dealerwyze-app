'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import TopBar from '@/components/layout/TopBar'
import { CreditCard, BarChart2, HeadphonesIcon, ShieldCheck, ChevronRight, Settings, Printer } from 'lucide-react'

const ADMIN_ITEM = {
  href: '/admin',
  icon: ShieldCheck,
  label: 'Admin Panel',
  desc: 'Orgs, audit log, analytics',
  color: 'text-red-400',
}

interface MeResponse {
  is_platform_admin?: boolean
  role?: string
}

export default function MorePage() {
  const [me, setMe] = useState<MeResponse>({})

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then((d: MeResponse) => setMe(d))
      .catch(() => {})
  }, [])

  const isRep = me.role === 'dealer_rep'
  const canReports = me.role === 'dealer_admin' || me.role === 'dealer_manager' || me.role === 'admin'

  const MENU_ITEMS = [
    ...(!isRep ? [{
      href: '/bhph',
      icon: CreditCard,
      label: 'BHPH Tracker',
      desc: 'Buy-here-pay-here payments',
      color: 'text-blue-400',
    }] : []),
    {
      href: '/fax',
      icon: Printer,
      label: 'Fax',
      desc: 'Send faxes via Twilio',
      color: 'text-cyan-400',
    },
    ...(canReports ? [{
      href: '/analytics',
      icon: BarChart2,
      label: 'Analytics',
      desc: 'Performance & response metrics',
      color: 'text-green-400',
    }] : []),
    {
      href: '/support',
      icon: HeadphonesIcon,
      label: 'Support',
      desc: 'Help tickets',
      color: 'text-purple-400',
    },
    {
      href: '/settings',
      icon: Settings,
      label: 'Settings',
      desc: 'Billing, team, integrations',
      color: 'text-yellow-400',
    },
  ]

  const items = me.is_platform_admin ? [...MENU_ITEMS, ADMIN_ITEM] : MENU_ITEMS

  return (
    <div>
      <TopBar title="More" />
      <div className="p-4 space-y-2">
        {items.map(({ href, icon: Icon, label, desc, color }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-4 p-4 rounded-xl bg-card border border-border hover:bg-accent transition-colors"
          >
            <Icon className={`h-6 w-6 flex-shrink-0 ${color}`} />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">{label}</p>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  )
}
