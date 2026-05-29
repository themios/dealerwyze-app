'use client'

import React from 'react'
import Nav from '@/components/landing/sections/Nav'
import Footer from '@/components/landing/sections/Footer'
import ComparisonSection from '@/components/landing/sections/ComparisonSection'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'DealerWyze vs AutoRaptor | Lead Management & CRM Comparison',
  description: 'Compare DealerWyze to AutoRaptor. DealerWyze is 1/3 the price with inventory management, BHPH, and receipts — everything you need in one platform.',
  openGraph: {
    title: 'DealerWyze vs AutoRaptor',
    description: 'Compare DealerWyze to AutoRaptor for independent dealers.',
  },
}

export default function AutoRaptorComparison() {
  const features = [
    { feature: 'Lead Management', dealerwyze: true, competitor: true },
    { feature: 'Two-way Texting', dealerwyze: true, competitor: true },
    { feature: 'Inventory Management', dealerwyze: true, competitor: false },
    { feature: 'Vehicle Photos & VDP', dealerwyze: true, competitor: false },
    { feature: 'Public Dealer Website', dealerwyze: true, competitor: false },
    { feature: 'BHPH Payment Tracking', dealerwyze: true, competitor: false },
    { feature: 'Receipt OCR Scanning', dealerwyze: true, competitor: false },
    { feature: 'AI Voice Answering', dealerwyze: true, competitor: false },
    { feature: 'Email Integration', dealerwyze: true, competitor: 'Limited' },
    { feature: 'Team Collaboration', dealerwyze: true, competitor: true },
  ]

  return (
    <>
      <Nav />
      <main className="landing">
        <ComparisonSection
          competitorName="AutoRaptor"
          dealerwyzePrice="Free (Beta)"
          competitorPrice="$400+/mo"
          features={features}
          callout="AutoRaptor is a lead-only tool. DealerWyze is a complete operating system: it handles lead follow-up, inventory management, BHPH tracking, receipts, and video creation. You get 5–7 tools in one platform instead of paying for add-ons."
        />
      </main>
      <Footer />
    </>
  )
}
