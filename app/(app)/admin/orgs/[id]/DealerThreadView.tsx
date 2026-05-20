'use client'

import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, Mail, FileText, Phone, MessageSquare, ArrowLeft, Paperclip, X, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type { DealerMessage, DealerThread, MessageAttachment, MessageChannel, ThreadStatus } from './dealer-inbox.types'

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

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function AttachmentDisplay({ attachment }: { attachment: MessageAttachment }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const isImage = attachment.type.startsWith('image/')

  useEffect(() => {
    const supabase = createClient()
    supabase.storage
      .from('dealer-attachments')
      .createSignedUrl(attachment.path, 3600)
      .then(({ data }) => { if (data?.signedUrl) setSignedUrl(data.signedUrl) })
      .catch(() => {})
  }, [attachment.path])

  if (isImage) {
    return (
      <a href={signedUrl ?? '#'} target="_blank" rel="noopener noreferrer" className="block">
        {signedUrl
          ? (
            <Image
              src={signedUrl}
              alt={attachment.name}
              width={128}
              height={128}
              unoptimized
              className="max-h-32 w-auto rounded-lg border border-border object-cover"
            />
          )
          : <span className="text-[11px] text-muted-foreground">{attachment.name}</span>
        }
      </a>
    )
  }

  return (
    <a
      href={signedUrl ?? '#'}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-background',
        'text-xs text-foreground hover:bg-muted transition-colors',
        !signedUrl && 'pointer-events-none opacity-60',
      )}
    >
      <Download className="h-3 w-3 shrink-0" />
      <span className="truncate max-w-[160px]">{attachment.name}</span>
      <span className="text-muted-foreground shrink-0">({fmtSize(attachment.size)})</span>
    </a>
  )
}

type Props = {
  orgId: string
  thread: DealerThread
  onBack: () => void
  onThreadUpdated: (updated: DealerThread) => void
}

export default function DealerThreadView({ orgId, thread, onBack, onThreadUpdated }: Props) {
  const [messages, setMessages]               = useState<DealerMessage[]>([])
  const [loading, setLoading]                 = useState(true)
  const [replyBody, setReplyBody]             = useState('')
  const [replyChannel, setReplyChannel]       = useState<MessageChannel>('email')
  const [autoChannel, setAutoChannel]         = useState<MessageChannel | null>(null)
  const [pendingFiles, setPendingFiles]       = useState<File[]>([])
  const [sending, setSending]                 = useState(false)
  const [error, setError]                     = useState<string | null>(null)
  const fileInputRef                          = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`/api/admin/orgs/${orgId}/engagement`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { preferred_channel: MessageChannel } | null) => {
        const ch = data?.preferred_channel ?? 'email'
        setReplyChannel(ch)
        setAutoChannel(ch)
      })
      .catch(() => {})
  }, [orgId])

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`dealer_messages:${thread.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dealer_messages', filter: `thread_id=eq.${thread.id}` },
        (payload) => {
          const row = payload.new as DealerMessage & { sender_display_name?: string | null }
          setMessages(prev => {
            if (prev.some(m => m.id === row.id)) return prev
            return [...prev, { ...row, thread_id: thread.id }]
          })
        },
      )
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [thread.id])

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

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? [])
    setPendingFiles(prev => [...prev, ...selected])
    e.target.value = ''
  }

  function removeFile(index: number) {
    setPendingFiles(prev => prev.filter((_, i) => i !== index))
  }

  async function handleSend() {
    if (!replyBody.trim() || sending) return
    setSending(true)
    setError(null)
    try {
      const uploaded: MessageAttachment[] = []
      for (const file of pendingFiles) {
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch(`/api/admin/orgs/${orgId}/threads/${thread.id}/attachments`, {
          method: 'POST',
          body: fd,
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({})) as { error?: string }
          setError(data.error ?? 'An attachment could not be uploaded. Try again.')
          return
        }
        uploaded.push(await res.json() as MessageAttachment)
      }

      const res = await fetch(`/api/admin/orgs/${orgId}/threads/${thread.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: replyBody.trim(),
          channel: replyChannel,
          ...(uploaded.length > 0 ? { attachments: uploaded } : {}),
        }),
      })
      if (!res.ok) {
        setError('Message could not be sent. Check the form and try again.')
        return
      }
      setReplyBody('')
      setPendingFiles([])
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
                {msg.attachments && msg.attachments.length > 0 && (
                  <div className={cn('flex flex-wrap gap-2 pt-1', isPlatform ? 'justify-end' : '')}>
                    {msg.attachments.map((att, i) => (
                      <AttachmentDisplay key={i} attachment={att} />
                    ))}
                  </div>
                )}
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
        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {pendingFiles.map((f, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-border bg-muted text-xs"
              >
                <span className="truncate max-w-[140px]">{f.name}</span>
                <span className="text-muted-foreground">({fmtSize(f.size)})</span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="ml-0.5 text-muted-foreground hover:text-foreground"
                  aria-label={`Remove ${f.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2 items-end">
          <div className="flex flex-col gap-0.5 shrink-0">
            <select
              value={replyChannel}
              onChange={e => setReplyChannel(e.target.value as MessageChannel)}
              className="px-2 py-2 rounded-lg border border-border bg-background text-xs"
            >
              <option value="in_app">In-App</option>
              <option value="email">Email</option>
              <option value="note">Note</option>
              <option value="call_log">Call Log</option>
            </select>
            {autoChannel && (
              <span className="text-[10px] text-muted-foreground px-0.5">
                Auto: {autoChannel === 'in_app' ? 'in-app' : autoChannel}
              </span>
            )}
          </div>
          <div className="flex-1 relative">
            <textarea
              value={replyBody}
              onChange={e => setReplyBody(e.target.value)}
              placeholder={PLACEHOLDERS[replyChannel]}
              rows={3}
              className="w-full px-3 py-2 pr-9 rounded-lg border border-border bg-background text-sm resize-none"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-2 right-2 p-1 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors"
              aria-label="Attach files"
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
          <Button size="sm" disabled={sending || !replyBody.trim()} onClick={() => void handleSend()}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send'}
          </Button>
        </div>
      </div>
    </div>
  )
}
