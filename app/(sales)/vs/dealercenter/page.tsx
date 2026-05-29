'use client'

import React from 'react'
import Nav from '@/components/landing/sections/Nav'
import Footer from '@/components/landing/sections/Footer'
import ComparisonSection from '@/components/landing/sections/ComparisonSection'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'DealerWyze vs DealerCenter | DMS Alternative for Smaller Lots',
  description: 'Compare DealerWyze to DealerCenter. DealerWyze is lighter, faster, and built for independent dealers. Works great solo or as a complement to a full DMS.',
  openGraph: {
    title: 'DealerWyze vs DealerCenter',
    description: 'Compare DealerWyze to DealerCenter for independent dealers.',
  },
}

export default function DealerCenterComparison() {
  const features = [
    { feature: 'Lead Management & CRM', dealerwyze: true, competitor: true },
    { feature: 'Two-way Texting & Email', dealerwyze: true, competitor: true },
    { feature: 'Inventory Management', dealerwyze: true, competitor: true },
    { feature: 'Customer Communications', dealerwyze: true, competitor: true },
    { feature: 'Public Inventory Website', dealerwyze: true, competitor: true },
    { feature: 'F&I Integration', dealerwyze: false, competitor: true },
    { feature: 'Full DMS (Accounting, Service)', dealerwyze: false, competitor: true },
    { feature: 'BHPH Payment Tracking', dealerwyze: true, competitor: 'Limited' },
    { feature: 'AI Voice Answering', dealerwyze: true, competitor: false },
    { feature: 'Setup Complexity', dealerwyze: 'Quick (days)', competitor: 'Months' },
  ]

  return (
    <>
      <Nav />
      <main className="landing">
        <ComparisonSection
          competitorName="DealerCenter"
          dealerwyzePrice="Free (Beta)"
          competitorPrice="$300–$800+/mo"
          features={features}
          callout="DealerCenter is a full dealership management system for large lots. DealerWyze is built for smaller independent dealers who need fast, lean customer communication and inventory management without the complexity and cost of a full DMS."
        />
      </main>
      <Footer />
    </>
  )
}
