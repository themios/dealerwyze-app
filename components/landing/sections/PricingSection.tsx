'use client'

import React from 'react'
import Link from 'next/link'
import { Check, FlaskConical } from 'lucide-react'
import { NAVY, ORANGE } from './_shared'

const freeFeatures = [
  'Up to 200 contacts & leads',
  'Up to 100 vehicles in inventory',
  'Public dealer website & SEO-ready vehicle pages',
  'Vehicle-linked activity tracking',
  'Lead pipeline (Kanban board)',
  'Gmail + IMAP lead auto-import',
  'AI Lead Scanner (photo & PDF)',
  'AI Dealer Brief (daily summary)',
  'AI Receipt OCR & ledger posting',
  'Smart Pricing Intelligence (Fast/Fair/Max tiers)',
  'NHTSA recall check on every vehicle',
  'BHPH loan & payment tracking',
  'Receipts, bookkeeping & CSV export',
  'Google Calendar & GBP reviews',
  'Customer Pulse surveys + rep score tracking',
  'Analytics & full XLSX export',
  'Contacts & business card scan',
  'Team members + role-based access',
]

const crmFeatures = [
  'Unlimited contacts & leads',
  'Public dealer website & SEO-ready vehicle pages',
  'Vehicle-linked activity tracking',
  'Lead pipeline (Kanban board)',
  'Gmail + IMAP lead auto-import',
  'AI Lead Scanner (photo & PDF)',
  'AI Dealer Brief (daily summary)',
  'AI Receipt OCR & ledger posting',
  'Smart Pricing Intelligence (Fast/Fair/Max tiers)',
  'NHTSA recall check on every vehicle',
  'BHPH loan & payment tracking',
  'Receipts, bookkeeping & CSV export',
  'Fax send & receive',
  'Google Calendar & GBP reviews',
  'Customer Pulse surveys + rep score tracking',
  'Analytics & full XLSX export',
  'Contacts & business card scan',
  'Team members + role-based access',
  '25 AI listing videos/month',
  'Auto-post to Facebook, Instagram, TikTok, YouTube',
]

const smsFeatures = [
  'Two-way SMS + dedicated business number',
  '3,000 SMS credits/month (included)',
  'SMS credits never expire—they roll over each month',
]

const proSmsFeatures = [
  'Two-way SMS + dedicated business number',
  '5,000 SMS credits/month (included)',
  '3,000 voice minutes/month (included)',
  'SMS & voice credits never expire—they roll over each month',
]

const voiceFeatures = [
  'Dedicated AI voice agent (Retell AI)',
  'Answers inbound calls 24/7',
  'Post-call transcripts & summaries',
  'Auto lead creation from inbound calls',
  'After-hours call handling',
]

