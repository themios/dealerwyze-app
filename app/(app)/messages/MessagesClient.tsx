'use client'

import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Loader2, ArrowLeft, Paperclip, X, Download,
  MessageSquare, Mail, Send,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/lib/utils/relativeTime'
import { createClient } from '@/lib/supabase/client'
import type {
  DealerMessage, DealerThread, MessageAttachment, ThreadStatus,
} from '@/app/(app)/admin/orgs/[id]/dealer-inbox.types'

// ─── Constants ────────────────────────────────────────────────────────────────

type DealerTab = 'in_app' | 'email'

const TYPE_BADGE: Record<DealerThread['thread_type'], string> = {
  success: 'bg-green-100 text-green-700',
  support: 'bg-orange-100 text-orange-700',
  billing: 'bg-amber-100 text-amber-700',
  sales:   'bg-blue-100 text-blue-700',
}

const STATUS_BADGE: Record<ThreadStatus, string> = {
  open:     'bg-blue-50 text-blue-600',
  resolved: 'bg-gray-100 text-gray-500',
  archived: 'bg-gray-100 text-gray-400',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(d: string) {
  return new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ─── Attachment ───────────────────────────────────────────────────────────────

function AttachmentDisplay({ attachment }: { attachment: MessageAttachment }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const isImage = attachment.type.startsWith('image/')

  useEffect(() => {
    createClient().storage
      .from('dealer-attachments')
      .createSignedUrl(attachment.path, 3600)
      .then(({ data }) => { if (data?.signedUrl) setSignedUrl(data.signedUrl) })
      .catch(() => {})
  }, [attachment.path])

  if (isImage) {
    return (
      <a href={signedUrl ?? '#'} target="_blank" rel="noopener noreferrer" className="block">
        {signedUrl
          ? <Image src={signedUrl} alt={attachment.name} width={128} height={128} unoptimized className="max-h-32 w-auto rounded-lg border border-border object-cover" />
          : <span className="text-[11px] text-muted-foreground">{attachment.name}</span>
        }
      </a>
    )
  }

  return (
    <a
      href={signedUrl ?? '#'} target="_blank" rel="noopener noreferrer"
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border bg-background text-xs text-foreground hover:bg-muted transition-colors',
        !signedUrl && 'pointer-events-none opacity-60',
      )}
    >
      <Download className="h-3 w-3 shrink-0" />
      <span className="truncate max-w-[160px]">{attachment.name}</span>
      <span className="text-muted-foreground shrink-0">({fmtSize(attachment.size)})</span>
    </a>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MessagesClient({ orgId }: { orgId: string }) {
  const [threads, setThreads]               = useState<DealerThread[]>([])
  const [threadsLoading, setThreadsLoading] = useState(true)
  const [selectedThread, setSelectedThread] = useState<DealerThread | null>(null)
  const [messages, setMessages]             = useState<DealerMessage[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [activeTab, setActiveTab]           = useState<DealerTab>('in_app')
  const [showDetail, setShowDetail]         = useState(false)
  const [replyBody, setReplyBody]           = useState('')
  const [pendingFiles, setPendingFiles]     = useState<File[]>([])
  const [sending, setSending]               = useState(false)
  const [error, setError]                   = useState<string | null>(null)
  const fileInputRef                        = useRef<HTMLInputElement>(null)
  const bottomRef                           = useRef<HTMLDivElement>(null)
  const autoSelectedRef                     = useRef(false)

  // ── Data loading ─────────────────────────────────────────────────────────────

  const loadThreads = useCallback(async () => {
    setThreadsLoading(true)
    try {
      const res = await fetch('/api/dealer-inbox/threads')
      if (res.ok) setThreads(await res.json() as DealerThread[])
    } catch { /* silent */ }
    finally { setThreadsLoading(false) }
  }, [])

  const loadMessages = useCallback(async (threadId: string) => {
    setMessagesLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/dealer-inbox/threads/${threadId}`)
      if (!res.ok) { setError('Could not load this conversation.'); return }
      const data = await res.json() as { thread: DealerThread; messages: DealerMessage[] }
      setSelectedThread(data.thread)
      setMessages(data.messages)
    } catch {
      setError('Could not load this conversation. Check your connection.')
    } finally {
      setMessagesLoading(false)
    }
  }, [])

  useEffect(() => { void loadThreads() }, [loadThreads])

  // Auto-open best thread on initial load only
  useEffect(() => {
    if (autoSelectedRef.current || threads.length === 0) return
    autoSelectedRef.current = true
    const best = threads.reduce((a, b) =>
      b.unread_count > a.unread_count ? b
        : (a.unread_count > 0 ? a : (b.updated_at > a.updated_at ? b : a))
    )
    void loadMessages(best.id)
  }, [threads, loadMessages])

  // ── Realtime ─────────────────────────────────────────────────────────────────

  const activeThreadId = selectedThread?.id ?? null

  useEffect(() => {
    if (!activeThreadId) return
    const supabase = createClient()
    const channel = supabase
      .channel(`dealer_inbox:${activeThreadId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'dealer_messages',
        filter: `thread_id=eq.${activeThreadId}`,
      }, (payload) => {
        const row = payload.new as DealerMessage
        setMessages(prev => prev.some(m => m.id === row.id) ? prev : [...prev, row])
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [activeThreadId])

  // Polling fallback
  useEffect(() => {
    if (!activeThreadId) return
    const poll = async () => {
      try {
        const res = await fetch(`/api/dealer-inbox/threads/${activeThreadId}`)
        if (!res.ok) return
        const data = await res.json() as { thread: DealerThread; messages: DealerMessage[] }
        setMessages(prev => data.messages.length === prev.length ? prev : data.messages)
      } catch { /* silent */ }
    }
    const id = setInterval(() => void poll(), 10_000)
    return () => clearInterval(id)
  }, [activeThreadId])

  // Scroll on new messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  }, [messages])

  // ── Actions ──────────────────────────────────────────────────────────────────

  function selectThread(thread: DealerThread) {
    setSelectedThread(thread)
    setShowDetail(true)
    setReplyBody('')
    setPendingFiles([])
    setError(null)
    void loadMessages(thread.id)
  }

  function handleBack() {
    setShowDetail(false)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPendingFiles(prev => [...prev, ...Array.from(e.target.files ?? [])])
    e.target.value = ''
  }

  async function handleSend() {
    if (!selectedThread || (!replyBody.trim() && pendingFiles.length === 0) || sending) return
    setSending(true)
    setError(null)
    try {
      const uploaded: MessageAttachment[] = []
      for (const file of pendingFiles) {
        const fd = new FormData()
        fd.append('file', file)
        const r = await fetch(`/api/dealer-inbox/threads/${selectedThread.id}/attachments`, { method: 'POST', body: fd })
        if (!r.ok) {
          const d = await r.json().catch(() => ({})) as { error?: string }
          setError(d.error ?? 'Attachment upload failed.')
          return
        }
        uploaded.push(await r.json() as MessageAttachment)
      }
      const res = await fetch(`/api/dealer-inbox/threads/${selectedThread.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: replyBody.trim(), channel: activeTab, ...(uploaded.length > 0 ? { attachments: uploaded } : {}) }),
      })
      if (!res.ok) { setError('Could not send. Try again.'); return }
      setReplyBody('')
      setPendingFiles([])
      await loadMessages(selectedThread.id)
    } catch {
      setError('Could not send. Check your connection.')
    } finally {
      setSending(false)
    }
  }

  // ── Thread list (shared between desktop left pane + mobile full-screen) ───────

  const threadList = (
    <div className="flex flex-col h-full">
      <div className="shrink-0 px-4 py-4 border-b">
        <h1 className="text-lg font-semibold text-foreground">Messages</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Your conversations with DealerWyze</p>
      </div>
      <div className="flex-1 overflow-y-auto">
        {threadsLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : threads.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground px-4">
            No messages yet. Your DealerWyze team will reach out here.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {threads.map(t => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => selectThread(t)}
                  className={cn(
                    'w-full text-left px-4 py-3 flex items-start gap-3 transition-colors',
                    selectedThread?.id === t.id ? 'bg-muted' : 'hover:bg-muted/50',
                  )}
                >
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={cn('text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded', TYPE_BADGE[t.thread_type])}>
                        {t.thread_type}
                      </span>
                      {t.status !== 'open' && (
                        <span className={cn('text-[10px] px-1.5 py-0.5 rounded capitalize', STATUS_BADGE[t.status])}>
                          {t.status}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-foreground truncate">{t.subject}</p>
                    {t.last_message_at && (
                      <p className="text-[11px] text-muted-foreground">{formatRelativeTime(t.last_message_at)}</p>
                    )}
                  </div>
                  {t.message_count > 0 && (
                    <span className={cn(
                      'shrink-0 inline-flex items-center justify-center rounded-full px-1.5 text-[10px] font-bold mt-1 min-w-[1.25rem] h-5',
                      t.unread_count > 0 ? 'bg-red-500 text-white' : 'bg-muted text-muted-foreground',
                    )}>
                      {t.unread_count > 0 ? `${t.unread_count} / ${t.message_count}` : t.message_count}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )

  // ── Thread detail ─────────────────────────────────────────────────────────────

  const visibleMessages = messages.filter(m => m.channel === activeTab || m.sender_type === 'system')

  // Per-channel stats: unread for dealer = platform messages not yet read
  const statsByTab = (tab: DealerTab) => {
    const ch_msgs = messages.filter(m => m.channel === tab)
    const unread  = ch_msgs.filter(m => m.sender_type === 'platform' && m.read_at === null).length
    return { total: ch_msgs.length, unread }
  }

  const detailPanel = selectedThread ? (
    <div className="flex flex-col h-full">

      {/* Frozen header */}
      <div className="shrink-0 border-b bg-background">
        <div className="px-4 py-3 flex items-center gap-2">
          {/* Mobile back button */}
          <button
            type="button"
            onClick={handleBack}
            className="md:hidden p-1 -ml-1 rounded-md hover:bg-muted text-muted-foreground"
            aria-label="Back to conversations"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground truncate">{selectedThread.subject}</h2>
              <span className={cn('text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded', TYPE_BADGE[selectedThread.thread_type])}>
                {selectedThread.thread_type}
              </span>
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded capitalize', STATUS_BADGE[selectedThread.status])}>
                {selectedThread.status}
              </span>
            </div>
          </div>
        </div>

        {/* Channel tabs — frozen */}
        <div className="flex border-t px-1">
          {([
            { tab: 'in_app' as DealerTab, label: 'Messages', icon: MessageSquare, accent: 'text-blue-600 border-blue-500' },
            { tab: 'email'  as DealerTab, label: 'Emails',   icon: Mail,          accent: 'text-amber-600 border-amber-500' },
          ]).map(({ tab, label, icon: Icon, accent }) => {
            const { total, unread } = statsByTab(tab)
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors',
                  activeTab === tab
                    ? cn('border-current -mb-px bg-transparent', accent)
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {label}
                {total > 0 && (
                  <span className={cn(
                    'text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center',
                    unread > 0 ? 'bg-red-500 text-white' : 'bg-muted text-muted-foreground',
                  )}>
                    {unread > 0 ? `${unread} / ${total}` : total}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Scrollable messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
        {error && <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>}
        {messagesLoading && (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {!messagesLoading && visibleMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
            {activeTab === 'in_app' ? <MessageSquare className="h-8 w-8 opacity-20" /> : <Mail className="h-8 w-8 opacity-20" />}
            <p className="text-sm">No {activeTab === 'in_app' ? 'messages' : 'emails'} yet.</p>
          </div>
        )}
        {!messagesLoading && visibleMessages.map(msg => {
          if (msg.sender_type === 'system') {
            return <p key={msg.id} className="text-center text-[11px] text-muted-foreground">{msg.body} · {fmtTime(msg.sent_at)}</p>
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
                  {msg.sender_display_name ?? (isPlatform ? 'DealerWyze' : 'You')} · {fmtTime(msg.sent_at)}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Fixed composer */}
      <div className="shrink-0 border-t px-4 py-3 space-y-2 bg-background">
        {pendingFiles.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {pendingFiles.map((f, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-border bg-muted text-xs">
                  <span className="truncate max-w-[140px]">{f.name}</span>
                  <span className="text-muted-foreground">({fmtSize(f.size)})</span>
                  <button
                    type="button"
                    onClick={() => setPendingFiles(p => p.filter((_, j) => j !== i))}
                    className="ml-0.5 text-muted-foreground hover:text-foreground"
                    aria-label={`Remove ${f.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className={cn(
            'rounded-xl border-2 p-2.5 space-y-2',
            activeTab === 'email'
              ? 'border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/20'
              : 'border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-950/20',
          )}>
            <textarea
              value={replyBody}
              onChange={e => setReplyBody(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void handleSend() }}
              placeholder={activeTab === 'email' ? 'Send an email to DealerWyze…' : 'Message DealerWyze…'}
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
                className="sr-only"
              />
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground hidden sm:block">⌘↵</span>
                <Button
                  size="sm"
                  disabled={sending || (!replyBody.trim() && pendingFiles.length === 0)}
                  onClick={() => void handleSend()}
                  className="gap-1.5"
                >
                  {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  {activeTab === 'email' ? 'Send Email' : 'Send Message'}
                </Button>
              </div>
            </div>
          </div>
      </div>
    </div>
  ) : (
    <div className="hidden md:flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
      <MessageSquare className="h-10 w-10 opacity-20" />
      <p className="text-sm">Select a conversation</p>
    </div>
  )

  return (
    <div className="flex h-full">
      {/* Desktop: left thread list pane */}
      <div className="hidden md:flex flex-col w-72 shrink-0 border-r h-full overflow-hidden">
        {threadList}
      </div>

      {/* Desktop: right detail pane */}
      <div className="hidden md:flex flex-col flex-1 min-w-0 h-full overflow-hidden">
        {detailPanel}
      </div>

      {/* Mobile: thread list or detail */}
      <div className="flex md:hidden flex-col flex-1 h-full overflow-hidden">
        {showDetail && selectedThread ? detailPanel : threadList}
      </div>
    </div>
  )
}
