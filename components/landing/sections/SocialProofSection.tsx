'use client'

import React from 'react'
import { NAVY } from './_shared'

/**
 * Social Proof Section
 *
 * Displays customer logos and testimonials to build credibility.
 * TODO: Fill in actual customer logos and testimonials from public/social-proof-TEMPLATE.md
 *
 * Placeholder structure ready to receive:
 * - 3–5 customer logos (120–160px wide, transparent PNG/SVG)
 * - 2–3 short testimonials (1–2 sentences each)
 */
export default function SocialProofSection() {
  // TODO: Replace with actual customer logos and testimonial data
  const PLACEHOLDER_LOGOS = [
    { name: 'Customer 1', path: '/logos/customers/placeholder-1.png' },
    { name: 'Customer 2', path: '/logos/customers/placeholder-2.png' },
    { name: 'Customer 3', path: '/logos/customers/placeholder-3.png' },
  ]

  const PLACEHOLDER_TESTIMONIALS = [
    {
      quote: 'DealerWyze cut our response time from 4 hours to 10 minutes. We\'re closing deals faster than ever.',
      source: '[Dealer Name], [City, State]',
    },
    {
      quote: '[Insert second testimonial here]',
      source: '[Dealer Name], [City, State]',
    },
    {
      quote: '[Insert third testimonial here]',
      source: '[Dealer Name], [City, State]',
    },
  ]

  return (
    <section style={{ backgroundColor: NAVY }} className="py-16 lg:py-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <p className="text-sm font-bold uppercase tracking-widest text-orange-500 mb-3">
            Trusted by Independent Dealers
          </p>
          <h2 className="text-3xl sm:text-4xl font-black text-white mb-3">
            Built by dealers, for dealers
          </h2>
          <p className="text-lg text-white/70 max-w-2xl mx-auto">
            Used by independent dealers across California, Texas, and Florida.
          </p>
        </div>

        {/* Logo Carousel */}
        <div className="mb-12">
          <div className="flex flex-wrap justify-center gap-8 items-center">
            {PLACEHOLDER_LOGOS.map((logo) => (
              <div key={logo.name} className="h-16 flex items-center justify-center">
                <div className="text-white/40 text-sm font-semibold text-center">
                  [Logo: {logo.name}]
                </div>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-white/50 mt-6">
            📝 Waiting for customer logos — see /public/social-proof-TEMPLATE.md
          </p>
        </div>

        {/* Testimonials */}
        <div className="grid md:grid-cols-3 gap-6">
          {PLACEHOLDER_TESTIMONIALS.map((testimonial, i) => (
            <div
              key={i}
              className="p-6 rounded-lg"
              style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              <p className="text-white/90 font-semibold mb-3 text-sm leading-relaxed">
                &quot;{testimonial.quote}&quot;
              </p>
              <p className="text-white/60 text-xs font-medium">{testimonial.source}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
