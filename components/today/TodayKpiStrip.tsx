'use client'

import Link from 'next/link'
import { useVertical } from '@/hooks/useVertical'

interface Stat {
  label: string
  value: number
  color: string
  href?: string
  scrollTarget?: { col: 'center' | 'right'; sectionId: string }
}

interface Props {
  newLeadCount: number
  apptCount: number
  voiceCount: number
  waitingCount: number
  overdueCount: number
}

export default function TodayKpiStrip({ newLeadCount, apptCount, voiceCount, waitingCount, overdueCount }: Props) {
  const { vertical } = useVertical()
  const stats: Stat[] = [
    {
      label: vertical === 'real_estate' ? 'New Inquiries' : 'New Leads',
      value: newLeadCount,
      color: newLeadCount > 0 ? 'text-blue-500' : 'text-muted-foreground',
      href: '/customers?status=new_lead',
    },
    {
      label: vertical === 'real_estate' ? 'Showing Requests' : 'Appt Requests',
      value: apptCount,
      color: apptCount > 0 ? 'text-orange-500' : 'text-muted-foreground',
      href: '/calendar',
    },
    {
      label: 'Voice Leads',
      value: voiceCount,
      color: voiceCount > 0 ? 'text-purple-500' : 'text-muted-foreground',
      scrollTarget: { col: 'center', sectionId: 'today-section-human_now' },
    },
    {
      label: 'Waiting',
      value: waitingCount,
      color: waitingCount > 0 ? 'text-yellow-500' : 'text-muted-foreground',
      scrollTarget: { col: 'center', sectionId: 'today-section-follow_up_later' },
    },
    {
      label: 'Overdue',
      value: overdueCount,
      color: overdueCount > 0 ? 'text-red-500' : 'text-muted-foreground',
      scrollTarget: { col: 'right', sectionId: 'today-tasks-col' },
    },
  ]

  function scrollTo(target: NonNullable<Stat['scrollTarget']>) {
    const col = document.getElementById(
      target.col === 'center' ? 'today-center-col' : 'today-right-col'
    )
    const section = document.getElementById(target.sectionId)
    if (!col || !section) return
    const colTop = col.getBoundingClientRect().top
    const sectionTop = section.getBoundingClientRect().top
    col.scrollBy({ top: sectionTop - colTop - 8, behavior: 'smooth' })
  }

  return (
    <div className="hidden lg:grid lg:grid-cols-5 gap-3 px-6 py-4 border-b border-border bg-card/50">
      {stats.map(({ label, value, color, href, scrollTarget }) => {
        const inner = (
          <>
            <span className={`text-3xl font-bold tabular-nums ${color}`}>{value}</span>
            <span className="text-xs text-muted-foreground mt-0.5">{label}</span>
          </>
        )

        const baseClass =
          'flex flex-col items-center py-2 rounded-lg transition-colors hover:bg-muted/50 cursor-pointer'

        if (href) {
          return (
            <Link key={label} href={href} className={baseClass}>
              {inner}
            </Link>
          )
        }

        return (
          <button
            key={label}
            type="button"
            onClick={() => scrollTo(scrollTarget!)}
            className={baseClass}
          >
            {inner}
          </button>
        )
      })}
    </div>
  )
}
