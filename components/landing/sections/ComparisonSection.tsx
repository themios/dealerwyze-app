'use client'

import React from 'react'
import { CheckCircle2 } from 'lucide-react'
import { NAVY, ORANGE } from './_shared'

interface ComparisonFeature {
  feature: string
  dealerwyze: string | boolean
  competitor: string | boolean
}

interface ComparisonSectionProps {
  competitorName: string
  dealerwyzePrice: string
  competitorPrice: string
  features: ComparisonFeature[]
  callout: string
}

export default function ComparisonSection({
  competitorName,
  dealerwyzePrice,
  competitorPrice,
  features,
  callout,
}: ComparisonSectionProps) {
  return (
    <section style={{ backgroundColor: NAVY }} className="py-16 lg:py-24">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-black text-white mb-3">
            DealerWyze vs {competitorName}
          </h1>
          <p className="text-xl text-white/70">
            See why independent dealers choose DealerWyze
          </p>
        </div>

        {/* Feature Comparison Table */}
        <div className="overflow-x-auto rounded-lg border" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
          <table className="w-full">
            <thead>
              <tr style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
                <th className="text-left px-6 py-4 font-bold text-white">Feature</th>
                <th className="text-center px-6 py-4 font-bold text-white">DealerWyze</th>
                <th className="text-center px-6 py-4 font-bold text-white">{competitorName}</th>
              </tr>
            </thead>
            <tbody>
              {features.map((row, i) => (
                <tr
                  key={i}
                  style={{
                    backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                    borderTop: '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  <td className="px-6 py-4 text-white font-semibold">{row.feature}</td>
                  <td className="text-center px-6 py-4">
                    {typeof row.dealerwyze === 'boolean' ? (
                      row.dealerwyze ? (
                        <CheckCircle2 className="w-5 h-5 text-green-400 mx-auto" />
                      ) : (
                        <span className="text-white/30">—</span>
                      )
                    ) : (
                      <span className="text-white/90 text-sm">{row.dealerwyze}</span>
                    )}
                  </td>
                  <td className="text-center px-6 py-4">
                    {typeof row.competitor === 'boolean' ? (
                      row.competitor ? (
                        <CheckCircle2 className="w-5 h-5 text-green-400 mx-auto" />
                      ) : (
                        <span className="text-white/30">—</span>
                      )
                    ) : (
                      <span className="text-white/90 text-sm">{row.competitor}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Key Callout */}
        <div className="mt-12 p-8 rounded-lg" style={{ backgroundColor: `${ORANGE}15`, border: `2px solid ${ORANGE}` }}>
          <p className="text-lg font-semibold text-white mb-3">💡 The DealerWyze Difference</p>
          <p className="text-white/90">{callout}</p>
        </div>

        {/* Pricing Summary */}
        <div className="mt-12 grid md:grid-cols-2 gap-6">
          <div className="p-6 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '2px solid rgba(255,255,255,0.1)' }}>
            <p className="text-white/70 text-sm font-semibold mb-2">DealerWyze</p>
            <p className="text-3xl font-black text-white">{dealerwyzePrice}</p>
            <p className="text-white/60 text-sm mt-2">All features included</p>
          </div>
          <div className="p-6 rounded-lg" style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <p className="text-white/70 text-sm font-semibold mb-2">{competitorName}</p>
            <p className="text-3xl font-black text-white">{competitorPrice}</p>
            <p className="text-white/60 text-sm mt-2">Plus add-ons for advanced features</p>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-12 text-center">
          <a
            href="/signup"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl font-bold text-white transition-all hover:opacity-90 active:scale-95 shadow-lg"
            style={{ backgroundColor: ORANGE }}
          >
            See DealerWyze in Action
            <span>→</span>
          </a>
        </div>
      </div>
    </section>
  )
}
