'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { Phone, Camera, Newspaper, ScanLine, TrendingUp } from 'lucide-react'
import { NAVY, ORANGE, FadeUp, StaggerGrid, cardVariants } from './_shared'

const aiFeatures = [
  { icon: Phone, title: 'AI Voice Agent',
    desc: 'A Retell AI agent answers inbound calls, qualifies leads, and logs the full transcript and summary back to the customer record - automatically.' },
  { icon: Camera, title: 'AI Lead Scanner',
    desc: 'Snap a photo of a handwritten buyer inquiry or upload a PDF. AI extracts the customer name, phone, vehicle interest, and creates the lead in seconds.' },
  { icon: Newspaper, title: 'AI Dealer Brief',
    desc: 'Every morning, a one-paragraph summary of your day: new leads, appointments, overdue follow-ups, and what needs to happen first.' },
  { icon: ScanLine, title: 'AI Receipt OCR',
    desc: 'Upload a receipt photo. AI extracts vendor, amount, category, and posts it to your ledger - cutting bookkeeping time by half.' },
  { icon: TrendingUp, title: 'AI Smart Pricing',
    desc: 'Get live Fast Sale, Fair Market, and Max Return price tiers for any vehicle in your inventory - with market comps, an NHTSA reliability check, and a full AI market analysis. No CarGurus subscription needed.' },
]

export default function AISection() {
  return (
    <section className="py-20 lg:py-28" style={{ backgroundColor: '#FAFAFA' }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <FadeUp><div className="mb-14">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-4" style={{ color: NAVY }}>
            Works while you&apos;re on the lot.
          </h2>
          <p className="text-lg max-w-2xl" style={{ color: '#6B6355' }}>
            Five AI systems handle the tedious parts - so you focus on the customer in front of you.
          </p>
        </div></FadeUp>
        <StaggerGrid className="grid sm:grid-cols-2 gap-5">
          {aiFeatures.map((f, i) => {
            const Icon = f.icon
            return (
              <motion.div key={i} variants={cardVariants} className="rounded-2xl p-6 flex gap-4 transition-all duration-200 hover:-translate-y-1"
                style={{ backgroundColor: '#fff', border: '1px solid #E8E2D8',
                  boxShadow: '0 2px 12px rgba(13,43,85,0.06)' }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: 'rgba(240,112,24,0.1)' }}>
                  <Icon className="w-5 h-5" style={{ color: ORANGE }} />
                </div>
                <div>
                  <h3 className="font-black text-base mb-1.5" style={{ color: NAVY }}>{f.title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: '#6B6355' }}>{f.desc}</p>
                </div>
              </motion.div>
            )
          })}
        </StaggerGrid>
      </div>
    </section>
  )
}
