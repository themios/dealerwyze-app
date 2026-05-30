'use client'

import React from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { NAVY, ORANGE, FadeUp } from './_shared'

function PhoneMockup() {
  const tasks = [
    { color: '#22c55e', label: 'Call',  name: 'Marcus T.',  note: 'Interested in 2021 Camry' },
    { color: '#3b82f6', label: 'Appt',  name: 'Sarah L.',   note: 'Test drive @ 2pm today' },
    { color: ORANGE,    label: 'SMS',   name: 'Devon W.',   note: 'Asked about financing terms' },
  ]

  return (
    <div className="flex justify-center items-center">
      <div className="relative rounded-[2.5rem] p-1 shadow-2xl"
        style={{ background: 'linear-gradient(145deg,#1a1a2e 0%,#16213e 100%)', width: '220px',
          border: '2px solid rgba(255,255,255,0.15)' }}>
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 rounded-b-xl"
          style={{ width: '80px', height: '22px', backgroundColor: '#0a0a1a', zIndex: 10 }} />
        {/* Screen */}
        <div className="rounded-[2rem] overflow-hidden"
          style={{ backgroundColor: NAVY, minHeight: '400px', padding: '28px 12px 16px' }}>
          <div className="flex justify-between items-center mb-4 px-1">
            <span className="text-white/50 text-[9px] font-medium">9:41</span>
            <div className="flex gap-1">
              <div className="w-3 h-1.5 rounded-sm bg-white/40" />
              <div className="w-1 h-1.5 rounded-sm bg-white/40" />
            </div>
          </div>
          <div className="mb-3 px-1">
            <p className="text-white/60 text-[10px] uppercase tracking-widest font-semibold">Today</p>
            <p className="text-white font-bold text-lg leading-tight">3 need attention</p>
          </div>
          <div className="flex flex-col gap-2">
            {tasks.map((task, i) => (
              <div key={i} className="rounded-xl overflow-hidden"
                style={{ backgroundColor: task.color + '18', border: `1px solid ${task.color}44` }}>
                <div className="px-3 py-2.5">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: task.color + '33', color: task.color }}>
                      {task.label}
                    </span>
                  </div>
                  <p className="text-white text-[11px] font-semibold leading-tight">{task.name}</p>
                  <p className="text-white/50 text-[9px] leading-tight mt-0.5">{task.note}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-center mt-4">
            <div className="w-12 h-1 rounded-full bg-white/20" />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function HeroSection() {
  return (
    <section className="relative overflow-hidden pt-16" style={{ backgroundColor: NAVY }}>
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 80% 60% at 50% -10%,rgba(240,112,24,0.15) 0%,transparent 70%)' }} />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-20 lg:py-32">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <FadeUp>
          <div>
            <div className="inline-flex items-center gap-2 mb-6">
              <span className="text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full"
                style={{ backgroundColor: ORANGE, color: '#fff' }}>
                Built for Independent Dealers
              </span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white leading-[1.05] mb-5">
              Stop Losing Dealer Leads<br />
              <span style={{ color: ORANGE }}>After Hours.</span>
            </h1>
            <p className="text-lg sm:text-xl leading-relaxed mb-8 max-w-lg"
              style={{ color: 'rgba(255,255,255,0.75)' }}>
              DealerWyze captures lead emails, tracks every conversation, and shows
              exactly who needs attention next. Publish your inventory on an SEO-ready
              public dealer site — so buyers find your cars and you close more deals
              without adding staff.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <Link href="/signup"
                className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl font-bold text-base text-white transition-all hover:opacity-90 active:scale-95 shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{ backgroundColor: ORANGE, boxShadow: '0 4px 20px rgba(240,112,24,0.4)', outlineColor: 'rgba(255,255,255,0.8)' }}>
                Start Free, No Card
                <ChevronRight className="w-4 h-4" />
              </Link>
              <a href="#how-it-works"
                className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl font-semibold text-base transition-all hover:bg-white/10 border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.35)', outlineColor: 'rgba(255,255,255,0.8)' }}>
                See How It Works
              </a>
            </div>
            <div className="mb-6">
              <a href="/terms.html#sms-consent" className="inline-flex items-center gap-1 text-xs px-3 py-2 rounded-full"
                style={{ backgroundColor: 'rgba(240,112,24,0.15)', color: ORANGE }}>
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M6.293 6.293a1 1 0 011.414 0L10 8.586l2.293-2.293a1 1 0 111.414 1.414L11.414 10l2.293 2.293a1 1 0 01-1.414 1.414L10 11.414l-2.293 2.293a1 1 0 01-1.414-1.414L8.586 10 6.293 7.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                <span className="font-semibold">TCPA / CAN-SPAM Compliant</span>
              </a>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm" style={{ color: 'rgba(255,255,255,0.70)' }}>
              <span>Built for independent dealers</span>
              <span>·</span>
              <span>Gmail + IMAP lead import</span>
              <span>·</span>
              <span>Vehicle-linked CRM</span>
              <span>·</span>
              <span>Public inventory website (SEO)</span>
              <span>·</span>
              <span>Free during beta</span>
            </div>
          </div>
          </FadeUp>
          <div className="flex justify-center lg:justify-end">
            <PhoneMockup />
          </div>
        </div>
      </div>

      <div className="relative" style={{ height: '60px', marginTop: '-1px' }}>
        <svg viewBox="0 0 1440 60" preserveAspectRatio="none"
          className="absolute bottom-0 left-0 w-full h-full" style={{ fill: '#ffffff' }}>
          <path d="M0,60 C360,0 1080,0 1440,60 L1440,60 L0,60 Z" />
        </svg>
      </div>
    </section>
  )
}
