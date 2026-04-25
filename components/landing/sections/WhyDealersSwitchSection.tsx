'use client'

import React from 'react'
import { NAVY, ORANGE } from './_shared'

const switchComparisons = [
  {
    generic: 'Not vehicle-linked — you lose context on every lead',
    dealerwyze: 'Every lead tied to the exact car they asked about',
  },
  {
    generic: 'Too slow to log activity during a live selling day',
    dealerwyze: 'Log a call or text in under 10 seconds, one tap',
  },
  {
    generic: 'Weak or manual lead import from dealer channels',
    dealerwyze: 'Auto-imports from Gmail, IMAP, AutoTrader, and CarGurus',
  },
  {
    generic: 'Built for enterprise teams of 20 or more',
    dealerwyze: 'Built for one-person lots and small independent dealers',
  },
]

export default function WhyDealersSwitchSection() {
  return (
    <section className="py-20 lg:py-28 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-black" style={{ color: NAVY }}>
            Why generic CRMs fail small lots.
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="py-3 px-5 text-left text-sm font-black rounded-tl-xl"
                  style={{ backgroundColor: '#F4F0EA', color: '#9C897A', width: '50%' }}>
                  Generic CRM
                </th>
                <th className="py-3 px-5 text-left text-sm font-black rounded-tr-xl"
                  style={{ backgroundColor: NAVY, color: ORANGE, width: '50%' }}>
                  DealerWyze
                </th>
              </tr>
            </thead>
            <tbody>
              {switchComparisons.map((row, i) => (
                <tr key={i} className={i % 2 === 0 ? '' : ''}>
                  <td className="py-4 px-5 text-sm border-b"
                    style={{ color: '#6B6355', borderColor: '#E8E2D8', backgroundColor: '#FAFAFA' }}>
                    <span className="flex items-start gap-2">
                      <span className="flex-shrink-0 mt-0.5 text-red-400 font-black">✕</span>
                      {row.generic}
                    </span>
                  </td>
                  <td className="py-4 px-5 text-sm border-b"
                    style={{ color: '#1a2e4a', borderColor: '#dce6f0', backgroundColor: '#f0f5fb' }}>
                    <span className="flex items-start gap-2">
                      <span className="flex-shrink-0 mt-0.5 font-black" style={{ color: ORANGE }}>✓</span>
                      {row.dealerwyze}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}