export default function PricingSection() {
  // Annual pricing: 10% off monthly rate
  const crmMonthly   = 150
  const voiceAddon   = 200
  const crmAnnual    = +(crmMonthly * 0.9).toFixed(2)          // 135
  const fullAnnual   = +((crmMonthly + voiceAddon) * 0.9).toFixed(2) // 315
  const crmSavings   = Math.round(crmMonthly * 12 - crmAnnual * 12)   // 180
  const fullSavings  = Math.round((crmMonthly + voiceAddon) * 12 - fullAnnual * 12) // 420

  return (
    <section id="pricing" className="bg-white py-20 lg:py-28">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-black mb-3" style={{ color: NAVY }}>
            Free forever during beta.
          </h2>
          <p className="text-base" style={{ color: '#6B6355' }}>
            Everything is free while we build. Growth plan: free now, $150/mo at launch. Pro plan coming soon.
          </p>
        </div>

        {/* Beta banner */}
        <div className="max-w-3xl mx-auto mb-10 rounded-2xl px-6 py-4 flex items-start gap-3"
          style={{ backgroundColor: '#FFF7ED', border: '1.5px solid #FDBA74' }}>
          <FlaskConical className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#9A3412' }} />
          <div>
            <p className="text-sm font-black" style={{ color: '#9A3412' }}>Beta Program</p>
            <p className="text-sm mt-0.5" style={{ color: '#7C2D12' }}>
              We're in beta. Everything is free right now: Growth plan ($0), AI features, SMS, video rendering, and more. We'll notify 30 days before paid plans launch. Early adopters keep the free tier forever.
            </p>
          </div>
        </div>

        {/* Cards */}
        <div className="grid sm:grid-cols-3 gap-6 max-w-5xl mx-auto">

          {/* Free Beta - featured */}
          <div className="rounded-2xl p-7 relative flex flex-col"
            style={{ backgroundColor: NAVY, border: `2px solid ${NAVY}`,
              boxShadow: '0 8px 32px rgba(13,43,85,0.35)' }}>
            <div className="mb-5">
              <span className="text-xs font-black uppercase tracking-wide px-3 py-1.5 rounded-full"
                style={{ backgroundColor: ORANGE, color: '#fff' }}>
                Available Now - Free
              </span>
            </div>
            <h3 className="text-xl font-black mb-1 text-white">30-Day Trial</h3>
            <p className="text-sm mb-3" style={{ color: 'rgba(255,255,255,0.65)' }}>
              Full access to all features
            </p>
            <div className="flex items-end gap-1 mb-4">
              <span className="text-4xl font-black text-white">$0</span>
              <span className="text-sm pb-1.5" style={{ color: 'rgba(255,255,255,0.6)' }}>/month</span>
            </div>
            <ul className="space-y-2.5 mb-7 flex-1">
              {freeFeatures.map((feat, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm" style={{ color: 'rgba(255,255,255,0.85)' }}>
                  <Check className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: ORANGE }} />
                  {feat}
                </li>
              ))}
            </ul>
            <Link href="/signup"
              className="w-full py-3.5 rounded-xl font-bold text-sm text-white text-center transition-all hover:opacity-90 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ backgroundColor: ORANGE, boxShadow: '0 4px 16px rgba(240,112,24,0.4)', outlineColor: 'rgba(255,255,255,0.8)' }}>
              Start Free - No Card Needed
            </Link>
            <p className="text-center mt-3 text-xs" style={{ color: 'rgba(255,255,255,0.70)' }}>
              No credit card · No commitment
            </p>
          </div>

          {/* Growth Plan */}
          <div className="rounded-2xl p-7 relative flex flex-col"
            style={{ backgroundColor: '#fff', border: `2px solid ${ORANGE}`,
              boxShadow: `0 2px 16px ${ORANGE}20` }}>
            <div className="mb-5">
              <span className="text-xs font-black uppercase tracking-wide px-3 py-1.5 rounded-full"
                style={{ backgroundColor: `${ORANGE}20`, color: ORANGE }}>
                Free Now
              </span>
            </div>
            <h3 className="text-xl font-black mb-1" style={{ color: NAVY }}>Growth</h3>
            <p className="text-sm mb-3" style={{ color: '#6B6355' }}>
              CRM + AI tools + 3,000 SMS credits
            </p>
            <div className="mb-1">
              <div className="flex items-end gap-1">
                <span className="text-4xl font-black" style={{ color: NAVY }}>$0</span>
                <span className="text-sm pb-1.5" style={{ color: '#6B6355' }}>/mo during beta</span>
              </div>
              <p className="text-xs mt-1" style={{ color: '#9A3412' }}>
                Becomes <strong>${crmMonthly}/mo</strong> after beta ends
              </p>
            </div>
            <ul className="space-y-2.5 mb-7 mt-4 flex-1">
              {crmFeatures.map((feat, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm" style={{ color: '#3D3530' }}>
                  <Check className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#C4B8AC' }} />
                  {feat}
                </li>
              ))}
              <li className="pt-2 border-t" style={{ borderColor: '#E8E2D8', listStyle: 'none' }}>
                <p className="text-xs font-black uppercase tracking-wide mb-2" style={{ color: ORANGE }}>Messaging</p>
              </li>
              {smsFeatures.map((feat, i) => (
                <li key={`s${i}`} className="flex items-start gap-2.5 text-sm" style={{ color: '#3D3530' }}>
                  <Check className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#C4B8AC' }} />
                  {feat}
                </li>
              ))}
              <li className="pt-2 mt-2 border-t" style={{ borderColor: '#E8E2D8', listStyle: 'none' }}>
                <p className="text-xs" style={{ color: '#9A3412' }}>Need more? Add 750 SMS for $10 anytime.</p>
              </li>
            </ul>
            <button className="w-full py-3.5 rounded-xl font-bold text-sm text-center transition-all hover:opacity-90 active:scale-95"
              style={{ backgroundColor: ORANGE, color: '#fff' }}>
              Choose Plan
            </button>
          </div>

          {/* Pro Plan */}
          <div className="rounded-2xl p-7 relative flex flex-col opacity-75"
            style={{ backgroundColor: '#fff', border: `2px solid #D1C9BF`,
              boxShadow: '0 2px 16px rgba(13,43,85,0.06)' }}>
            <div className="mb-5">
              <span className="text-xs font-black uppercase tracking-wide px-3 py-1.5 rounded-full"
                style={{ backgroundColor: 'rgba(13,43,85,0.08)', color: NAVY }}>
                Coming Soon
              </span>
            </div>
            <h3 className="text-xl font-black mb-1" style={{ color: NAVY }}>Pro</h3>
            <p className="text-sm mb-3" style={{ color: '#6B6355' }}>
              Everything in Growth + 5,000 SMS + 3,000 voice minutes + AI voice agent
            </p>
            <div className="mb-1">
              <div className="flex items-end gap-1">
                <span className="text-4xl font-black" style={{ color: NAVY }}>${crmMonthly + voiceAddon}</span>
                <span className="text-sm pb-1.5" style={{ color: '#6B6355' }}>/mo</span>
              </div>
              <p className="text-xs mt-1" style={{ color: '#6B6355' }}>
                Available after beta
              </p>
            </div>
            <ul className="space-y-2.5 mb-7 mt-4 flex-1">
              {crmFeatures.map((feat, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm" style={{ color: '#3D3530' }}>
                  <Check className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#C4B8AC' }} />
                  {feat}
                </li>
              ))}
              <li className="pt-2 border-t" style={{ borderColor: '#E8E2D8', listStyle: 'none' }}>
                <p className="text-xs font-black uppercase tracking-wide mb-2" style={{ color: ORANGE }}>Messaging & Voice</p>
              </li>
              {proSmsFeatures.map((feat, i) => (
                <li key={`p${i}`} className="flex items-start gap-2.5 text-sm" style={{ color: '#3D3530' }}>
                  <Check className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#C4B8AC' }} />
                  {feat}
                </li>
              ))}
              <li className="pt-2 border-t" style={{ borderColor: '#E8E2D8', listStyle: 'none' }}>
                <p className="text-xs font-black uppercase tracking-wide mb-2" style={{ color: ORANGE }}>AI Voice Agent</p>
              </li>
              {voiceFeatures.map((feat, i) => (
                <li key={`v${i}`} className="flex items-start gap-2.5 text-sm" style={{ color: '#3D3530' }}>
                  <Check className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#C4B8AC' }} />
                  {feat}
                </li>
              ))}
              <li className="pt-2 mt-2 border-t" style={{ borderColor: '#E8E2D8', listStyle: 'none' }}>
                <p className="text-xs" style={{ color: '#9A3412' }}>Need more? Add 750 SMS ($10) or 750 voice minutes ($25) anytime.</p>
              </li>
            </ul>
            <button disabled className="w-full py-3.5 rounded-xl font-bold text-sm text-center cursor-not-allowed"
              style={{ backgroundColor: '#E8E2D8', color: '#9A8E85' }}>
              Available After Beta
            </button>
          </div>
        </div>

        <p className="text-center mt-8 text-sm" style={{ color: '#6B6355' }}>
          Questions?{' '}
          <a href="mailto:support@dealerwyze.com"
            className="underline underline-offset-2 hover:opacity-70 transition-opacity focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 rounded"
            style={{ color: NAVY, outlineColor: NAVY }}>
            support@dealerwyze.com
          </a>
        </p>
      </div>
    </section>
  )
}
