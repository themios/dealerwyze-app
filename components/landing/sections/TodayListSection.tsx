'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { Zap, CalendarCheck, Link2 } from 'lucide-react'
import { NAVY, ORANGE, FadeUp, StaggerGrid, cardVariants } from './_shared'

const todayCallouts = [
  { icon: Zap, title: '10-second logging',
    desc: 'Call a customer, log the outcome and next step in one tap. No typing essays.' },
  { icon: CalendarCheck, title: 'Never miss a follow-up',
    desc: 'Every touch auto-creates the next step. Nothing falls off the list.' },
  { icon: Link2, title: 'Vehicle-linked',
    desc: "Every customer is connected to the car they're considering. Full context, instantly." },
]

export default function TodayListSection() {
  return (
    <section className="py-20 lg:py-28" style={{ backgroundColor: NAVY }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <FadeUp><div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white mb-5">
            One list. Everything that needs your{' '}
            <span style={{ color: ORANGE }}>attention today.</span>
          </h2>
          <p className="text-lg max-w-2xl mx-auto" style={{ color: 'rgba(255,255,255,0.65)' }}>
            Overdue calls. Appointment requests. New leads. Customers waiting on a reply.
            All in one place - ranked by urgency, not by when it arrived in your inbox.
          </p>
        </div></FadeUp>
        <StaggerGrid className="grid sm:grid-cols-3 gap-5">
          {todayCallouts.map((c, i) => {
            const Icon = c.icon
            return (
              <motion.div key={i} variants={cardVariants} className="rounded-2xl p-6 transition-all duration-200 hover:-translate-y-1"
                style={{ backgroundColor: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.12)' }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: 'rgba(240,112,24,0.15)' }}>
                  <Icon className="w-5 h-5" style={{ color: ORANGE }} />
                </div>
                <h3 className="font-black text-white text-lg mb-2">{c.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>{c.desc}</p>
              </motion.div>
            )
          })}
        </StaggerGrid>
      </div>
    </section>
  )
}
