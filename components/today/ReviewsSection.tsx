'use client'

import { useState } from 'react'
import ReviewCard from './ReviewCard'

interface Review {
  id:           string
  author_name:  string | null
  rating:       number
  comment:      string | null
  create_time:  string
  reply_comment: string | null
}

interface Props {
  initialReviews: Review[]
}

export default function ReviewsSection({ initialReviews }: Props) {
  const [reviews, setReviews] = useState<Review[]>(initialReviews)

  function handleReplied(id: string, reply: string) {
    setReviews(prev =>
      prev.map(r => r.id === id ? { ...r, reply_comment: reply } : r)
    )
  }

  if (reviews.length === 0) return null

  return (
    <div className="px-4 pb-4 space-y-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Recent Reviews
      </p>
      <div className="space-y-3">
        {reviews.map(r => (
          <ReviewCard key={r.id} review={r} onReplied={handleReplied} />
        ))}
      </div>
    </div>
  )
}
