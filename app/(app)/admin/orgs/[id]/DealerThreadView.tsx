'use client'

import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Loader2, Mail, FileText, Phone, MessageSquare,
  ArrowLeft, Paperclip, X, Download, Zap, Send,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type {
  DealerMessage, DealerThread, MessageAttachment, MessageChannel, ThreadStatus,
} from './dealer-inbox.types'

// ─── Channel config ───────────────────────────────────────────────────────────

const CHANNEL_CONFIG: Record<MessageChannel, {
  label:       string
  icon:        React.ElementType
  description: string
  accent:      string   // Tailwind border + ring color
  badge:       string   // bubble label style
  composerBg:  string
  composerBorder: string
}> = {
  email: {
    label:          'Email',
    icon:           Mail,
    description:    'Sent to the dealer\'s email address',
    accent:         'border-amber-400 ring-amber-200',
    badge:          'bg-amber-50 text-amber-700 border-amber-200',
    composerBg:     'bg-amber-50/40 dark:bg-amber-950/20',
    composerBorder: 'border-amber-300 dark:border-amber-700',
  },
  in_app: {
    label:          'Message',
    icon:           MessageSquare,
    description:    'Appears instantly in the dealer app',
    accent:         'border-blue-400 ring-blue-200',
    badge:          'bg-blue-50 text-blue-700 border-blue-200',
    composerBg:     'bg-blue-50/40 dark:bg-blue-950/20',
    composerBorder: 'border-blue-300 dark:border-blue-700',
  },
  note: {
    label:          'Note',
    icon:           FileText,
    description:    'Private — only visible to your team',
    accent:         'border-slate-300 ring-slate-200',
    badge:          'bg-slate-100 text-slate-600 border-slate-200',
    composerBg:     'bg-slate-50/60 dark:bg-slate-900/30',
    composerBorder: 'border-slate-300 dark:border-slate-600',
  },
  call_log: {
    label:          'Call log',
    icon:           Phone,
    description:    'Record of a phone conversation',
    accent:         'border-violet-400 ring-violet-200',
    badge:          'bg-violet-50 text-violet-700 border-violet-200',
    composerBg:     'bg-violet-50/40 dark:bg-violet-950/20',
    composerBorder: 'border-violet-300 dark:border-violet-700',
  },
}

const PLACEHOLDERS: Record<MessageChannel, string> = {
  email:    'Write an email to this dealer…',
  note:     'Log a note — only your team will see this…',
  call_log: 'What was discussed on the call…',
  in_app:   'Send a message — appears in the dealer app instantly…',
}

