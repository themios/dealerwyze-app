'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { NAVY, ORANGE, FadeUp, StaggerGrid, cardVariants } from './_shared'

const howSteps = [
  {
    num: '01',
    title: 'Connect your lead sources',
    desc: 'Link Gmail or any IMAP account. Leads from AutoTrader, CarGurus, and your website forms import automatically - no copy-pasting ever again.',
  },
  {
    num: '02',
    title: 'Work your Today list',
    desc: 'Every customer links to their vehicle interest. Log a call in 10 seconds. Set the next step. The app surfaces exactly who needs attention and when.',
  },
  {
    num: '03',
    title: 'Close more deals - and prove it',
    desc: 'Track every deal from first contact to sold. BHPH loans, payments, and collections in the same app. Analytics show what\'s working.',
  },
]

export default function HowItWorksSection() {
  return (
    <section id="how-it-works" className="py-20 lg:py-28" style={{ backgroundColor: '#F4F0EA' }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <FadeUp><div className="mb-14">
          <h2 className="text-3xl sm:text-4xl font-black" style={{ color: NAVY }}>
            Up and running in an afternoon.
          </h2>
          <p className="text-base mt-3 max-w-xl" style={{ color: '#6B6355' }}>
            No IT department. No 6-week onboarding. No training sessions.
          </p>
        </div></FadeUp>
        <StaggerGrid className="grid sm:grid-cols-3 gap-6">
          {howSteps.map((step, i) => (
            <motion.div key={i} variants={cardVariants} className="relative rounded-2xl p-7 flex flex-col"
              style={{ backgroundColor: '#FDFAF7', border: '1px solid #E8E2D8',
                boxShadow: '0 2px 12px rgba(13,43,85,0.06)' }}>
              <div className="text-5xl font-black mb-4 leading-none select-none"
                style={{ color: `rgba(240,112,24,0.18)` }}>
                {step.num}
              </div>
              <h3 className="font-black text-lg mb-2" style={{ color: NAVY }}>{step.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: '#6B6355' }}>{step.desc}</p>
              {i < howSteps.length - 1 && (
                <div className="hidden sm:block absolute -right-3 top-1/2 -translate-y-1/2 z-10
                  w-6 h-6 rounded-full flex items-center justify-center text-xs font-black"
                  style={{ backgroundColor: ORANGE, color: '#fff' }}>
                  →
                </div>
              )}
            </motion.div>
          ))}
        </StaggerGrid>
      </div>
    </section>
  )
}
