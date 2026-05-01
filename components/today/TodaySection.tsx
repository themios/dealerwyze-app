'use client'

import { useEffect, useId, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface Props {
  sectionKey: string
  title: string
  count: number
  defaultOpen?: boolean
  headerActions?: React.ReactNode
  children: React.ReactNode
  emptyMessage?: string
}

export default function TodaySection({
  sectionKey,
  title,
  count,
  defaultOpen = false,
  headerActions,
  children,
  emptyMessage = 'Nothing here right now.',
}: Props) {
  const storageKey = `today-section:${sectionKey}`
  const [open, setOpen] = useState(defaultOpen)
  const contentId = useId()

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey)
    if (saved === '0') setOpen(false)
    if (saved === '1') setOpen(true)
  }, [storageKey])

  useEffect(() => {
    window.localStorage.setItem(storageKey, open ? '1' : '0')
  }, [open, storageKey])

  return (
    <section id={`today-section-${sectionKey}`} className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1 text-left"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => setOpen(v => !v)}
        >
          {open ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          <span className="text-sm font-semibold">{title}</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{count}</span>
        </button>
        {headerActions}
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={contentId}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2 overflow-hidden"
          >
            {count > 0 ? children : <p className="rounded-xl border bg-card px-4 py-4 text-sm text-muted-foreground">{emptyMessage}</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
