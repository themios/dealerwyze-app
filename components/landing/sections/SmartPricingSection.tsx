'use client'

import React from 'react'
import { TrendingUp, ShieldCheck } from 'lucide-react'
import { NAVY, ORANGE, FadeUp } from './_shared'

export default function SmartPricingSection() {
  const tiers = [
    { label: 'Fast Sale',    color: '#22c55e', desc: '60-day target - price to move now' },
    { label: 'Fair Market',  color: ORANGE,    desc: '90-day target - balanced approach' },
    { label: 'Max Return',   color: '#3b82f6', desc: '120-day target - hold for top dollar' },
  ]

  return (
    <section className="py-20 lg:py-28" style={{ backgroundColor: '#F4F0EA' }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">

          {/* Left - copy */}
          <FadeUp>
          <div>
            <div className="inline-flex items-center gap-2 mb-5 px-4 py-2 rounded-full"
              style={{ backgroundColor: 'rgba(240,112,24,0.1)', border: '1px solid rgba(240,112,24,0.25)' }}>
              <TrendingUp className="w-4 h-4" style={{ color: ORANGE }} />
              <span className="text-xs font-black uppercase tracking-widest" style={{ color: ORANGE }}>
                Smart Pricing Intelligence
              </span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black leading-[1.1] mb-5" style={{ color: NAVY }}>
              Know exactly what to price
              <br />
              <span style={{ color: ORANGE }}>every car on your lot.</span>
            </h2>
            <p className="text-lg leading-relaxed mb-6" style={{ color: '#6B6355' }}>
              CarGurus charges $2,000/month for live pricing comps. DealerWyze puts the same
              intelligence inside your CRM - with three pricing tiers, a market confidence score,
              and an AI-written market analysis report - for no additional cost.
            </p>
            <ul className="space-y-3 mb-8">
              {[
                'Live market comps based on comparable vehicles sold nearby',
                'NHTSA recall check and reliability risk on every vehicle',
                'AI-generated listing description from market data',
                'Deal rating badge for your public inventory pages',
                'Results cached 7 days - one click, instant answer',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: ORANGE }} />
                  <span className="text-sm leading-snug" style={{ color: '#3D3530' }}>{item}</span>
                </li>
              ))}
            </ul>
            <p className="text-sm font-semibold" style={{ color: NAVY }}>
              Price to move in 60 days - or hold for maximum return. The choice is yours.
            </p>
          </div>
          </FadeUp>

          {/* Right - pricing card mockup */}
          <FadeUp delay={0.15}><div className="flex justify-center lg:justify-end">
            <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl"
              style={{ backgroundColor: '#FDFAF7', border: '1px solid #E8E2D8' }}>

              {/* Card header */}
              <div className="px-5 py-4 border-b" style={{ borderColor: '#E8E2D8' }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-black uppercase tracking-widest" style={{ color: NAVY }}>
                    Market Intelligence
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: '#dcfce7', color: '#15803d' }}>
                    Strong Market · 47 comps
                  </span>
                </div>
                <p className="text-sm font-semibold" style={{ color: '#6B6355' }}>2019 Toyota Camry SE · 62k mi</p>
              </div>

              {/* Pricing tiers */}
              <div className="px-5 py-4 space-y-3">
                {tiers.map((t, i) => (
                  <div key={i} className="flex items-center justify-between py-2.5 px-3 rounded-xl"
                    style={{ backgroundColor: t.color + '12', border: `1px solid ${t.color}33` }}>
                    <div>
                      <p className="text-xs font-black" style={{ color: t.color }}>{t.label}</p>
                      <p className="text-[10px]" style={{ color: '#9C897A' }}>{t.desc}</p>
                    </div>
                    <p className="text-lg font-black" style={{ color: t.color }}>
                      {i === 0 ? '$18,400' : i === 1 ? '$20,200' : '$22,500'}
                    </p>
                  </div>
                ))}
              </div>

              {/* NHTSA row */}
              <div className="px-5 py-3 border-t flex items-center justify-between" style={{ borderColor: '#E8E2D8' }}>
                <span className="text-xs font-semibold" style={{ color: '#6B6355' }}>NHTSA Reliability</span>
                <span className="text-[11px] font-black px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: '#dcfce7', color: '#15803d' }}>Low Risk · 0 recalls</span>
              </div>

              {/* Deal badge row */}
              <div className="px-5 py-3 border-t flex items-center justify-between" style={{ borderColor: '#E8E2D8' }}>
                <span className="text-xs font-semibold" style={{ color: '#6B6355' }}>Your list price: $19,995</span>
                <span className="text-[11px] font-black px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: '#dbeafe', color: '#1d4ed8' }}>Good Deal</span>
              </div>

              {/* Footer */}
              <div className="px-5 py-3 border-t" style={{ borderColor: '#E8E2D8', backgroundColor: '#FAFAFA' }}>
                <p className="text-[10px] text-center" style={{ color: '#9C897A' }}>
                  Powered by live market data · Updated daily · Cached 7 days
                </p>
              </div>
            </div>
          </div></FadeUp>

        </div>
      </div>
    </section>
  )
}
