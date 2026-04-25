'use client'

import React from 'react'
import Link from 'next/link'
import { Check, FlaskConical } from 'lucide-react'
import { NAVY, ORANGE } from './_shared'

const freeFeatures = [
  'Up to 200 contacts & leads',
  'Up to 100 vehicles in inventory',
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
  'Two-way SMS + dedicated business number',
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
  'Add 25 more videos for $10 anytime',
]

const proFeatures = crmFeatures.map(f =>
  f === '25 AI listing videos/month' ? '75 AI listing videos/month' : f
)

const voiceFeatures = [
  'Dedicated AI voice agent (Retell AI)',
  'Answers inbound calls 24/7',
  'Post-call transcripts & summaries',
  'Auto lead creation from inbound calls',
  '1,000 voice minutes/month included',
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
            Start free today. No credit card needed.
          </h2>
          <p className="text-base" style={{ color: '#6B6355' }}>
            We&apos;re in beta - free access while we build together. Paid plans launch when the product is ready.
          </p>
        </div>

        {/* Beta notice banner */}
        <div className="max-w-3xl mx-auto mb-10 rounded-2xl px-6 py-4 flex items-start gap-3"
          style={{ backgroundColor: '#FFF7ED', border: '1.5px solid #FDBA74' }}>
          <FlaskConical className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#9A3412' }} />
          <div>
            <p className="text-sm font-black" style={{ color: '#9A3412' }}>Beta Testing Phase</p>
            <p className="text-sm mt-0.5" style={{ color: '#7C2D12' }}>
              DealerWyze is in active beta. You get full access at no charge while we refine the product.
              We&apos;ll give at least 30 days notice before any paid transition, and early beta users will
              receive a discounted rate when paid plans launch.
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
            <h3 className="text-xl font-black mb-1 text-white">Beta Access</h3>
            <p className="text-sm mb-3" style={{ color: 'rgba(255,255,255,0.65)' }}>
              Full CRM access during our beta phase
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
              className="w-full py-3.5 rounded-xl font-bold text-sm text-white text-center transition-all hover:opacity-90 active:scale-95"
              style={{ backgroundColor: ORANGE, boxShadow: '0 4px 16px rgba(240,112,24,0.4)' }}>
              Start Free - No Card Needed
            </Link>
            <p className="text-center mt-3 text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
              No credit card · No commitment
            </p>
          </div>

          {/* Complete CRM - Coming Soon */}
          <div className="rounded-2xl p-7 relative flex flex-col opacity-75"
            style={{ backgroundColor: '#fff', border: `2px solid #D1C9BF`,
              boxShadow: '0 2px 16px rgba(13,43,85,0.06)' }}>
            <div className="mb-5">
              <span className="text-xs font-black uppercase tracking-wide px-3 py-1.5 rounded-full"
                style={{ backgroundColor: 'rgba(13,43,85,0.08)', color: NAVY }}>
                Coming Soon
              </span>
            </div>
            <h3 className="text-xl font-black mb-1" style={{ color: NAVY }}>Complete CRM</h3>
            <p className="text-sm mb-3" style={{ color: '#6B6355' }}>
              All-inclusive CRM - SMS, fax, AI tools, BHPH, no add-ons
            </p>
            <div className="mb-1">
              <div className="flex items-end gap-1">
                <span className="text-4xl font-black" style={{ color: NAVY }}>${crmMonthly}</span>
                <span className="text-sm pb-1.5" style={{ color: '#6B6355' }}>/mo, billed monthly</span>
              </div>
              <p className="text-xs mt-1" style={{ color: '#9A3412' }}>
                or <strong>${crmAnnual}/mo</strong> billed annually - save ${crmSavings}/yr
              </p>
            </div>
            <ul className="space-y-2.5 mb-7 mt-4 flex-1">
              {crmFeatures.map((feat, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm" style={{ color: '#3D3530' }}>
                  <Check className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#C4B8AC' }} />
                  {feat}
                </li>
              ))}
            </ul>
            <div className="w-full py-3.5 rounded-xl font-bold text-sm text-center cursor-not-allowed"
              style={{ backgroundColor: '#E8E2D8', color: '#9A8E85' }}>
              Available After Beta
            </div>
          </div>

          {/* Complete CRM + Voice - Coming Soon */}
          <div className="rounded-2xl p-7 relative flex flex-col opacity-75"
            style={{ backgroundColor: '#fff', border: `2px solid #D1C9BF`,
              boxShadow: '0 2px 16px rgba(13,43,85,0.06)' }}>
            <div className="mb-5">
              <span className="text-xs font-black uppercase tracking-wide px-3 py-1.5 rounded-full"
                style={{ backgroundColor: 'rgba(13,43,85,0.08)', color: NAVY }}>
                Coming Soon
              </span>
            </div>
            <h3 className="text-xl font-black mb-1" style={{ color: NAVY }}>CRM + Voice AI</h3>
            <p className="text-sm mb-3" style={{ color: '#6B6355' }}>
              Complete CRM plus a 24/7 AI voice agent that qualifies leads
            </p>
            <div className="mb-1">
              <div className="flex items-end gap-1">
                <span className="text-4xl font-black" style={{ color: NAVY }}>${crmMonthly + voiceAddon}</span>
                <span className="text-sm pb-1.5" style={{ color: '#6B6355' }}>/mo</span>
              </div>
              <p className="text-xs mt-1" style={{ color: '#6B6355' }}>
                $150 CRM + $200 Voice add-on
              </p>
              <p className="text-xs mt-0.5" style={{ color: '#9A3412' }}>
                or <strong>${fullAnnual}/mo</strong> billed annually - save ${fullSavings}/yr
              </p>
            </div>
            <ul className="space-y-2.5 mb-7 mt-4 flex-1">
              {proFeatures.map((feat, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm" style={{ color: '#3D3530' }}>
                  <Check className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#C4B8AC' }} />
                  {feat}
                </li>
              ))}
              <li className="pt-2 border-t" style={{ borderColor: '#E8E2D8', listStyle: 'none' }}>
                <p className="text-xs font-black uppercase tracking-wide mb-2" style={{ color: ORANGE }}>Voice Add-on</p>
              </li>
              {voiceFeatures.map((feat, i) => (
                <li key={`v${i}`} className="flex items-start gap-2.5 text-sm" style={{ color: '#3D3530' }}>
                  <Check className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#C4B8AC' }} />
                  {feat}
                </li>
              ))}
            </ul>
            <div className="w-full py-3.5 rounded-xl font-bold text-sm text-center cursor-not-allowed"
              style={{ backgroundColor: '#E8E2D8', color: '#9A8E85' }}>
              Available After Beta
            </div>
          </div>
        </div>

        <p className="text-center mt-8 text-sm" style={{ color: '#6B6355' }}>
          Questions?{' '}
          <a href="mailto:support@dealerwyze.com"
            className="underline underline-offset-2 hover:opacity-70 transition-opacity"
            style={{ color: NAVY }}>
            support@dealerwyze.com
          </a>
        </p>
      </div>
    </section>
  )
}
