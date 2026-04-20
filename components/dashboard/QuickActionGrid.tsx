'use client'

import Link from 'next/link'
import {
  Search, CalendarDays, BarChart2, BookUser,
  Settings, Receipt, HeadphonesIcon,
} from 'lucide-react'
import PasteLeadDialog from '@/components/customer/PasteLeadDialog'
import ScanLeadButton from '@/components/leads/ScanLeadButton'

const LINKS = [
  { href: '/receipts',  label: 'Receipts',  icon: Receipt,        color: 'text-green-400'  },
  { href: '/search',    label: 'Search',    icon: Search,         color: 'text-purple-400' },
  { href: '/calendar',  label: 'Calendar',  icon: CalendarDays,   color: 'text-cyan-400'   },
  { href: '/analytics', label: 'Analytics', icon: BarChart2,      color: 'text-yellow-400' },
  { href: '/contacts',  label: 'Contacts',  icon: BookUser,       color: 'text-pink-400'   },
  { href: '/support',   label: 'Support',   icon: HeadphonesIcon, color: 'text-indigo-400' },
  { href: '/settings',  label: 'Settings',  icon: Settings,       color: 'text-white/50'   },
]

const tileCls = 'flex flex-col items-center gap-1.5 p-3 rounded-xl border border-border bg-card hover:bg-accent active:bg-accent/80 transition-colors'
const labelCls = 'text-[10px] font-medium text-muted-foreground text-center leading-tight'

export default function QuickActionGrid() {
  return (
    <div className="grid grid-cols-3 gap-2 px-4">
      {/* Import Lead — self-contained dialog with its own trigger */}
      <div className={tileCls}>
        <PasteLeadDialog />
        <span className={labelCls}>Import Lead</span>
      </div>

      {/* Scan Lead — self-contained dialog with its own trigger */}
      <div className={tileCls}>
        <ScanLeadButton />
        <span className={labelCls}>Scan Lead</span>
      </div>

      {/* Link tiles */}
      {LINKS.map(({ href, label, icon: Icon, color }) => (
        <Link key={href} href={href}>
          <div className={tileCls}>
            <Icon className={`h-5 w-5 ${color}`} />
            <span className={labelCls}>{label}</span>
          </div>
        </Link>
      ))}
    </div>
  )
}
