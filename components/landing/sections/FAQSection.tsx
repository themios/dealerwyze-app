'use client'

import React, { useState } from 'react'
import { NAVY, ORANGE } from './_shared'

const faqs = [
  {
    q: 'Does this work with Gmail or IMAP?',
    a: 'Yes. DealerWyze connects directly to your Gmail or any IMAP inbox and automatically imports leads into customer records. No manual entry required.',
  },
  {
    q: 'Can I connect AutoTrader and CarGurus lead emails?',
    a: 'Yes. Lead notification emails from AutoTrader, CarGurus, and most major listing sites are automatically parsed and matched to the right vehicle and customer.',
  },
  {
    q: 'Is there a public website for my inventory?',
    a: 'Yes. DealerWyze includes a branded public inventory site on your DealerWyze URL with SEO-friendly listings, vehicle detail pages, structured data for search engines, and contact forms. Upload your logo and dealer contact info in Settings. It is included in the 30-day trial and stays available on every plan — including free — without a separate website add-on.',
  },
  {
    q: 'Can I use DealerWyze by myself without a team?',
    a: 'Absolutely. The Today list and single-screen workflow are built for one-person and small-team lots. No admin overhead, no complex setup, and no minimum seat count.',
  },
  {
    q: 'Is there a contract?',
    a: 'No. DealerWyze is month-to-month. Cancel anytime from your billing settings - no phone calls, no cancellation fees.',
  },
  {
    q: 'Do I need a credit card to sign up?',
    a: 'No. DealerWyze is free during beta - no credit card required at any point. When paid plans launch, you\'ll have at least 30 days notice and the option to choose a plan or cancel.',
  },
  {
    q: 'Can I import my existing customers and leads?',
    a: 'Yes. CSV import is supported for customers and vehicles. Connect Gmail or IMAP and historical lead emails are imported automatically.',
  },
  {
    q: 'What is BHPH and do I need it?',
    a: 'BHPH (Buy Here Pay Here) is in-house financing where you act as the lender. If you finance your own customers, the BHPH module tracks loans, payments, and collections. If you don\'t do BHPH, you simply don\'t use it.',
  },
  {
    q: 'What\'s included in Complete CRM?',
    a: 'Complete CRM ($150/mo) is all-inclusive: unlimited contacts and leads, two-way SMS with a dedicated business number, fax, Gmail sync, a public SEO-ready dealer inventory website, AI Lead Scanner, AI Dealer Brief, AI Receipt OCR, BHPH loan tracking, bookkeeping, analytics, and team management. No add-ons or hidden fees.',
  },
  {
    q: 'What does the Voice AI add-on do?',
    a: 'The Voice AI add-on ($200/mo, requires Complete CRM) adds a Retell AI phone agent that answers inbound calls 24/7, qualifies leads, and writes call transcripts directly to the customer record - even when you\'re on the lot or after hours. Includes 1,000 voice minutes/month.',
  },
  {
    q: 'Is there an annual discount?',
    a: 'Yes - 10% off when you pay annually. Complete CRM drops from $150/mo to $135/mo (saving $180/yr). The full CRM + Voice stack drops from $350/mo to $315/mo (saving $420/yr).',
  },
  {
    q: 'Is two-way SMS included?',
    a: 'Yes. Two-way SMS is included in Complete CRM and the full stack. You get a dedicated local business number, inbound replies land in the customer thread automatically, and STOP/START opt-out is handled per TCPA requirements.',
  },
  {
    q: 'How is my data protected?',
    a: 'All data is encrypted at rest and in transit (AES-256 / TLS 1.3). Each dealership\'s data is fully isolated - no tenant can access another\'s records. Staff access is role-gated, and every admin action is logged.',
  },
  {
    q: 'What happens to my data if I cancel?',
    a: 'You retain full access until your billing period ends. Before canceling, you can export your customers, vehicles, and transactions to CSV. After a 90-day grace period, data is purged from our servers.',
  },
]

export default function FAQSection() {
  const [open, setOpen] = useState<number | null>(null)

  return (
    <section className="py-20 lg:py-28" style={{ backgroundColor: '#F4F0EA' }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-black" style={{ color: NAVY }}>
            Common questions.
          </h2>
        </div>
        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <div key={i} className="rounded-2xl overflow-hidden transition-all"
              style={{ backgroundColor: '#FDFAF7', border: '1px solid #E8E2D8',
                boxShadow: '0 1px 6px rgba(13,43,85,0.05)' }}>
              <button
                id={`faq-button-${i}`}
                className="w-full text-left px-6 py-4 flex items-center justify-between gap-4 hover:bg-gray-50 transition-colors"
                onClick={() => setOpen(open === i ? null : i)}
                aria-expanded={open === i}
                aria-controls={`faq-item-${i}`}>
                <span className="font-black text-sm" style={{ color: NAVY }}>{faq.q}</span>
                <span className="text-xl font-black flex-shrink-0 transition-transform duration-200" aria-hidden="true"
                  style={{ color: ORANGE, transform: open === i ? 'rotate(45deg)' : 'none' }}>
                  +
                </span>
              </button>
              {open === i && (
                <div id={`faq-item-${i}`} className="px-6 pb-5" role="region" aria-labelledby={`faq-button-${i}`}>
                  <p className="text-sm leading-relaxed" style={{ color: '#3D3530' }}>{faq.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
        <p className="text-center mt-8 text-sm" style={{ color: '#6B6355' }}>
          Still have questions?{' '}
          <a href="mailto:support@dealerwyze.com"
            className="underline underline-offset-2 hover:opacity-70 transition-opacity font-semibold"
            style={{ color: NAVY }}>
            support@dealerwyze.com
          </a>
        </p>
      </div>
    </section>
  )
}
