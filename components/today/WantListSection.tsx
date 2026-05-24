'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Bell, X, Phone, MessageSquare } from 'lucide-react'
import type { WantListCustomer } from '@/app/api/today/want-list/route'

function formatWant(w: WantListCustomer['wants'][number]): string {
  const parts: string[] = []
  if (w.year_min && w.year_max) parts.push(`${w.year_min}-${w.year_max}`)
  else if (w.year_min) parts.push(`${w.year_min}+`)
  else if (w.year_max) parts.push(`up to ${w.year_max}`)
  if (w.make) parts.push(w.make)
  if (w.model) parts.push(w.model)
  else if (w.body_style) parts.push(w.body_style)
  if (w.max_price) parts.push(`under $${w.max_price.toLocaleString()}`)
  return parts.join(' ') || 'Any vehicle'
}

function staleness(item: WantListCustomer): { label: string; urgent: boolean } {
  const lastContact = item.last_outbound_at ?? item.last_inbound_at
  if (!lastContact) {
    return { label: 'Never contacted', urgent: true }
  }
  const days = Math.floor((Date.now() - new Date(lastContact).getTime()) / 86400000)
  if (days === 0) return { label: 'Contacted today', urgent: false }
  if (days === 1) return { label: 'Last contact yesterday', urgent: false }
  return { label: `No contact in ${days}d`, urgent: days >= 7 }
}

export default function WantListSection() {
  const [items, setItems] = useState<WantListCustomer[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    fetch('/api/today/want-list')
      .then(r => r.ok ? r.json() as Promise<WantListCustomer[]> : Promise.resolve([]))
      .then(data => { setItems(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const visible = items.filter(i => !dismissed.has(i.customer_id))

  if (loading || visible.length === 0) return null

  return (
    <section className="space-y-2 rounded-xl border border-blue-200/80 bg-blue-50/40 p-3 dark:border-blue-900/50 dark:bg-blue-950/20">
      <button
        className="flex w-full items-center justify-between gap-2"
        onClick={() => setCollapsed(c => !c)}
        type="button"
      >
        <div className="flex items-center gap-2">
          <Bell className="h-3.5 w-3.5 text-blue-700 dark:text-blue-300 shrink-0" />
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-800 dark:text-blue-200">
            Want List
          </p>
        </div>
        <span className="text-[11px] text-blue-700/70 dark:text-blue-300/60">
          {visible.length} buyer{visible.length === 1 ? '' : 's'} waiting {collapsed ? '▸' : '▾'}
        </span>
      </button>

      {!collapsed && (
        <>
          <p className="text-xs text-muted-foreground">
            These buyers are waiting for a specific vehicle. Reach out when you have a match.
          </p>
          <ul className="space-y-1.5">
            {visible.map(item => {
              const { label, urgent } = staleness(item)
              return (
                <li
                  key={item.customer_id}
                  className="flex items-start gap-2 rounded-lg border border-blue-100 bg-white/70 px-2.5 py-2 dark:border-blue-900/40 dark:bg-blue-950/30 group"
                >
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/customers/${item.customer_id}`}
                      className="text-sm font-semibold text-foreground hover:underline truncate block"
                    >
                      {item.customer_name}
                    </Link>
                    <div className="mt-0.5 space-y-0.5">
                      {item.wants.map(w => (
                        <p key={w.id} className="text-xs text-blue-800 dark:text-blue-200 font-medium truncate">
                          {formatWant(w)}
                          {w.notes && <span className="text-muted-foreground font-normal"> · {w.notes}</span>}
                        </p>
                      ))}
                    </div>
                    <p className={`text-[11px] mt-0.5 ${urgent ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                      {label}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 pt-0.5">
                    {item.primary_phone && (
                      <>
                        <a
                          href={`tel:${item.primary_phone}`}
                          className="p-1 rounded text-muted-foreground hover:text-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                          title={`Call ${item.customer_name}`}
                          aria-label={`Call ${item.customer_name}`}
                        >
                          <Phone className="h-3.5 w-3.5" />
                        </a>
                        <a
                          href={`sms:${item.primary_phone}`}
                          className="p-1 rounded text-muted-foreground hover:text-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                          title={`Text ${item.customer_name}`}
                          aria-label={`Text ${item.customer_name}`}
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                        </a>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => setDismissed(prev => new Set([...prev, item.customer_id]))}
                      aria-label={`Dismiss ${item.customer_name} from want list`}
                      className="p-1 rounded opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-opacity"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}
