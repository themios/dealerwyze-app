'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ArrowLeft, Loader2, Send } from 'lucide-react'

interface Message {
  id: string
  author_name: string | null
  body: string
  is_internal: boolean
  created_at: string
}
interface Ticket {
  id: string; subject: string; status: string; priority: string; created_at: string
}

const STATUS_STYLE: Record<string, string> = {
  open:        'bg-blue-100 text-blue-700',
  in_progress: 'bg-yellow-100 text-yellow-700',
  resolved:    'bg-green-100 text-green-700',
  closed:      'bg-gray-100 text-gray-500',
}

function fmtTime(d: string) {
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function SupportThreadPage() {
  const { id } = useParams<{ id: string }>()
  const router  = useRouter()
  const bottomRef = useRef<HTMLDivElement>(null)

  const [ticket, setTicket]     = useState<Ticket | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading]   = useState(true)
  const [reply, setReply]       = useState('')
  const [sending, setSending]   = useState(false)

  useEffect(() => {
    fetch(`/api/support/tickets/${id}`)
      .then(r => r.json())
      .then((d: { ticket: Ticket; messages: Message[] }) => {
        setTicket(d.ticket)
        setMessages(d.messages)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    if (!reply.trim()) return
    setSending(true)
    const res  = await fetch(`/api/support/tickets/${id}/messages`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ body: reply }),
    })
    const data = await res.json() as Message & { error?: string }
    setSending(false)
    if (res.ok) {
      setMessages(prev => [...prev, data])
      setReply('')
    }
  }

  if (loading) return (
    <div className="flex justify-center py-20"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
  )

  if (!ticket) return (
    <div className="px-4 py-10 text-center text-sm text-muted-foreground">Ticket not found.</div>
  )

  const isClosed = ticket.status === 'closed'

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-3 flex items-center gap-3">
        <button onClick={() => router.push('/support')} className="text-muted-foreground" title="Go back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{ticket.subject}</p>
        </div>
        <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[ticket.status] ?? 'bg-gray-100 text-gray-500'}`}>
          {ticket.status.replace('_', ' ')}
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-32">
        {messages.map(m => {
          const isAdmin = m.author_name === 'Apollo Support' || m.is_internal
          return (
            <div key={m.id} className={`flex ${isAdmin ? 'justify-start' : 'justify-end'}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${isAdmin ? 'bg-muted text-foreground rounded-tl-sm' : 'bg-primary text-primary-foreground rounded-tr-sm'}`}>
                {isAdmin && <p className="text-[10px] font-semibold mb-0.5 opacity-70">Apollo Support</p>}
                <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                <p className={`text-[10px] mt-1 ${isAdmin ? 'text-muted-foreground' : 'text-primary-foreground/60'}`}>
                  {fmtTime(m.created_at)}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Reply box */}
      {!isClosed && (
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md border-t bg-background px-4 py-3 flex gap-2">
          <Textarea
            placeholder="Reply…"
            value={reply}
            onChange={e => setReply(e.target.value)}
            rows={2}
            className="resize-none flex-1"
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
          />
          <Button size="icon" onClick={handleSend} disabled={sending || !reply.trim()} title="Send message">
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      )}
      {isClosed && (
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md border-t bg-background px-4 py-3">
          <p className="text-xs text-center text-muted-foreground">This ticket is closed.</p>
        </div>
      )}
    </div>
  )
}
