import React from 'react'
import Nav from '@/components/landing/sections/Nav'
import Footer from '@/components/landing/sections/Footer'
import ComparisonSection from '@/components/landing/sections/ComparisonSection'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'DealerWyze vs VinSolutions | Independent Dealer CRM Comparison',
  description: 'Compare DealerWyze to VinSolutions. See why independent dealers choose DealerWyze for half the cost with two-way texting, BHPH, and AI voice leads.',
  openGraph: {
    title: 'DealerWyze vs VinSolutions',
    description: 'Compare DealerWyze to VinSolutions for independent dealers.',
  },
}

export default function VinSolutionsComparison() {
  const features = [
    { feature: 'Two-way Texting (SMS & MMS)', dealerwyze: true, competitor: false },
    { feature: 'Email Integration', dealerwyze: true, competitor: true },
    { feature: 'Lead Management Inbox', dealerwyze: true, competitor: true },
    { feature: 'Inventory Management', dealerwyze: true, competitor: true },
    { feature: 'BHPH Payment Tracking', dealerwyze: true, competitor: false },
    { feature: 'AI Voice Leads (Retell)', dealerwyze: true, competitor: false },
    { feature: 'Receipt Scanning (OCR)', dealerwyze: true, competitor: false },
    { feature: 'Public Dealer Website', dealerwyze: true, competitor: false },
    { feature: 'Pricing Transparency', dealerwyze: 'Starting free', competitor: 'Call for quote' },
    { feature: 'Target Market', dealerwyze: 'Independent dealers', competitor: 'All sizes (franchise-heavy)' },
  ]

  return (
    <>
      <Nav />
      <main className="landing">
        <ComparisonSection
          competitorName="VinSolutions"
          dealerwyzePrice="Free (Beta)"
          competitorPrice="$500–$1500/mo"
          features={features}
          callout="VinSolutions targets large franchise dealers and costs 3–10x more. DealerWyze is built specifically for independent lots and includes two-way texting, BHPH tracking, and AI voice answering out of the box — features that cost extra or don't exist in VinSolutions."
        />
      </main>
      <Footer />
    </>
  )
}
