'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { Inbox, Moon, Car, Zap } from 'lucide-react'
import { NAVY, ORANGE, FadeUp, StaggerGrid, cardVariants } from './_shared'

const painPoints = [
  { icon: Inbox, title: 'Leads from everywhere',
    desc: 'Calls, texts, Gmail, AutoTrader, CarGurus - no single place to track them all.' },
  { icon: Moon, title: 'The overnight miss',
    desc: "A lead came in at 10pm. By morning, they'd already bought from the dealer who responded at 10:01pm." },
  { icon: Car, title: 'Which car did they want?',
    desc: 'You remember the customer but not the vehicle. You scroll through texts trying to piece it together.' },
  { icon: Zap, title: 'No system = no follow-up',
    desc: 'You mean to call back. You get busy. Three days pass. The deal is gone.' },
]

export default function PainSection() {
  return (
    <section className="bg-white py-20 lg:py-28">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <FadeUp><div className="text-center mb-14">
          <p className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: ORANGE }}>
            The Problem
          </p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-4" style={{ color: NAVY }}>
            Most small dealers don&apos;t have a lead problem.
            <br className="hidden sm:block" />
            <span style={{ color: ORANGE }}> They have a follow-up problem.</span>
          </h2>
          <p className="text-lg max-w-xl mx-auto" style={{ color: '#6B6355' }}>
            A lead comes in after hours. A rep forgets to call back. By the time
            someone follows up, the buyer is already gone.
          </p>
        </div></FadeUp>
        <StaggerGrid className="grid sm:grid-cols-2 gap-5">
          {painPoints.map((p, i) => {
            const Icon = p.icon
            return (
              <motion.div key={i} variants={cardVariants} className="group rounded-2xl p-6 transition-all duration-200 hover:-translate-y-1 cursor-default"
                style={{ backgroundColor: '#F8F4EE', border: '1px solid #E8E2D8',
                  boxShadow: '0 1px 4px rgba(13,43,85,0.06)' }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: 'rgba(240,112,24,0.1)' }}>
                  <Icon className="w-5 h-5" style={{ color: ORANGE }} />
                </div>
                <h3 className="font-black text-lg mb-2" style={{ color: NAVY }}>{p.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: '#6B6355' }}>{p.desc}</p>
              </motion.div>
            )
          })}
        </StaggerGrid>
      </div>
    </section>
  )
}
