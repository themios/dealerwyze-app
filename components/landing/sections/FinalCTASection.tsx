'use client'

import React from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { NAVY, ORANGE, FadeUp } from './_shared'

export default function FinalCTASection() {
  return (
    <section className="relative overflow-hidden py-24 lg:py-32" style={{ backgroundColor: NAVY }}>
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 110%,rgba(240,112,24,0.2) 0%,transparent 70%)' }} />
      <FadeUp><div className="relative max-w-3xl mx-auto px-4 sm:px-6 text-center">
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white mb-4">
          Your competitors already have a system.
        </h2>
        <p className="text-lg mb-10" style={{ color: 'rgba(255,255,255,0.65)' }}>
          Every day without one is a lead you might not get back.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/signup"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl font-bold text-base text-white transition-all hover:opacity-90 active:scale-95 shadow-xl"
            style={{ backgroundColor: ORANGE, boxShadow: '0 6px 24px rgba(240,112,24,0.45)' }}>
            Get Beta Access - Free
            <ChevronRight className="w-4 h-4" />
          </Link>
          <a href="mailto:support@dealerwyze.com?subject=15-Minute%20Dealer%20Workflow%20Review"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl font-semibold text-base transition-all hover:bg-white/10 border"
            style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.35)' }}>
            Book a 15-Minute Workflow Review
          </a>
        </div>
        <p className="mt-5 text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          No credit card · No commitment · Free during beta
        </p>
      </div></FadeUp>
    </section>
  )
}
