'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Mail, FileText, Phone, MessageSquare, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { DealerMessage, DealerThread, MessageChannel, ThreadStatus } from './dealer-inbox.types'

const CHANNEL_ICONS = {
  email:     Mail,
  note:      FileText,
  call_log:  Phone,
  in_app:    MessageSquare,
} as const

const PLACEHOLDERS: Record<MessageChannel, string> = {
  email:    'Write an email to this dealer…',
  note:     'Log a note about this account…',
  call_log: 'Log a call — what was discussed…',
  in_app:   'Write a message…',
}

const TYPE_BADGE: Record<DealerThread['thread_type'], string> = {
  success: 'bg-green-100 text-green-700',
  support: 'bg-orange-100 text-orange-700',
  billing: 'bg-amber-100 text-amber-700',
  sales:   'bg-blue-100 text-blue-700',
}

type Props = {
  orgId: string
  thread: DealerThread
  onBack: () => void
  onThreadUpdated: (updated: DealerThread) => void
}

export default function DealerThreadView({ orgId, thread, onBack, onThreadUpdated }: Props) {
  const [messages, setMessages]         = useState<DealerMessage[]>([])
  const [loading, setLoading]           = useState(true)
  const [replyBody, setReplyBody]       = useState('')
  const [replyChannel, setReplyChannel] = useState<MessageChannel>('email')
  const [sending, setSending]           = useState(false)
  const [error, setError]               = useState<string | null>(null)

  const loadMessages = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/orgs/${orgId}/threads/${thread.id}`)
      if (!res.ok) {
        setError('Could not load messages. Check your connection and try again.')
        return
      }
      const data = await res.json() as {
        messages: Array<Omit<DealerMessage, 'thread_id'> & { sender_display_name: string | null }>
      }
      setMessages(data.messages.map(m => ({ ...m, thread_id: thread.id })))
    } catch {
      setError('Could not load messages. Check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [orgId, thread.id])

  useEffect(() => { void loadMessages() }, [loadMessages])

  async function handleStatusChange(status: ThreadStatus) {
    setError(null)
    const res = await fetch(`/api/admin/orgs/${orgId}/threads/${thread.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (!res.ok) {
      setError('Could not update status. Try again.')
      return
    }
    onThreadUpdated({ ...thread, status })
  }

  async function handleSend() {
    if (!replyBody.trim() || sending) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/orgs/${orgId}/threads/${thread.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: replyBody.trim(), channel: replyChannel }),
      })
      if (!res.ok) {
        setError('Message could not be sent. Check the form and try again.')
        return
      }
      setReplyBody('')
      await loadMessages()
    } catch {
      setError('Message could not be sent. Check your connection and try again.')
    } finally {
      setSending(false)
    }
  }

  function fmtTime(d: string) {
    return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  return (
    <div className="flex flex-col h-[min(70vh,600px)]">
      <div className="shrink-0 space-y-2 pb-3 border-b">
        <div className="flex items-start gap-2">
          <button type="button" onClick={onBack} className="mt-0.5 p-1 rounded-md hover:bg-muted text-muted-foreground" aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold truncate">{thread.subject}</h3>
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${TYPE_BADGE[thread.thread_type]}`}>
                {thread.thread_type}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-muted-foreground">
              <label className="flex items-center gap-1.5">
                Status
                <select
                  value={thread.status}
                  onChange={e => void handleStatusChange(e.target.value as ThreadStatus)}
                  className="px-2 py-1 rounded-md border border-border bg-background text-foreground text-xs"
                >
                  <option value="open">Open</option>
                  <option value="resolved">Resolved</option>
                  <option value="archived">Archived</option>
                </select>
              </label>
              <span>Owner: {thread.assigned_name ?? 'Unassigned'}</span>
            </div>
          </div>
        </div>
        {error && <p className="text-xs text-destructive px-1">{error}</p>}
      </div>

      <div className="flex-1 overflow-y-auto py-3 space-y-3 min-h-0">
        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {!loading && messages.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No messages yet.</p>
        )}
        {!loading && messages.map(msg => {
          const Icon = CHANNEL_ICONS[msg.channel] ?? FileText
          const label = msg.sender_display_name
            ?? (msg.sender_type === 'platform' ? 'DealerWyze' : msg.sender_type === 'dealer' ? 'Dealer' : 'System')

          if (msg.sender_type === 'system') {
            return (
              <p key={msg.id} className="text-center text-[11px] text-muted-foreground px-4">
                {msg.body} · {fmtTime(msg.sent_at)}
              </p>
            )
          }

          const isPlatform = msg.sender_type === 'platform'
          return (
            <div key={msg.id} className={`flex ${isPlatform ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-[85%] space-y-1">
                <div
                  className={`px-3 py-2 text-sm whitespace-pre-wrap ${
                    isPlatform
                      ? 'bg-primary text-primary-foreground rounded-2xl rounded-tr-sm'
                      : 'bg-muted rounded-2xl rounded-tl-sm'
                  }`}
                >
                  {msg.body}
                </div>
                <p className={`flex items-center gap-1 text-[10px] text-muted-foreground ${isPlatform ? 'justify-end' : ''}`}>
                  <Icon className="h-3 w-3" />
                  {label} · {fmtTime(msg.sent_at)}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      <div className="shrink-0 pt-3 border-t space-y-2">
        <div className="flex gap-2 items-end">
          <select
            value={replyChannel}
            onChange={e => setReplyChannel(e.target.value as MessageChannel)}
            className="px-2 py-2 rounded-lg border border-border bg-background text-xs shrink-0"
          >
            <option value="email">Email</option>
            <option value="note">Note</option>
            <option value="call_log">Call Log</option>
          </select>
          <textarea
            value={replyBody}
            onChange={e => setReplyBody(e.target.value)}
            placeholder={PLACEHOLDERS[replyChannel]}
            rows={3}
            className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none"
          />
          <Button size="sm" disabled={sending || !replyBody.trim()} onClick={() => void handleSend()}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send'}
          </Button>
        </div>
      </div>
    </div>
  )
}
