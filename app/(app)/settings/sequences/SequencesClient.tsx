'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Plus, ChevronRight, Mail, MessageSquare } from 'lucide-react'

interface SequenceRow {
  id: string
  name: string
  channel: 'sms' | 'email'
  auto_mode: 'manual' | 'semi_auto' | 'full_auto'
  created_at: string
  sequence_steps?: { count: number }[]
  customer_sequences?: { count: number }[]
}

interface Props {
  initialSequences: SequenceRow[]
}

const AUTO_MODE_LABELS: Record<string, string> = {
  manual: 'Manual',
  semi_auto: 'Review Before Send',
  full_auto: 'Auto-Send',
}

export default function SequencesClient({ initialSequences }: Props) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'email' | 'sms'>('email')
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  const filtered = initialSequences.filter(s => s.channel === activeTab)

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const res = await fetch('/api/sequences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), channel: activeTab, auto_mode: 'manual' }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        alert(d.error ?? 'Failed to create sequence')
        return
      }
      const { sequence } = await res.json()
      setCreateOpen(false)
      setNewName('')
      router.push(`/settings/sequences/${sequence.id}`)
    } finally {
      setCreating(false)
    }
  }

  function stepCount(s: SequenceRow) {
    return s.sequence_steps?.[0]?.count ?? 0
  }

  function enrollCount(s: SequenceRow) {
    return s.customer_sequences?.[0]?.count ?? 0
  }

  return (
    <>
      <div className="flex gap-2 mb-4">
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

      <div className="space-y-2 mb-4">
        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <div className="flex justify-center mb-3">
              {activeTab === 'email' ? <Mail className="h-8 w-8 opacity-40" /> : <MessageSquare className="h-8 w-8 opacity-40" />}
            </div>
            <p className="font-medium text-sm">No {activeTab} sequences yet</p>
            <p className="text-xs mt-1">Create a sequence to start automating your follow-ups.</p>
            <Button size="sm" className="mt-4" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1.5" />
              Create your first sequence
            </Button>
          </div>
        )}
        {filtered.map(seq => (
          <button
            key={seq.id}
            onClick={() => router.push(`/settings/sequences/${seq.id}`)}
            className="w-full text-left p-4 rounded-lg border bg-card hover:bg-accent transition-colors"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <p className="font-medium text-sm">{seq.name}</p>
                  <Badge variant="outline" className="text-xs">{AUTO_MODE_LABELS[seq.auto_mode]}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {stepCount(seq)} step{stepCount(seq) !== 1 ? 's' : ''} - {enrollCount(seq)} active enrollment{enrollCount(seq) !== 1 ? 's' : ''}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            </div>
          </button>
        ))}
      </div>

      {filtered.length > 0 && (
        <Button variant="outline" onClick={() => setCreateOpen(true)} className="w-full">
          <Plus className="h-4 w-4 mr-1.5" />
          New {activeTab === 'email' ? 'Email' : 'SMS'} Sequence
        </Button>
      )}

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="bottom" className="h-[50vh] rounded-t-2xl flex flex-col">
          <SheetHeader className="flex-shrink-0 mb-4">
            <SheetTitle>New {activeTab === 'email' ? 'Email' : 'SMS'} Sequence</SheetTitle>
          </SheetHeader>
          <div className="flex-1 space-y-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Channel</p>
              <Badge variant="secondary" className="capitalize">{activeTab}</Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">Sequence name</p>
              <Input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. New Lead Follow-up"
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                autoFocus
              />
            </div>
          </div>
          <Button className="mt-4" onClick={handleCreate} disabled={creating || !newName.trim()}>
            {creating ? 'Creating...' : 'Create Sequence'}
          </Button>
        </SheetContent>
      </Sheet>
    </>
  )
}
