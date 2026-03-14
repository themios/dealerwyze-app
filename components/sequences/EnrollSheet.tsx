'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, ChevronUp } from 'lucide-react'

interface SequenceStep {
  id: string
  sort_order: number
  day_offset: number
  send_hour: number
  template?: { name: string; subject: string | null } | null
}

interface SequenceRow {
  id: string
  name: string
  channel: 'sms' | 'email'
  auto_mode: 'manual' | 'semi_auto' | 'full_auto'
  sequence_steps?: { count: number }[]
  customer_sequences?: { count: number }[]
}

interface Props {
  customerId: string
  customerName: string
  channel?: 'email' | 'sms'
  open: boolean
  onOpenChange: (v: boolean) => void
  onEnrolled: () => void
}

function formatHour(h: number) {
  if (h === 0) return '12:00 AM'
  if (h < 12) return `${h}:00 AM`
  if (h === 12) return '12:00 PM'
  return `${h - 12}:00 PM`
}

function stepCount(s: SequenceRow) {
  return s.sequence_steps?.[0]?.count ?? 0
}

function enrollCount(s: SequenceRow) {
  return s.customer_sequences?.[0]?.count ?? 0
}

export default function EnrollSheet({ customerId, customerName, channel = 'email', open, onOpenChange, onEnrolled }: Props) {
  const [sequences, setSequences] = useState<SequenceRow[]>([])
  const [activeTab, setActiveTab] = useState<'email' | 'sms'>(channel)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [stepCache, setStepCache] = useState<Record<string, SequenceStep[]>>({})
  const [enrolling, setEnrolling] = useState<string | null>(null)

  const firstName = customerName.split(' ')[0]

  useEffect(() => {
    if (!open) return
    fetch('/api/sequences')
      .then(r => r.json())
      .then(d => setSequences(d.sequences ?? []))
      .catch(() => {})
  }, [open])

  async function toggleExpand(seqId: string) {
    if (expandedId === seqId) {
      setExpandedId(null)
      return
    }
    setExpandedId(seqId)
    if (!stepCache[seqId]) {
      const res = await fetch(`/api/sequences/${seqId}`)
      const d = await res.json()
      setStepCache(prev => ({ ...prev, [seqId]: d.steps ?? [] }))
    }
  }

  async function handleEnroll(seqId: string) {
    setEnrolling(seqId)
    try {
      const res = await fetch('/api/customer-sequences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customerId, sequence_id: seqId }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        alert(d.error ?? 'Failed to enroll')
        return
      }
      onOpenChange(false)
      onEnrolled()
    } finally {
      setEnrolling(null)
    }
  }

  const filtered = sequences.filter(s => s.channel === activeTab)
  const hasBoth = sequences.some(s => s.channel === 'email') && sequences.some(s => s.channel === 'sms')

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[70vh] rounded-t-2xl flex flex-col">
        <SheetHeader className="flex-shrink-0 mb-3">
          <SheetTitle>Start a Sequence for {firstName}</SheetTitle>
        </SheetHeader>

        {hasBoth && (
          <div className="flex gap-2 mb-3 flex-shrink-0">
            {(['email', 'sms'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  activeTab === tab
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-accent'
                }`}
              >
                {tab === 'email' ? 'Email' : 'SMS'}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-2">
          {filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <p className="font-medium text-sm">No {activeTab} sequences yet</p>
              <p className="text-xs mt-1 mb-4">Create one in Settings to start automating follow-ups.</p>
              <Link href="/settings/sequences" onClick={() => onOpenChange(false)}>
                <Button variant="outline" size="sm">Go to Settings - Sequences</Button>
              </Link>
            </div>
          )}
          {filtered.map(seq => {
            const steps = stepCache[seq.id] ?? []
            const isExpanded = expandedId === seq.id
            return (
              <div key={seq.id} className="rounded-lg border bg-card overflow-hidden">
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{seq.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {stepCount(seq)} step{stepCount(seq) !== 1 ? 's' : ''} - {enrollCount(seq)} active
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs flex-shrink-0">
                      {seq.auto_mode === 'manual' ? 'Manual' : seq.auto_mode === 'semi_auto' ? 'Review' : 'Auto'}
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1 h-9"
                      onClick={() => handleEnroll(seq.id)}
                      disabled={enrolling !== null}
                    >
                      {enrolling === seq.id ? 'Starting...' : 'Start'}
                    </Button>
                    <button
                      onClick={() => toggleExpand(seq.id)}
                      className="px-3 py-2 rounded-md border text-xs flex items-center gap-1 hover:bg-accent transition-colors"
                    >
                      Preview
                      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                  </div>
                </div>
                {isExpanded && (
                  <div className="border-t px-4 py-3 bg-muted/30 space-y-1.5">
                    {steps.length === 0 && <p className="text-xs text-muted-foreground">Loading steps...</p>}
                    {steps.map(s => (
                      <div key={s.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Day {s.day_offset}</span>
                        <span>{formatHour(s.send_hour)}</span>
                        {s.template?.name && <span className="truncate">{s.template.subject ?? s.template.name}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </SheetContent>
    </Sheet>
  )
}
