'use client'

import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Loader2, Mail, FileText, Phone, MessageSquare,
  ArrowLeft, Paperclip, X, Download, Send, Zap,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import type {
  DealerMessage, DealerThread, MessageAttachment, MessageChannel, ThreadStatus,
} from './dealer-inbox.types'

// ─── Channel tab config ───────────────────────────────────────────────────────

type ChannelTab = { channel: MessageChannel; label: string; icon: React.ElementType; placeholder: string; accent: string; composerBg: string; composerBorder: string; sendLabel: string }

const TABS: ChannelTab[] = [
  {
    channel:       'in_app',
    label:         'Messages',
    icon:          MessageSquare,
    placeholder:   'Send a message — appears instantly in the dealer app…',
    accent:        'text-blue-600 border-blue-500',
    composerBg:    'bg-blue-50/50 dark:bg-blue-950/20',
    composerBorder:'border-blue-300 dark:border-blue-700',
    sendLabel:     'Send Message',
  },
  {
    channel:       'email',
    label:         'Email',
    icon:          Mail,
    placeholder:   'Write an email — sent to the dealer\'s email address…',
    accent:        'text-amber-600 border-amber-500',
    composerBg:    'bg-amber-50/50 dark:bg-amber-950/20',
    composerBorder:'border-amber-300 dark:border-amber-700',
    sendLabel:     'Send Email',
  },
  {
    channel:       'note',
    label:         'Notes',
    icon:          FileText,
    placeholder:   'Log an internal note — only your team sees this…',
    accent:        'text-slate-600 border-slate-400',
    composerBg:    'bg-slate-50/60 dark:bg-slate-900/30',
    composerBorder:'border-slate-300 dark:border-slate-600',
    sendLabel:     'Save Note',
  },
  {
    channel:       'call_log',
    label:         'Calls',
    icon:          Phone,
    placeholder:   'Log what was discussed on the call…',
    accent:        'text-violet-600 border-violet-500',
    composerBg:    'bg-violet-50/50 dark:bg-violet-950/20',
    composerBorder:'border-violet-300 dark:border-violet-700',
    sendLabel:     'Log Call',
  },
]

