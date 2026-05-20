'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatRelativeTime } from '@/lib/utils/relativeTime'
import type { DealerMessage, DealerThread, ThreadStatus } from '@/app/(app)/admin/orgs/[id]/dealer-inbox.types'

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

export default function MessagesClient({ orgId }: { orgId: string }) {
  const [threads, setThreads]               = useState<DealerThread[]>([])
  const [threadsLoading, setThreadsLoading] = useState(true)
  const [selectedThread, setSelectedThread] = useState<DealerThread | null>(null)
  const [messages, setMessages]             = useState<DealerMessage[]>([])
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [replyBody, setReplyBody]           = useState('')
  const [sending, setSending]               = useState(false)
  const [error, setError]                   = useState<string | null>(null)

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

  useEffect(() => { void loadThreads() }, [loadThreads])

  async function handleSend() {
    if (!selectedThread || !replyBody.trim() || sending) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/dealer-inbox/threads/${selectedThread.id}/messages`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ body: replyBody.trim() }),
      })
      if (!res.ok) {
        setError('Your reply could not be sent. Try again.')
        return
      }
      setReplyBody('')
      await loadMessages(selectedThread.id)
    } catch {
      setError('Your reply could not be sent. Check your connection.')
    } finally {
      setSending(false)
    }
  }

  function handleBack() {
    setSelectedThread(null)
    setMessages([])
    void loadThreads()
  }

  if (selectedThread) {
    return (
      <div className="px-4 py-4 max-w-2xl mx-auto flex flex-col min-h-[60vh]">
        <div className="shrink-0 flex items-start gap-2 pb-3 border-b">
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
        {error && <p className="text-xs text-destructive mt-2">{error}</p>}

        <div className="flex-1 overflow-y-auto py-4 space-y-3 min-h-[200px]">
          {messagesLoading && (
            <div className="flex justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!messagesLoading && messages.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">No messages yet.</p>
          )}
          {!messagesLoading && messages.map(msg => {
            if (msg.sender_type === 'system') {
              return (
                <p key={msg.id} className="text-center text-[11px] text-muted-foreground">
                  {msg.body} · {fmtTime(msg.sent_at)}
                </p>
              )
            }
            const isPlatform = msg.sender_type === 'platform'
            return (
              <div key={msg.id} className={`flex ${isPlatform ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[85%] space-y-1">
                  <div className={`px-3 py-2 text-sm whitespace-pre-wrap ${
                    isPlatform
                      ? 'bg-primary text-primary-foreground rounded-2xl rounded-tr-sm'
                      : 'bg-muted rounded-2xl rounded-tl-sm'
                  }`}>
                    {msg.body}
                  </div>
                  <p className={`text-[10px] text-muted-foreground ${isPlatform ? 'text-right' : ''}`}>
                    {msg.sender_display_name ?? (isPlatform ? 'DealerWyze' : 'You')} · {fmtTime(msg.sent_at)}
                  </p>
                </div>
              </div>
            )
          })}
        </div>

        <div className="shrink-0 pt-3 border-t flex gap-2 items-end">
          <textarea
            value={replyBody}
            onChange={e => setReplyBody(e.target.value)}
            placeholder="Reply to DealerWyze…"
            rows={3}
            className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none"
          />
          <Button size="sm" disabled={sending || !replyBody.trim()} onClick={() => void handleSend()}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send'}
          </Button>
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