const TYPE_BADGE: Record<DealerThread['thread_type'], string> = {
  success: 'bg-green-100 text-green-700',
  support: 'bg-orange-100 text-orange-700',
  billing: 'bg-amber-100 text-amber-700',
  sales:   'bg-blue-100 text-blue-700',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fmtTime(d: string) {
  return new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

// ─── Attachment display ───────────────────────────────────────────────────────

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

// ─── Channel mode switcher ────────────────────────────────────────────────────

const PRIMARY_CHANNELS: MessageChannel[]   = ['in_app', 'email']
const SECONDARY_CHANNELS: MessageChannel[] = ['note', 'call_log']

function ChannelSwitcher({
  value,
  onChange,
  autoChannel,
}: {
  value: MessageChannel
  onChange: (c: MessageChannel) => void
  autoChannel: MessageChannel | null
}) {
  return (
    <div className="space-y-2">
      {/* Primary channels */}
      <div className="flex gap-2">
        {PRIMARY_CHANNELS.map(ch => {
          const cfg   = CHANNEL_CONFIG[ch]
          const Icon  = cfg.icon
          const active = value === ch
          const isAuto = autoChannel === ch
          return (
            <button
              key={ch}
              type="button"
              onClick={() => onChange(ch)}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all duration-150',
                active
                  ? cn(cfg.accent, 'bg-background shadow-sm text-foreground')
                  : 'border-border bg-background text-muted-foreground hover:text-foreground hover:border-border/80',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{cfg.label}</span>
              {isAuto && (
                <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
                  <Zap className="h-2.5 w-2.5" />
                  Auto
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Secondary channels — compact */}
      <div className="flex gap-1.5">
        {SECONDARY_CHANNELS.map(ch => {
          const cfg  = CHANNEL_CONFIG[ch]
          const Icon = cfg.icon
          const active = value === ch
          return (
            <button
              key={ch}
              type="button"
              onClick={() => onChange(ch)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all',
                active
                  ? cn('border-2', cfg.accent, 'bg-background text-foreground shadow-sm')
                  : 'border-border bg-background text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-3 w-3 shrink-0" />
              {cfg.label}
            </button>
          )
        })}
        <span className="ml-auto text-[11px] text-muted-foreground self-center italic">
          {CHANNEL_CONFIG[value].description}
        </span>
      </div>
    </div>
  )
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: DealerMessage }) {
  const Icon  = CHANNEL_CONFIG[msg.channel]?.icon ?? FileText
  const label = msg.sender_display_name
    ?? (msg.sender_type === 'platform' ? 'DealerWyze'
      : msg.sender_type === 'dealer'   ? 'Dealer'
      : 'System')

  if (msg.sender_type === 'system') {
    return (
      <p className="text-center text-[11px] text-muted-foreground px-4">
        {msg.body} · {fmtTime(msg.sent_at)}
      </p>
    )
  }

  const isPlatform = msg.sender_type === 'platform'
  const cfg        = CHANNEL_CONFIG[msg.channel]

  return (
    <div className={cn('flex', isPlatform ? 'justify-end' : 'justify-start')}>
      <div className="max-w-[85%] space-y-1">
        <div className={cn(
          'px-3 py-2 text-sm whitespace-pre-wrap',
          isPlatform
            ? 'bg-primary text-primary-foreground rounded-2xl rounded-tr-sm'
            : 'bg-muted rounded-2xl rounded-tl-sm',
        )}>
          {msg.body}
        </div>

        {msg.attachments && msg.attachments.length > 0 && (
          <div className={cn('flex flex-wrap gap-2 pt-1', isPlatform ? 'justify-end' : '')}>
            {msg.attachments.map((att, i) => (
              <AttachmentDisplay key={i} attachment={att} />
            ))}
          </div>
        )}

        {/* Channel + sender + time */}
        <div className={cn(
          'flex items-center gap-1.5 text-[10px] text-muted-foreground',
          isPlatform ? 'justify-end' : '',
        )}>
          <span className={cn(
            'inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium',
            cfg?.badge ?? 'bg-muted text-muted-foreground border-border',
          )}>
            <Icon className="h-2.5 w-2.5" />
            {cfg?.label ?? msg.channel}
          </span>
          <span>{label} · {fmtTime(msg.sent_at)}</span>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

type Props = {
  orgId:           string
  thread:          DealerThread
  onBack:          () => void
  onThreadUpdated: (updated: DealerThread) => void
}

export default function DealerThreadView({ orgId, thread, onBack, onThreadUpdated }: Props) {
  const [messages, setMessages]         = useState<DealerMessage[]>([])
  const [loading, setLoading]           = useState(true)
  const [replyBody, setReplyBody]       = useState('')
  const [replyChannel, setReplyChannel] = useState<MessageChannel>('email')
  const [autoChannel, setAutoChannel]   = useState<MessageChannel | null>(null)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [sending, setSending]           = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const fileInputRef                    = useRef<HTMLInputElement>(null)
  const bottomRef                       = useRef<HTMLDivElement>(null)

  // Smart channel default based on dealer engagement
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

  // Realtime subscription for live messages
  useEffect(() => {
    const supabase = createClient()
    const channel  = supabase
      .channel(`dealer_messages:${thread.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'dealer_messages',
        filter: `thread_id=eq.${thread.id}`,
      }, (payload) => {
        const row = payload.new as DealerMessage & { sender_display_name?: string | null }
        setMessages(prev => {
          if (prev.some(m => m.id === row.id)) return prev
          return [...prev, { ...row, thread_id: thread.id }]
        })
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [thread.id])

  const loadMessages = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/orgs/${orgId}/threads/${thread.id}`)
      if (!res.ok) { setError('Could not load messages. Try again.'); return }
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

  // Scroll to bottom when messages load
  useEffect(() => {
    if (!loading) setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'instant' }), 50)
  }, [loading])

  async function handleStatusChange(status: ThreadStatus) {
    setError(null)
    const res = await fetch(`/api/admin/orgs/${orgId}/threads/${thread.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (!res.ok) { setError('Could not update status. Try again.'); return }
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
          method: 'POST', body: fd,
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
      if (!res.ok) { setError('Message could not be sent. Try again.'); return }
      setReplyBody('')
      setPendingFiles([])
      await loadMessages()
    } catch {
      setError('Message could not be sent. Check your connection and try again.')
    } finally {
      setSending(false)
    }
  }

  const cfg = CHANNEL_CONFIG[replyChannel]

  return (
    <div className="flex flex-col h-[min(70vh,600px)]">
      {/* Thread header */}
      <div className="shrink-0 space-y-2 pb-3 border-b">
        <div className="flex items-start gap-2">
          <button
            type="button"
            onClick={onBack}
            className="mt-0.5 p-1 rounded-md hover:bg-muted text-muted-foreground"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold truncate">{thread.subject}</h3>
              <span className={cn(
                'text-[10px] font-medium px-2 py-0.5 rounded-full capitalize',
                TYPE_BADGE[thread.thread_type],
              )}>
                {thread.thread_type}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-muted-foreground">
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

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-3 space-y-3 min-h-0">
        {loading && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {!loading && messages.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No messages yet.</p>
        )}
        {!loading && messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className={cn(
        'shrink-0 pt-3 border-t space-y-3 rounded-b-xl px-0.5',
      )}>
        <ChannelSwitcher
          value={replyChannel}
          onChange={setReplyChannel}
          autoChannel={autoChannel}
        />

        {/* Pending attachments */}
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

        {/* Textarea + send — themed by channel */}
        <div className={cn(
          'rounded-xl border-2 transition-all duration-150 p-2.5 space-y-2',
          cfg.composerBg,
          cfg.composerBorder,
        )}>
          <textarea
            value={replyBody}
            onChange={e => setReplyBody(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void handleSend()
            }}
            placeholder={PLACEHOLDERS[replyChannel]}
            rows={3}
            className="w-full bg-transparent text-sm resize-none outline-none placeholder:text-muted-foreground"
          />
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/60 transition-colors"
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
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground hidden sm:block">
                ⌘↵ to send
              </span>
              <Button
                size="sm"
                disabled={sending || !replyBody.trim()}
                onClick={() => void handleSend()}
                className="gap-1.5"
              >
                {sending
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Send className="h-3.5 w-3.5" />
                }
                Send {cfg.label}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