const TYPE_BADGE: Record<DealerThread['thread_type'], string> = {
  success: 'bg-green-100 text-green-700',
  support: 'bg-orange-100 text-orange-700',
  billing: 'bg-amber-100 text-amber-700',
  sales:   'bg-blue-100 text-blue-700',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtSize(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1048576).toFixed(1)} MB`
}

function fmtTime(d: string) {
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// ─── Attachment display ───────────────────────────────────────────────────────

function AttachmentDisplay({ attachment }: { attachment: MessageAttachment }) {
  const [url, setUrl] = useState<string | null>(null)
  const isImg = attachment.type.startsWith('image/')

  useEffect(() => {
    createClient().storage.from('dealer-attachments')
      .createSignedUrl(attachment.path, 3600)
      .then(({ data }) => { if (data?.signedUrl) setUrl(data.signedUrl) })
      .catch(() => {})
  }, [attachment.path])

  if (isImg) {
    return (
      <a href={url ?? '#'} target="_blank" rel="noopener noreferrer" className="block">
        {url
          ? <Image src={url} alt={attachment.name} width={128} height={128} unoptimized className="max-h-32 w-auto rounded-lg border border-border object-cover" />
          : <span className="text-[11px] text-muted-foreground">{attachment.name}</span>
        }
      </a>
    )
  }

  return (
    <a
      href={url ?? '#'} target="_blank" rel="noopener noreferrer"
      className={cn('inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground hover:bg-muted transition-colors', !url && 'pointer-events-none opacity-60')}
    >
      <Download className="h-3 w-3 shrink-0" />
      <span className="truncate max-w-[160px]">{attachment.name}</span>
      <span className="text-muted-foreground shrink-0">({fmtSize(attachment.size)})</span>
    </a>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

type Props = { orgId: string; thread: DealerThread; onBack: () => void; onThreadUpdated: (u: DealerThread) => void }

export default function DealerThreadView({ orgId, thread, onBack, onThreadUpdated }: Props) {
  const [messages, setMessages]         = useState<DealerMessage[]>([])
  const [loading, setLoading]           = useState(true)
  const [activeTab, setActiveTab]       = useState<MessageChannel>('in_app')
  const [autoChannel, setAutoChannel]   = useState<MessageChannel | null>(null)
  const [replyBody, setReplyBody]       = useState('')
  const [pendingFiles, setPendingFiles] = useState<File[]>([])
  const [sending, setSending]           = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const fileInputRef                    = useRef<HTMLInputElement>(null)
  const bottomRef                       = useRef<HTMLDivElement>(null)

  // Smart channel default — set activeTab to suggested channel
  useEffect(() => {
    fetch(`/api/admin/orgs/${orgId}/engagement`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { preferred_channel: MessageChannel } | null) => {
        const ch = data?.preferred_channel ?? 'email'
        setActiveTab(ch)
        setAutoChannel(ch)
      })
      .catch(() => {})
  }, [orgId])

  // Realtime — new messages
  useEffect(() => {
    const supabase = createClient()
    const ch = supabase
      .channel(`dealer_messages:${thread.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dealer_messages', filter: `thread_id=eq.${thread.id}` }, (payload) => {
        const row = payload.new as DealerMessage
        setMessages(prev => prev.some(m => m.id === row.id) ? prev : [...prev, { ...row, thread_id: thread.id }])
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
      })
      .subscribe()
    return () => { void supabase.removeChannel(ch) }
  }, [thread.id])

  const loadMessages = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/admin/orgs/${orgId}/threads/${thread.id}`)
      if (!res.ok) { setError('Could not load messages. Try again.'); return }
      const data = await res.json() as { messages: Array<Omit<DealerMessage, 'thread_id'> & { sender_display_name: string | null }> }
      setMessages(data.messages.map(m => ({ ...m, thread_id: thread.id })))
    } catch { setError('Could not load messages. Check your connection.') }
    finally { setLoading(false) }
  }, [orgId, thread.id])

  useEffect(() => { void loadMessages() }, [loadMessages])
  useEffect(() => { if (!loading) setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'instant' }), 50) }, [loading])

  // Polling fallback — catches messages if realtime websocket drops
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch(`/api/admin/orgs/${orgId}/threads/${thread.id}`)
        if (!res.ok) return
        const data = await res.json() as { messages: Array<Omit<DealerMessage, 'thread_id'> & { sender_display_name: string | null }> }
        const fetched = data.messages.map(m => ({ ...m, thread_id: thread.id }))
        setMessages(prev => {
          if (fetched.length === prev.length) return prev
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
          return fetched
        })
      } catch { /* silent */ }
    }
    const id = setInterval(() => void poll(), 10_000)
    return () => clearInterval(id)
  }, [orgId, thread.id])

  async function handleStatusChange(status: ThreadStatus) {
    const res = await fetch(`/api/admin/orgs/${orgId}/threads/${thread.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    if (!res.ok) { setError('Could not update status.'); return }
    onThreadUpdated({ ...thread, status })
  }

  async function handleSend() {
    if ((!replyBody.trim() && pendingFiles.length === 0) || sending) return
    setSending(true); setError(null)
    try {
      const uploaded: MessageAttachment[] = []
      for (const file of pendingFiles) {
        const fd = new FormData(); fd.append('file', file)
        const r = await fetch(`/api/admin/orgs/${orgId}/threads/${thread.id}/attachments`, { method: 'POST', body: fd })
        if (!r.ok) { const d = await r.json().catch(() => ({})) as { error?: string }; setError(d.error ?? 'Attachment upload failed.'); return }
        uploaded.push(await r.json() as MessageAttachment)
      }
      const res = await fetch(`/api/admin/orgs/${orgId}/threads/${thread.id}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: replyBody.trim(), channel: activeTab, ...(uploaded.length > 0 ? { attachments: uploaded } : {}) }),
      })
      if (!res.ok) { setError('Message could not be sent. Try again.'); return }
      setReplyBody(''); setPendingFiles([])
      await loadMessages()
    } catch { setError('Message could not be sent. Check your connection.') }
    finally { setSending(false) }
  }

  // Per-channel total and unread (unread for admin = dealer messages not yet read)
  const statsByChannel = (ch: MessageChannel) => {
    const ch_msgs = messages.filter(m => m.channel === ch)
    const unread  = ch_msgs.filter(m => m.sender_type === 'dealer' && m.read_at === null).length
    return { total: ch_msgs.length, unread }
  }

  // Filtered messages for active tab — always show system messages
  const visibleMessages = messages.filter(m => m.channel === activeTab || m.sender_type === 'system')

  const tab = TABS.find(t => t.channel === activeTab) ?? TABS[0]

  return (
    <div className="flex flex-col h-[min(70vh,600px)]">
      {/* Header */}
      <div className="shrink-0 space-y-2 pb-2 border-b">
        <div className="flex items-start gap-2">
          <button type="button" onClick={onBack} className="mt-0.5 p-1 rounded-md hover:bg-muted text-muted-foreground" aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold truncate">{thread.subject}</h3>
              <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full capitalize', TYPE_BADGE[thread.thread_type])}>
                {thread.thread_type}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-muted-foreground">
              <label className="flex items-center gap-1.5">
                Status
                <select value={thread.status} onChange={e => void handleStatusChange(e.target.value as ThreadStatus)}
                  className="px-2 py-1 rounded-md border border-border bg-background text-foreground text-xs">
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

        {/* Channel tabs */}
        <div className="flex gap-0 border-b -mb-2">
          {TABS.map(t => {
            const Icon              = t.icon
            const { total, unread } = statsByChannel(t.channel)
            const isActive          = activeTab === t.channel
            const isAuto            = autoChannel === t.channel
            return (
              <button
                key={t.channel}
                type="button"
                onClick={() => setActiveTab(t.channel)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors',
                  isActive
                    ? cn('border-current -mb-px bg-transparent', t.accent)
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {t.label}
                {total > 0 && (
                  <span className={cn(
                    'text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center',
                    unread > 0 ? 'bg-red-500 text-white' : (isActive ? 'bg-current/10' : 'bg-muted'),
                  )}>
                    {unread > 0 ? `${unread} / ${total}` : total}
                  </span>
                )}
                {isAuto && !isActive && (
                  <Zap className="h-2.5 w-2.5 text-green-500" />
                )}
                {isAuto && isActive && (
                  <span className="text-[9px] font-semibold bg-green-100 text-green-700 px-1 py-0.5 rounded-full flex items-center gap-0.5">
                    <Zap className="h-2 w-2" />auto
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Messages — filtered to active tab */}
      <div className="flex-1 overflow-y-auto py-3 space-y-3 min-h-0">
        {loading && <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
        {!loading && visibleMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
            <tab.icon className="h-8 w-8 opacity-20" />
            <p className="text-sm">No {tab.label.toLowerCase()} yet.</p>
            <p className="text-xs opacity-70">Use the composer below to send the first one.</p>
          </div>
        )}
        {!loading && visibleMessages.map(msg => {
          if (msg.sender_type === 'system') {
            return <p key={msg.id} className="text-center text-[11px] text-muted-foreground px-4">{msg.body} · {fmtTime(msg.sent_at)}</p>
          }
          const isPlatform = msg.sender_type === 'platform'
          return (
            <div key={msg.id} className={cn('flex', isPlatform ? 'justify-end' : 'justify-start')}>
              <div className="max-w-[85%] space-y-1">
                <div className={cn('px-3 py-2 text-sm whitespace-pre-wrap', isPlatform ? 'bg-primary text-primary-foreground rounded-2xl rounded-tr-sm' : 'bg-muted rounded-2xl rounded-tl-sm')}>
                  {msg.body}
                </div>
                {msg.attachments && msg.attachments.length > 0 && (
                  <div className={cn('flex flex-wrap gap-2 pt-1', isPlatform ? 'justify-end' : '')}>
                    {msg.attachments.map((att, i) => <AttachmentDisplay key={i} attachment={att} />)}
                  </div>
                )}
                <p className={cn('text-[10px] text-muted-foreground', isPlatform ? 'text-right' : '')}>
                  {msg.sender_display_name ?? (isPlatform ? 'DealerWyze' : 'Dealer')} · {fmtTime(msg.sent_at)}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Composer — themed and labeled by active tab */}
      <div className="shrink-0 pt-3 border-t space-y-2">
        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {pendingFiles.map((f, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-border bg-muted text-xs">
                <span className="truncate max-w-[140px]">{f.name}</span>
                <span className="text-muted-foreground">({fmtSize(f.size)})</span>
                <button type="button" onClick={() => setPendingFiles(p => p.filter((_, j) => j !== i))} className="ml-0.5 text-muted-foreground hover:text-foreground" aria-label={`Remove ${f.name}`}>
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className={cn('rounded-xl border-2 transition-all duration-150 p-2.5 space-y-2', tab.composerBg, tab.composerBorder)}>
          <textarea
            value={replyBody}
            onChange={e => setReplyBody(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void handleSend() }}
            placeholder={tab.placeholder}
            rows={3}
            className="w-full bg-transparent text-sm resize-none outline-none placeholder:text-muted-foreground"
          />
          <div className="flex items-center justify-between">
            <button type="button" onClick={() => fileInputRef.current?.click()} className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/60 transition-colors" aria-label="Attach files">
              <Paperclip className="h-4 w-4" />
            </button>
            <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" onChange={e => { setPendingFiles(p => [...p, ...Array.from(e.target.files ?? [])]); e.target.value = '' }} className="hidden" />
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground hidden sm:block">⌘↵</span>
              <Button size="sm" disabled={sending || (!replyBody.trim() && pendingFiles.length === 0)} onClick={() => void handleSend()} className="gap-1.5">
                {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                {tab.sendLabel}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
