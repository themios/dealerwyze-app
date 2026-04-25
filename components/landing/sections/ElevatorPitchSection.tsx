'use client'

import React from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { NAVY, ORANGE } from './_shared'

export default function ElevatorPitchSection() {
  return (
    <section style={{ backgroundColor: ORANGE }}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 lg:py-20 text-center">
        <p className="text-xs font-black uppercase tracking-widest mb-6 text-white/70">
          Who This Is For
        </p>
        <blockquote className="text-2xl sm:text-3xl lg:text-4xl font-black text-white leading-snug mb-10">
          &ldquo;If you&rsquo;re tired of paying for leads that never get followed up on, frustrated you can&rsquo;t see what your sales team is actually doing, and losing deals to the dealer down the street simply because they called back first: sign up for DealerWyze.&rdquo;
        </blockquote>
        <p className="text-lg sm:text-xl font-semibold text-white/90 mb-10 max-w-2xl mx-auto">
          Every lead texted back in under 60 seconds. Every rep accountable. Every follow-up automated, even while you sleep.
        </p>
        <Link
          href="/signup"
          className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-bold text-base transition-all hover:opacity-90 active:scale-95 shadow-xl"
          style={{ backgroundColor: NAVY, color: '#fff', boxShadow: '0 4px 24px rgba(13,43,85,0.35)' }}
        >
          Start Free Today
          <ChevronRight className="w-4 h-4" />
        </Link>
        <p className="mt-4 text-sm text-white/60">No credit card. No commitment. Free during beta.</p>
      </div>
    </section>
  )
}
