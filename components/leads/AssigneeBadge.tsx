'use client'

import { useState, useEffect, useRef } from 'react'

export type AssigneeMember = { id: string; display_name: string }

interface Props {
  assignee: AssigneeMember | null
  members: AssigneeMember[]
  customerId: string
  canReassign: boolean
  onReassigned: (newAssigneeId: string | null, display_name: string | null) => void
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function AssigneeBadge({
  assignee,
  members,
  customerId,
  canReassign,
  onReassigned,
}: Props) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDocDown(e: MouseEvent) {
      const el = rootRef.current
      if (el && !el.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [open])

  const initials = assignee ? initialsFromName(assignee.display_name) : null

  async function reassign(memberId: string | null) {
    setLoading(true)
    setOpen(false)
    try {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigned_to: memberId }),
      })
      if (res.ok) {
        const member = memberId ? members.find(m => m.id === memberId) ?? null : null
        onReassigned(memberId, member?.display_name ?? null)
      }
    } finally {
      setLoading(false)
    }
  }

  const badge = assignee ? (
    <span className="inline-flex items-center justify-center h-6 min-w-6 px-1.5 rounded-full bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200 text-xs font-semibold ring-1 ring-green-300 dark:ring-green-700">
      {initials}
    </span>
  ) : (
    <span className="inline-flex items-center justify-center h-6 px-2 rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200 text-xs font-medium ring-1 ring-red-300 dark:ring-red-800">
      Unassigned
    </span>
  )

  if (!canReassign) return badge

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-primary rounded-full"
        title={assignee?.display_name ?? 'Unassigned — click to assign'}
        disabled={loading}
      >
        {badge}
      </button>

      {open && (
        <div className="absolute z-50 mt-1 left-0 w-48 bg-popover text-popover-foreground border border-border rounded-md shadow-lg py-1">
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
            onClick={() => reassign(null)}
          >
            Unassigned
          </button>
          {members.map(m => (
            <button
              key={m.id}
              type="button"
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent"
              onClick={() => reassign(m.id)}
            >
              {m.display_name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
