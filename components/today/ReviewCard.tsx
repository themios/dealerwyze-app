'use client'

import { useState } from 'react'
import { Star, MessageSquare, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Review {
  id:           string
  author_name:  string | null
  rating:       number
  comment:      string | null
  create_time:  string
  reply_comment: string | null
}

interface Props {
  review:    Review
  onReplied: (id: string, reply: string) => void
}

export default function ReviewCard({ review, onReplied }: Props) {
  const [open,   setOpen]   = useState(false)
  const [text,   setText]   = useState('')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  const authorName = review.author_name ?? 'Anonymous'

  const borderColor = review.rating <= 2
    ? 'border-red-500/30 bg-red-500/5'
    : review.rating === 3
    ? 'border-yellow-500/30 bg-yellow-500/5'
    : 'border-green-500/30 bg-green-500/5'

  async function handleReply() {
    if (!text.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/reviews/${review.id}/reply`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ reply: text }),
      })
      setSaving(false)
      if (!res.ok) {
        setError('Failed to post reply. Try again.')
      } else {
        onReplied(review.id, text)
        setOpen(false)
        setText('')
      }
    } catch {
      setSaving(false)
      setError('Network error. Try again.')
    }
  }

  return (
    <div className={`rounded-lg border-2 ${borderColor} p-4 space-y-2`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-sm">{authorName}</p>
          <div className="flex gap-0.5 mt-0.5">
            {Array.from({ length: 5 }, (_, i) => (
              <Star
                key={i}
                className={`h-3.5 w-3.5 ${i < review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'}`}
              />
            ))}
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground shrink-0">
          {new Date(review.create_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </p>
      </div>

      {review.comment && (
        <p className="text-xs text-muted-foreground italic">&quot;{review.comment}&quot;</p>
      )}

      {review.reply_comment ? (
        <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0 text-green-500" />
          <p>Replied: &quot;{review.reply_comment}&quot;</p>
        </div>
      ) : !open ? (
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => setOpen(true)}>
          <MessageSquare className="h-3.5 w-3.5" />
          Quick Reply
        </Button>
      ) : (
        <div className="space-y-2">
          <textarea
            className="w-full text-sm border rounded-md px-3 py-2 bg-background resize-none h-20"
            placeholder="Type your reply…"
            value={text}
            onChange={e => setText(e.target.value)}
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1 h-8 text-xs"
              onClick={handleReply}
              disabled={saving || !text.trim()}
            >
              {saving ? 'Posting…' : 'Post Reply'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              onClick={() => { setOpen(false); setText(''); setError(null) }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
