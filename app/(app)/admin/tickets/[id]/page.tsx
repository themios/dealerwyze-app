'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Loader2, Send, Lock } from 'lucide-react'

interface Message {
  id: string; author_name: string | null; body: string; is_internal: boolean; created_at: string
}
interface Ticket {
  id: string; subject: string; status: string; priority: string; created_at: string
  organizations: { name: string } | null
}

const STATUS_STYLE: Record<string, string> = {
  open: 'bg-blue-100 text-blue-700', in_progress: 'bg-yellow-100 text-yellow-700',
  resolved: 'bg-green-100 text-green-700', closed: 'bg-gray-100 text-gray-500',
}

function fmtTime(d: string) {
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function AdminTicketDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router  = useRouter()
  const bottomRef = useRef<HTMLDivElement>(null)

  const [ticket, setTicket]     = useState<Ticket | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading]   = useState(true)
  const [reply, setReply]       = useState('')
  const [internal, setInternal] = useState(false)
  const [sending, setSending]   = useState(false)
  const [updating, setUpdating] = useState(false)

  function load() {
    return fetch(`/api/admin/tickets/${id}`)
      .then(r => r.json())
      .then((d: { ticket: Ticket; messages: Message[] }) => {
        setTicket(d.ticket); setMessages(d.messages); setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function doAction(action: string, extra: Record<string, unknown> = {}) {
    setUpdating(true)
    await fetch(`/api/admin/tickets/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...extra }),
    })
    setUpdating(false)
    load()
  }

  async function handleSend() {
    if (!reply.trim()) return
    setSending(true)
    await fetch(`/api/admin/tickets/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: internal ? 'internal_note' : 'reply', message: reply }),
    })
    setSending(false)
    setReply('')
    load()
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
  if (!ticket) return <div className="px-4 py-10 text-center text-sm text-muted-foreground">Ticket not found.</div>

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-3 space-y-2">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/admin/tickets')} className="text-muted-foreground">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{ticket.subject}</p>
            <p className="text-xs text-muted-foreground">{ticket.organizations?.name ?? '—'}</p>
          </div>
          <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[ticket.status] ?? ''}`}>
            {ticket.status.replace('_', ' ')}
          </span>
        </div>
        {/* Controls */}
        <div className="flex gap-2">
          <Select
            value={ticket.status}
            onValueChange={v => doAction('update_status', { status: v })}
            disabled={updating}
          >
            <SelectTrigger className="h-8 text-xs flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {['open','in_progress','resolved','closed'].map(s => (
                <SelectItem key={s} value={s}>{s.replace('_',' ')}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={ticket.priority}
            onValueChange={v => doAction('update_priority', { priority: v })}
            disabled={updating}
          >
            <SelectTrigger className="h-8 text-xs flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {['urgent','high','normal','low'].map(p => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-40">
        {messages.map(m => {
          const isDealer = !m.is_internal && m.author_name !== 'Apollo Support'
          return (
            <div key={m.id} className={`flex ${isDealer ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${
                m.is_internal
                  ? 'bg-yellow-50 border border-yellow-200 rounded-tl-sm'
                  : isDealer
                    ? 'bg-primary text-primary-foreground rounded-tr-sm'
                    : 'bg-muted rounded-tl-sm'
              }`}>
                <div className="flex items-center gap-1.5 mb-0.5">
                  {m.is_internal && <Lock className="h-3 w-3 text-yellow-600" />}
                  <p className="text-[10px] font-semibold opacity-70">
                    {m.is_internal ? 'Internal note' : (m.author_name ?? 'Unknown')}
                  </p>
                </div>
                <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                <p className="text-[10px] mt-1 opacity-50">{fmtTime(m.created_at)}</p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Reply box */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md border-t bg-background px-4 py-3 space-y-2">
        <div className="flex gap-2 items-center">
          <button
            onClick={() => setInternal(false)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${!internal ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground'}`}
          >
            Reply
          </button>
          <button
            onClick={() => setInternal(true)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors flex items-center gap-1 ${internal ? 'bg-yellow-100 text-yellow-700 border-yellow-300' : 'border-border text-muted-foreground'}`}
          >
            <Lock className="h-3 w-3" /> Internal note
          </button>
        </div>
        <div className="flex gap-2">
          <Textarea
            placeholder={internal ? 'Internal note (dealer cannot see this)…' : 'Reply to dealer…'}
            value={reply}
            onChange={e => setReply(e.target.value)}
            rows={2}
            className="resize-none flex-1"
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
          />
          <Button size="icon" onClick={handleSend} disabled={sending || !reply.trim()}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  )
}
