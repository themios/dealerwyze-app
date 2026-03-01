'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import TopBar from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Loader2, MessageSquare } from 'lucide-react'

interface Ticket {
  id: string
  subject: string
  status: string
  priority: string
  created_at: string
}

const STATUS_STYLE: Record<string, string> = {
  open:        'bg-blue-100 text-blue-700',
  in_progress: 'bg-yellow-100 text-yellow-700',
  resolved:    'bg-green-100 text-green-700',
  closed:      'bg-gray-100 text-gray-500',
}
const PRIORITY_STYLE: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700',
  high:   'bg-orange-100 text-orange-700',
  normal: 'bg-gray-100 text-gray-500',
  low:    'bg-gray-50 text-gray-400',
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function SupportPage() {
  const router = useRouter()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  const [subject, setSubject]   = useState('')
  const [message, setMessage]   = useState('')
  const [priority, setPriority] = useState('normal')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError]   = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/support/tickets')
      .then(r => r.json())
      .then((d: Ticket[]) => { setTickets(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function handleSubmit() {
    if (!subject.trim() || !message.trim()) { setFormError('Subject and message are required.'); return }
    setSubmitting(true)
    setFormError(null)
    const res  = await fetch('/api/support/tickets', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ subject, message, priority }),
    })
    const data = await res.json() as { id?: string; error?: string }
    setSubmitting(false)
    if (!res.ok) { setFormError(data.error ?? 'Failed to submit.'); return }
    router.push(`/support/${data.id}`)
  }

  return (
    <div>
      <TopBar title="Support" />
      <div className="px-4 py-4 space-y-4 pb-24">

        {!showForm && (
          <Button className="w-full" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            New Ticket
          </Button>
        )}

        {showForm && (
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <p className="font-semibold text-sm">New Support Ticket</p>

            <div className="space-y-1.5">
              <Label className="text-xs">Subject</Label>
              <Input
                placeholder="Briefly describe the issue"
                value={subject}
                onChange={e => setSubject(e.target.value)}
                className="h-10"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="urgent">Urgent — blocking my business</SelectItem>
                  <SelectItem value="high">High — significant impact</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="low">Low — question or feedback</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Textarea
                placeholder="Describe the issue in detail. Include steps to reproduce if applicable."
                value={message}
                onChange={e => setMessage(e.target.value)}
                rows={4}
                className="resize-none"
              />
            </div>

            {formError && <p className="text-xs text-destructive">{formError}</p>}

            <div className="flex gap-2">
              <Button className="flex-1" onClick={handleSubmit} disabled={submitting}>
                {submitting ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Submitting…</> : 'Submit Ticket'}
              </Button>
              <Button variant="outline" onClick={() => { setShowForm(false); setFormError(null) }}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-12 space-y-2">
            <MessageSquare className="h-8 w-8 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">No support tickets yet.</p>
            <p className="text-xs text-muted-foreground">Submit a ticket if you need help.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">My Tickets</p>
            {tickets.map(t => (
              <button
                key={t.id}
                onClick={() => router.push(`/support/${t.id}`)}
                className="w-full text-left rounded-xl border bg-card p-3 space-y-1.5 active:opacity-70"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium leading-snug">{t.subject}</p>
                  <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_STYLE[t.status] ?? 'bg-gray-100 text-gray-500'}`}>
                    {t.status.replace('_', ' ')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${PRIORITY_STYLE[t.priority] ?? ''}`}>
                    {t.priority}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{fmtDate(t.created_at)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
