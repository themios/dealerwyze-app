'use client'

import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Loader2, ArrowLeft, Paperclip, X, Download, MessageSquare, Mail, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/lib/utils/relativeTime'
import { createClient } from '@/lib/supabase/client'
import type { DealerMessage, DealerThread, MessageAttachment, ThreadStatus } from '@/app/(app)/admin/orgs/[id]/dealer-inbox.types'

const TYPE_BADGE: Record<DealerThread['thread_type'], string> = {
  success: 'bg-green-100 text-green-700',
  support: 'bg-orange-100 text-orange-700',
  billing: 'bg-amber-100 text-amber-700',
  sales:   'bg-blue-100 text-blue-700',
}

const STATUS_BADGE: Record<Exclude<ThreadStatus, 'open'>, string> = {
  resolved: 'bg-gray-100 text-gray-600',
  archived: 'bg-gray-100 text-gray-500',
}

function fmtTime(d: string) {
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
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

type DealerTab = 'in_app' | 'email'

export default function MessagesClient({ orgId }: { orgId: string }) {
  const [threads, setThreads]               = useState<DealerThread[]>([])
  const [threadsLoading, setThreadsLoading] = useState(true)
  const [selectedThread, setSelectedThread] = useState<DealerThread | null>(null)
  const [messages, setMessages]             = useState<DealerMessage[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [activeTab, setActiveTab]           = useState<DealerTab>('in_app')
  const [replyBody, setReplyBody]           = useState('')
  const [pendingFiles, setPendingFiles]     = useState<File[]>([])
  const [sending, setSending]               = useState(false)
  const [error, setError]                   = useState<string | null>(null)
  const fileInputRef                        = useRef<HTMLInputElement>(null)
  const bottomRef                           = useRef<HTMLDivElement>(null)

  const loadThreads = useCallback(async () => {
    setThreadsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/dealer-inbox/threads')
      if (!res.ok) {
        setError('Could not load messages. Refresh the page to try again.')
        return
      }
      setThreads(await res.json() as DealerThread[])
    } catch {
      setError('Could not load messages. Check your connection and refresh.')
    } finally {
      setThreadsLoading(false)
    }
  }, [])

  const loadMessages = useCallback(async (threadId: string) => {
    setMessagesLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/dealer-inbox/threads/${threadId}`)
      if (!res.ok) {
        setError('Could not load this conversation. Go back and try again.')
        return
      }
      const data = await res.json() as { thread: DealerThread; messages: DealerMessage[] }
      setSelectedThread(data.thread)
      setMessages(data.messages)
    } catch {
      setError('Could not load this conversation. Check your connection.')
    } finally {
      setMessagesLoading(false)
    }
  }, [])

  const activeThreadId = selectedThread?.id ?? null

  useEffect(() => {
    if (!activeThreadId) return
    const supabase = createClient()
    const channel = supabase
      .channel(`dealer_messages:${activeThreadId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dealer_messages', filter: `thread_id=eq.${activeThreadId}` },
        (payload) => {
          const row = payload.new as DealerMessage
          setMessages(prev => {
            if (prev.some(m => m.id === row.id)) return prev
            return [...prev, row]
          })
        },
      )
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [activeThreadId])

  // Scroll to bottom on new messages (initial load + realtime + send)
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
    }
  }, [messages])

  useEffect(() => { void loadThreads() }, [loadThreads])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? [])
    setPendingFiles(prev => [...prev, ...selected])
    e.target.value = ''
  }

  function removeFile(index: number) {
    setPendingFiles(prev => prev.filter((_, i) => i !== index))
  }

  async function handleSend() {
    if (!selectedThread || !replyBody.trim() || sending) return
    setSending(true)
    setError(null)
    try {
      const uploaded: MessageAttachment[] = []
      for (const file of pendingFiles) {
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch(`/api/dealer-inbox/threads/${selectedThread.id}/attachments`, {
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

      const res = await fetch(`/api/dealer-inbox/threads/${selectedThread.id}/messages`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          body: replyBody.trim(),
          ...(uploaded.length > 0 ? { attachments: uploaded } : {}),
        }),
      })
      if (!res.ok) {
        setError('Your reply could not be sent. Try again.')
        return
      }
      setReplyBody('')
      setPendingFiles([])
    } catch {
      setError('Your reply could not be sent. Check your connection.')
    } finally {
      setSending(false)
    }
  }

  function handleBack() {
    setSelectedThread(null)
    setMessages([])
    setPendingFiles([])
    void loadThreads()
  }

  if (selectedThread) {
    const visibleMessages = messages.filter(m =>
      m.channel === activeTab || m.sender_type === 'system'
    )
    const msgCount   = messages.filter(m => m.channel === 'in_app').length
    const emailCount = messages.filter(m => m.channel === 'email').length

    return (
      <div className="px-4 py-4 max-w-2xl mx-auto flex flex-col min-h-[60vh]">
        {/* Header */}
        <div className="shrink-0 pb-0 space-y-2">
          <div className="flex items-start gap-2">
            <button type="button" onClick={handleBack} className="mt-0.5 p-1 rounded-md hover:bg-muted" aria-label="Back">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold truncate">{selectedThread.subject}</h2>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${TYPE_BADGE[selectedThread.thread_type]}`}>
                  {selectedThread.thread_type}
                </span>
              </div>
            </div>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}

          {/* Tabs */}
          <div className="flex gap-0 border-b">
            {([
              { tab: 'in_app' as DealerTab, label: 'Messages', icon: MessageSquare, count: msgCount, accent: 'text-blue-600 border-blue-500' },
              { tab: 'email'  as DealerTab, label: 'Emails',   icon: Mail,           count: emailCount, accent: 'text-amber-600 border-amber-500' },
            ]).map(({ tab, label, icon: Icon, count, accent }) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors',
                  activeTab === tab
                    ? cn('border-current -mb-px', accent)
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
                {count > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-muted min-w-[1.25rem] text-center">
                    {count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto py-4 space-y-3 min-h-[200px]">
          {messagesLoading && <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
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
              <div key={msg.id} className={`flex ${isPlatform ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[85%] space-y-1">
                  <div className={`px-3 py-2 text-sm whitespace-pre-wrap ${isPlatform ? 'bg-primary text-primary-foreground rounded-2xl rounded-tr-sm' : 'bg-muted rounded-2xl rounded-tl-sm'}`}>
                    {msg.body}
                  </div>
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className={cn('flex flex-wrap gap-2 pt-1', isPlatform ? 'justify-end' : '')}>
                      {msg.attachments.map((att, i) => <AttachmentDisplay key={i} attachment={att} />)}
                    </div>
                  )}
                  <p className={`text-[10px] text-muted-foreground ${isPlatform ? 'text-right' : ''}`}>
                    {msg.sender_display_name ?? (isPlatform ? 'DealerWyze' : 'You')} · {fmtTime(msg.sent_at)}
                  </p>
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>

        {/* Composer — only on Messages tab; Emails tab is read-only for dealers */}
        <div className="shrink-0 pt-3 border-t space-y-2">
          {activeTab === 'email' ? (
            <p className="text-xs text-muted-foreground text-center py-2">
              Emails are sent by your DealerWyze team. To reply, switch to{' '}
              <button type="button" className="underline font-medium" onClick={() => setActiveTab('in_app')}>Messages</button>
              {' '}or reply from your email app.
            </p>
          ) : (
            <>
              {pendingFiles.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {pendingFiles.map((f, i) => (
                    <span key={i} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-border bg-muted text-xs">
                      <span className="truncate max-w-[140px]">{f.name}</span>
                      <span className="text-muted-foreground">({fmtSize(f.size)})</span>
                      <button type="button" onClick={() => removeFile(i)} className="ml-0.5 text-muted-foreground hover:text-foreground" aria-label={`Remove ${f.name}`}>
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="rounded-xl border-2 border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-950/20 p-2.5 space-y-2">
                <textarea
                  value={replyBody}
                  onChange={e => setReplyBody(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void handleSend() }}
                  placeholder="Reply to DealerWyze…"
                  rows={3}
                  className="w-full bg-transparent text-sm resize-none outline-none placeholder:text-muted-foreground"
                />
                <div className="flex items-center justify-between">
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/60 transition-colors" aria-label="Attach files">
                    <Paperclip className="h-4 w-4" />
                  </button>
                  <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" onChange={handleFileChange} className="hidden" />
                  <Button size="sm" disabled={sending || !replyBody.trim()} onClick={() => void handleSend()} className="gap-1.5">
                    {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Send Message
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div key={orgId} className="px-4 py-4 max-w-2xl mx-auto space-y-4">
      <h1 className="text-lg font-semibold">Messages from DealerWyze</h1>
      {error && <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>}

      {threadsLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : threads.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">
          No messages yet. Your DealerWyze team will reach out here.
        </p>
      ) : (
        <div className="space-y-2">
          {threads.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => void loadMessages(t.id)}
              className="w-full text-left rounded-xl border bg-card px-3 py-3 flex items-center gap-3 hover:bg-muted/40 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${TYPE_BADGE[t.thread_type]}`}>
                    {t.thread_type}
                  </span>
                  <span className="text-sm font-semibold truncate">{t.subject}</span>
                </div>
                {t.message_count > 0 && t.last_message_at && (
                  <p className="text-[11px] text-muted-foreground truncate">
                    Last message · {formatRelativeTime(t.last_message_at)}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                {t.unread_count > 0 && (
                  <span className="text-[10px] font-bold bg-red-500 text-white rounded-full px-1.5 min-w-[1.25rem] text-center">
                    {t.unread_count}
                  </span>
                )}
                <span className="text-[10px] text-muted-foreground">{formatRelativeTime(t.updated_at)}</span>
                {t.status !== 'open' && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full capitalize ${STATUS_BADGE[t.status]}`}>
                    {t.status}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
