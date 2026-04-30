'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Check, X, ChevronRight } from 'lucide-react'

interface CheckItems {
  hasCustomer:   boolean
  hasEmail:      boolean
  hasSmsTemplate: boolean
  hasTeamMember: boolean
  hasPlan:       boolean
}

interface Props {
  orgId: string
  onboardingCompletedAt: string | null
  checkItems: CheckItems
}

const ITEMS: { key: keyof CheckItems; label: string; href: string }[] = [
  { key: 'hasCustomer',    label: 'Add your first customer',      href: '/customers/new' },
  { key: 'hasEmail',       label: 'Connect email lead sync',      href: '/settings/organization' },
  { key: 'hasSmsTemplate', label: 'Set up an SMS template',       href: '/settings' },
  { key: 'hasTeamMember',  label: 'Invite a team member',         href: '/settings/users' },
  { key: 'hasPlan',        label: 'Subscribe to a plan',          href: '/settings/billing' },
]

const STORAGE_KEY = (orgId: string) => `dealerwyze_onboarding_dismissed_${orgId}`
const DAYS_7 = 7 * 24 * 60 * 60 * 1000

function shouldShowChecklist(orgId: string, onboardingCompletedAt: string | null): boolean {
  if (!onboardingCompletedAt || typeof window === 'undefined') return false
  if (localStorage.getItem(STORAGE_KEY(orgId)) === '1') return false

  const completedAt = new Date(onboardingCompletedAt).getTime()
  return Date.now() - completedAt < DAYS_7
}

export default function OnboardingChecklist({ orgId, onboardingCompletedAt, checkItems }: Props) {
  const [visible, setVisible] = useState(() => shouldShowChecklist(orgId, onboardingCompletedAt))

  const completed = ITEMS.filter(i => checkItems[i.key]).length
  const allDone   = completed === ITEMS.length

  const dismiss = useCallback(() => {
    localStorage.setItem(STORAGE_KEY(orgId), '1')
    setVisible(false)
  }, [orgId])

  // Auto-dismiss when all done (after brief celebration)
  useEffect(() => {
    if (allDone && visible) {
      const t = setTimeout(() => dismiss(), 3000)
      return () => clearTimeout(t)
    }
  }, [allDone, visible, dismiss])

  if (!visible) return null

  return (
    <div className="mx-4 mb-3 rounded-xl border bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Setup checklist</p>
          <p className="text-xs text-muted-foreground">{completed} of {ITEMS.length} complete</p>
        </div>
        <button onClick={dismiss} className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all"
          style={{ width: `${(completed / ITEMS.length) * 100}%` }}
        />
      </div>

      {/* Items */}
      <div className="space-y-1.5">
        {ITEMS.map(item => {
          const done = checkItems[item.key]
          return (
            <Link
              key={item.key}
              href={done ? '#' : item.href}
              className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 -mx-2 transition-colors ${done ? 'opacity-50' : 'hover:bg-muted'}`}
              onClick={done ? e => e.preventDefault() : undefined}
            >
              <div className={`h-4.5 w-4.5 rounded-full flex items-center justify-center shrink-0 ${
                done ? 'bg-green-500 text-white' : 'border-2 border-muted-foreground/30'
              }`}>
                {done && <Check className="h-3 w-3" />}
              </div>
              <span className={`text-sm flex-1 ${done ? 'line-through' : ''}`}>{item.label}</span>
              {!done && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
            </Link>
          )
        })}
      </div>

      {allDone && (
        <p className="text-xs text-green-600 font-medium text-center">
          All done! You&apos;re fully set up. 🎉
        </p>
      )}
    </div>
  )
}
