'use client'

import React from 'react'
import { Heart } from 'lucide-react'
import { NAVY, ORANGE, FadeUp } from './_shared'

export default function CustomerPulseSection() {
  const categories = [
    { label: 'Overall Experience', score: 4.8, color: '#22c55e' },
    { label: 'Communication',      score: 4.6, color: '#22c55e' },
    { label: 'Vehicle Condition',  score: 4.3, color: ORANGE },
    { label: 'Price & Value',      score: 3.9, color: ORANGE },
  ]

  return (
    <section className="py-20 lg:py-28 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">

          {/* Left - mockup */}
          <FadeUp>
          <div className="flex justify-center lg:justify-start order-2 lg:order-1">
            <div className="w-full max-w-sm space-y-3">

              {/* Score widget */}
              <div className="rounded-2xl overflow-hidden shadow-xl"
                style={{ backgroundColor: '#FDFAF7', border: '1px solid #E8E2D8' }}>
                <div className="px-5 pt-5 pb-4">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest mb-0.5" style={{ color: '#9C897A' }}>
                        My Pulse Score
                      </p>
                      <div className="flex items-end gap-2">
                        <span className="text-4xl font-black" style={{ color: '#22c55e' }}>4.6</span>
                        <span className="text-sm pb-1" style={{ color: '#9C897A' }}>/ 5.0</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold" style={{ color: '#9C897A' }}>Last 90 days</p>
                      <p className="text-lg font-black" style={{ color: NAVY }}>24 surveys</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {categories.map((c, i) => (
                      <div key={i} className="flex items-center justify-between py-1.5 border-t"
                        style={{ borderColor: '#F0EBE3' }}>
                        <span className="text-xs" style={{ color: '#6B6355' }}>{c.label}</span>
                        <span className="text-xs font-black px-2 py-0.5 rounded-full"
                          style={{ backgroundColor: c.color + '18', color: c.color }}>
                          {c.score.toFixed(1)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Survey card */}
              <div className="rounded-2xl p-4 shadow-md"
                style={{ backgroundColor: NAVY, border: `1px solid rgba(255,255,255,0.1)` }}>
                <p className="text-white text-xs font-black mb-1">New survey response</p>
                <p className="text-white/60 text-[10px] mb-3">2019 Honda Civic - sold 3 days ago</p>
                <div className="flex gap-1.5">
                  {[1,2,3,4,5].map(n => (
                    <div key={n} className="flex-1 py-2 rounded-lg text-center text-xs font-black"
                      style={{
                        backgroundColor: n <= 4 ? ORANGE + '33' : ORANGE,
                        color: n <= 4 ? 'rgba(255,255,255,0.4)' : '#fff',
                        border: n === 4 ? `1px solid ${ORANGE}` : '1px solid transparent',
                      }}>
                      {n}
                    </div>
                  ))}
                </div>
                <p className="text-white/40 text-[9px] mt-2 text-center">Customer rated: Overall experience</p>
              </div>

            </div>
          </div>
          </FadeUp>

          {/* Right - copy */}
          <FadeUp delay={0.1}>
          <div className="order-1 lg:order-2">
            <div className="inline-flex items-center gap-2 mb-5 px-4 py-2 rounded-full"
              style={{ backgroundColor: 'rgba(240,112,24,0.1)', border: '1px solid rgba(240,112,24,0.25)' }}>
              <Heart className="w-4 h-4" style={{ color: ORANGE }} />
              <span className="text-xs font-black uppercase tracking-widest" style={{ color: ORANGE }}>
                Customer Pulse
              </span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black leading-[1.1] mb-5" style={{ color: NAVY }}>
              Know how every buyer
              <br />
              <span style={{ color: ORANGE }}>felt about the deal.</span>
            </h2>
            <p className="text-lg leading-relaxed mb-6" style={{ color: '#6B6355' }}>
              A 2-minute survey goes out automatically after every sale.
              Customers rate the experience anonymously - you see per-rep scores,
              weak spots by category, and a team leaderboard without anyone feeling watched.
            </p>
            <ul className="space-y-3 mb-8">
              {[
                'Auto-sends via text and email right after the sale',
                'Rep pulse score updates on their Today dashboard in real time',
                'Category breakdown: price, communication, vehicle condition, and more',
                'Low-score alerts flag unhappy buyers before they leave a public review',
                'Team leaderboard shows who needs coaching - without micromanaging',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <Heart className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: ORANGE }} />
                  <span className="text-sm leading-snug" style={{ color: '#3D3530' }}>{item}</span>
                </li>
              ))}
            </ul>
            <p className="text-sm font-semibold" style={{ color: NAVY }}>
              Turn every sale into a coaching opportunity - automatically.
            </p>
          </div>
          </FadeUp>

        </div>
      </div>
    </section>
  )
}
