'use client'

import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SettingsAccordionGroupProps {
  title: string
  description: string
  count: number
  open: boolean
  onToggle: () => void
  children: ReactNode
}

export default function SettingsAccordionGroup({
  title,
  description,
  count,
  open,
  onToggle,
  children,
}: SettingsAccordionGroupProps) {
  return (
    <section className="rounded-xl border bg-card overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left hover:bg-accent/40 transition-colors"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">{title}</p>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {count}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open ? <div className="border-t bg-background/50 px-3 py-3">{children}</div> : null}
    </section>
  )
}
