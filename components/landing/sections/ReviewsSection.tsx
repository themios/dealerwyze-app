'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { Star } from 'lucide-react'
import { NAVY, ORANGE, StaggerGrid, cardVariants } from './_shared'

const reviews = [
  {
    body: "I run a small used car lot and this is the first CRM that actually fits how we work. One tap to call/text, it logs the attempt automatically, and when I come back it forces a quick outcome + next step so nothing falls through. The Today list alone paid for it - I stopped losing leads overnight.",
    author: 'Independent Dealer, Southern California',
  },
  {
    body: "Everything is finally in one place: customer, car, and every conversation across calls, texts, and lead emails. I used to waste time scrolling through Gmail and my phone trying to remember who wanted which vehicle. Now I open a customer and the full timeline is there, plus templates that let me reply fast without sounding generic.",
    author: 'Used Car Dealer, Central Valley, CA',
  },
  {
    body: "This feels like a 'dealer brain' app, not a corporate CRM. It's mobile-first, instant search by phone/VIN/make-model, and lightweight enough that I actually use it during a busy day. The voice notes feature is clutch - after a call I record 15 seconds and I'm done.",
    author: 'Small Lot Owner, Los Angeles, CA',
  },
]

export default function ReviewsSection() {
  return (
    <section className="bg-white py-20 lg:py-28">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-black" style={{ color: NAVY }}>
            Dealers who stopped losing leads.
          </h2>
        </div>
        <StaggerGrid className="grid sm:grid-cols-3 gap-5">
          {reviews.map((r, i) => (
            <motion.div key={i} variants={cardVariants} className="rounded-2xl p-6 flex flex-col"
              style={{ backgroundColor: '#fff', border: '1px solid #E8E2D8',
                boxShadow: '0 2px 12px rgba(13,43,85,0.07)' }}>
              <div className="flex gap-0.5 mb-4">
                {[...Array(5)].map((_, s) => (
                  <Star key={s} className="w-4 h-4 fill-current" style={{ color: ORANGE }} />
                ))}
              </div>
              <p className="text-sm leading-relaxed flex-1 mb-5" style={{ color: '#3D3530' }}>
                &ldquo;{r.body}&rdquo;
              </p>
              <p className="text-xs font-semibold" style={{ color: '#6B6355' }}>{r.author}</p>
            </motion.div>
          ))}
        </StaggerGrid>
      </div>
    </section>
  )
}
