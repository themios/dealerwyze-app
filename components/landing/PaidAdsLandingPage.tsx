'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ChevronRight, Check, Star, Sheet, NotebookPen, MessagesSquare, Mail, PhoneCall, ShieldCheck } from 'lucide-react'
import { FadeUp, NAVY, ORANGE, StaggerGrid, cardVariants } from './sections/_shared'
import { motion } from 'framer-motion'

const painPoints = [
  {
    icon: Sheet,
    title: 'Spreadsheets become the inventory system',
    body: 'Vehicles, pricing notes, and deal status end up in a sheet that goes stale the minute the day gets busy.',
  },
  {
    icon: NotebookPen,
    title: 'Follow-up lives in notebooks and your head',
    body: 'Call-backs, promises, and reminders get written down fast, then disappear when the lot gets hectic.',
  },
  {
    icon: MessagesSquare,
    title: 'Texts happen, but nothing is connected',
    body: 'Important buyer conversations sit in personal text threads with no shared history and no link to the deal.',
  },
  {
    icon: Mail,
    title: 'Emails pile up across too many inboxes',
    body: 'Gmail, IMAP, AutoTrader, CarGurus, and random replies create lead chaos instead of a working process.',
  },
]

const featureCards = [
  {
    title: 'Replace scattered lead handling with one connected system',
    points: [
      'Auto-import leads from Gmail and any IMAP inbox',
      'Parse AutoTrader and CarGurus lead emails into customer records',
      'Tie each lead to the exact vehicle they asked about',
    ],
  },
  {
    title: 'Replace notes and memory with an actual daily workflow',
    points: [
      'Today list shows who needs follow-up next',
      'One-tap call and text logging during a busy selling day',
      'Mobile-first flow that works when you are on the lot, not at a desk',
    ],
  },
  {
    title: 'Replace extra dealer tools with one app',
    points: [
      'BHPH loan and payment tracking',
      'Receipt OCR, bookkeeping, and CSV export',
      'Smart pricing intelligence, recall checks, listing videos, and social auto-posting',
    ],
  },
]

const proofBullets = [
  'Built for independent used-car dealers',
  'Free during beta',
  'No credit card required',
  'Replaces spreadsheets, notes, texts, and emails',
]

const comparisonRows = [
  {
    left: 'The dealership runs across spreadsheets, notepads, texts, and inboxes that never stay in sync',
    right: 'DealerWyze pulls leads, vehicles, conversations, and follow-up into one connected workflow',
  },
  {
    left: 'A lot of dealer software adds another tool without replacing the messy system already in use',
    right: 'DealerWyze is designed to replace how small dealers already track deals day to day',
  },
  {
    left: 'Enterprise dealer platforms assume a larger team, more process, and more admin overhead',
    right: 'DealerWyze is built for one-person lots and small independent teams that need speed, clarity, and control',
  },
]

const reviews = [
  {
    body: 'The Today list alone changed how we follow up. We stopped waking up to old leads that nobody touched.',
    author: 'Independent Dealer, Southern California',
  },
  {
    body: 'It finally keeps the customer, the car, and the conversation in one place. That sounds basic, but most dealer software still misses it.',
    author: 'Used Car Dealer, Central Valley, CA',
  },
  {
    body: 'This feels like it was built by someone who has actually worked a small lot. Fast, mobile, and not bloated.',
    author: 'Small Lot Owner, Los Angeles, CA',
  },
]

const faqs = [
  {
    q: 'Who is this page for?',
    a: 'Independent and used-car dealers who want one system for leads, communication, vehicle workflow, BHPH, receipts, pricing, analytics, and marketing without buying a heavy enterprise stack.',
  },
  {
    q: 'Do I need a credit card to try DealerWyze?',
    a: 'No. DealerWyze is free during beta, and signup does not require a credit card.',
  },
  {
    q: 'Can I use this if I do BHPH?',
    a: 'Yes. DealerWyze includes BHPH loan and payment tracking alongside lead follow-up, inventory workflow, and bookkeeping tools.',
  },
  {
    q: 'Is DealerWyze just a CRM?',
    a: 'No. CRM is one part of it, but the full product is dealership management software for independent stores: texting, lead import, vehicle-linked activity, BHPH, receipt OCR, bookkeeping, pricing intelligence, analytics, AI listing videos, social posting, and an optional AI voice agent.',
  },
  {
    q: 'Will switching be a big project?',
    a: 'It does not need to be. The easiest place to start is replacing how you track leads, conversations, and follow-up. Once that is connected, the rest of the workflow is much easier to bring into one system.',
  },
  {
    q: 'What should I do first: book a review or start free?',
    a: 'If you want hands-on help mapping your current workflow, book the 15-minute review. If you already know you want to try the product, start the beta directly.',
  },
]

function AdNav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm shadow-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          <Image src="/logo.png" alt="DealerWyze" width={140} height={47} priority className="object-contain" />
          <div className="flex items-center gap-2">
            <a
              href="mailto:support@dealerwyze.com?subject=15-Minute%20Dealer%20Workflow%20Review"
              className="hidden sm:inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold border transition-colors hover:bg-gray-50"
              style={{ color: NAVY, borderColor: 'rgba(13,43,85,0.18)' }}
            >
              Book Review
            </a>
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95"
              style={{ backgroundColor: ORANGE }}
            >
              Start Free
            </Link>
          </div>
        </div>
      </div>
    </nav>
  )
}

function HeroSection() {
  return (
    <section className="relative overflow-hidden pt-16" style={{ backgroundColor: NAVY }}>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 80% 60% at 50% -10%,rgba(240,112,24,0.15) 0%,transparent 70%)' }}
      />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-20 lg:py-28">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <FadeUp>
            <div>
              <div className="inline-flex items-center gap-2 mb-6">
                <span
                  className="text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full"
                  style={{ backgroundColor: ORANGE, color: '#fff' }}
                >
                  DealerWyze Paid Landing Page
                </span>
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white leading-[1.05] mb-5">
                One System Instead of
                <br />
                <span style={{ color: ORANGE }}>Spreadsheets, Notes, and Missed Messages.</span>
              </h1>
              <p className="text-lg sm:text-xl leading-relaxed mb-8 max-w-xl" style={{ color: 'rgba(255,255,255,0.75)' }}>
                DealerWyze replaces spreadsheets, notepads, random texts, and scattered emails with one dealership
                management system for independent used-car dealers: unlimited leads, two-way SMS, vehicle-linked activity,
                Gmail and IMAP lead import, BHPH tracking, receipt OCR and bookkeeping, smart pricing, analytics, AI
                listing videos, social auto-posting, and an optional AI voice agent.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 mb-5">
                <Link
                  href="/signup"
                  className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl font-bold text-base text-white transition-all hover:opacity-90 active:scale-95 shadow-lg"
                  style={{ backgroundColor: ORANGE, boxShadow: '0 4px 20px rgba(240,112,24,0.4)' }}
                >
                  Start Free Beta
                  <ChevronRight className="w-4 h-4" />
                </Link>
                <a
                  href="mailto:support@dealerwyze.com?subject=15-Minute%20Dealer%20Workflow%20Review"
                  className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl font-semibold text-base transition-all hover:bg-white/10 border"
                  style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.35)' }}
                >
                  Book a 15-Minute Workflow Review
                </a>
              </div>

              <div className="grid sm:grid-cols-2 gap-2.5 max-w-xl">
                {proofBullets.map((item) => (
                  <div
                    key={item}
                    className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm"
                    style={{ backgroundColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.82)' }}
                  >
                    <Check className="w-4 h-4 flex-shrink-0" style={{ color: ORANGE }} />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </FadeUp>

          <FadeUp delay={0.08}>
            <div className="rounded-[2rem] p-5 shadow-2xl" style={{ background: 'linear-gradient(145deg,#16213e 0%,#0D2B55 100%)' }}>
              <div className="rounded-[1.5rem] overflow-hidden border" style={{ borderColor: 'rgba(255,255,255,0.12)' }}>
                <div className="px-5 py-4 border-b" style={{ backgroundColor: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' }}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: 'rgba(255,255,255,0.55)' }}>
                    Today
                  </p>
                  <p className="text-white text-2xl font-black mt-1">3 leads need attention</p>
                  <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.65)' }}>
                    The daily workflow after the chaos is in one system.
                  </p>
                </div>
                <div className="p-4 space-y-3" style={{ backgroundColor: '#0A1B2E' }}>
                  {[
                    ['Hot lead', 'Marcus T.', 'Asked about the 2021 Camry at 9:42pm'],
                    ['Appointment', 'Sarah L.', 'Test drive confirmed for 2:00pm'],
                    ['BHPH', 'Devon W.', 'Needs payment reminder and follow-up'],
                  ].map(([tag, name, note]) => (
                    <div
                      key={name}
                      className="rounded-2xl p-4 border"
                      style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span
                          className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full"
                          style={{ backgroundColor: 'rgba(240,112,24,0.18)', color: ORANGE }}
                        >
                          {tag}
                        </span>
                        <PhoneCall className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.4)' }} />
                      </div>
                      <p className="text-white text-sm font-semibold mt-3">{name}</p>
                      <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.58)' }}>
                        {note}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </FadeUp>
        </div>
      </div>
    </section>
  )
}

function PainSection() {
  return (
    <section className="bg-white py-20 lg:py-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <FadeUp>
          <div className="max-w-3xl mb-12">
            <p className="text-xs font-black uppercase tracking-[0.18em] mb-3" style={{ color: ORANGE }}>
              How small lots actually operate
            </p>
            <h2 className="text-3xl sm:text-4xl font-black mb-4" style={{ color: NAVY }}>
              Most small dealers are not missing effort. They are missing a connected system.
            </h2>
            <p className="text-base sm:text-lg" style={{ color: '#6B6355' }}>
              Leads in Gmail. Messages in text threads. Notes in a notebook or phone. Inventory in a spreadsheet.
              Follow-up in your head. That is how deals get missed.
            </p>
          </div>
        </FadeUp>

        <StaggerGrid className="grid sm:grid-cols-2 xl:grid-cols-4 gap-5">
          {painPoints.map((item) => {
            const Icon = item.icon
            return (
              <motion.div
                key={item.title}
                variants={cardVariants}
                className="rounded-2xl p-6"
                style={{ backgroundColor: '#FDFAF7', border: '1px solid #E8E2D8', boxShadow: '0 2px 12px rgba(13,43,85,0.06)' }}
              >
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: 'rgba(240,112,24,0.1)', color: ORANGE }}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-black mb-2" style={{ color: NAVY }}>
                  {item.title}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: '#5E554C' }}>
                  {item.body}
                </p>
              </motion.div>
            )
          })}
        </StaggerGrid>
      </div>
    </section>
  )
}

function ReplacementSection() {
  const replaces = [
    'Spreadsheets tracking inventory, pricing, and deal status',
    'Notepads and phone notes for reminders and next steps',
    'Random text threads with no shared history',
    'Lead emails scattered across Gmail, IMAP, and marketplace inboxes',
  ]

  const becomes = [
    'Vehicle-linked activity tracking for every customer and car',
    'A Today view that shows who needs follow-up next',
    'Two-way SMS and call logging tied to the deal',
    'One connected workflow for leads, communication, and daily dealership operations',
  ]

  return (
    <section id="comparison" className="py-20 lg:py-24" style={{ backgroundColor: '#F4F0EA' }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <FadeUp>
          <div className="max-w-3xl mb-12">
            <p className="text-xs font-black uppercase tracking-[0.18em] mb-3" style={{ color: ORANGE }}>
              What DealerWyze Replaces
            </p>
            <h2 className="text-3xl sm:text-4xl font-black mb-4" style={{ color: NAVY }}>
              This is not about adding another tool. It is about replacing the messy system already running the lot.
            </h2>
            <p className="text-base sm:text-lg" style={{ color: '#6B6355' }}>
              Start by replacing how you track leads and follow-up. Once that is connected, the rest of the dealership
              workflow has a place to live.
            </p>
          </div>
        </FadeUp>

        <div className="grid lg:grid-cols-2 gap-6">
          <div className="rounded-[2rem] p-7" style={{ backgroundColor: '#fff', border: '1px solid #E8E2D8', boxShadow: '0 8px 28px rgba(13,43,85,0.06)' }}>
            <p className="text-sm font-black uppercase tracking-[0.18em] mb-5" style={{ color: '#A35424' }}>
              What You Are Replacing
            </p>
            <div className="space-y-4">
              {replaces.map((item) => (
                <div key={item} className="flex items-start gap-3 text-sm" style={{ color: '#5E554C' }}>
                  <span className="font-black text-red-400">x</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[2rem] p-7" style={{ backgroundColor: NAVY, boxShadow: '0 12px 32px rgba(13,43,85,0.18)' }}>
            <p className="text-sm font-black uppercase tracking-[0.18em] mb-5" style={{ color: ORANGE }}>
              What It Becomes
            </p>
            <div className="space-y-4">
              {becomes.map((item) => (
                <div key={item} className="flex items-start gap-3 text-sm" style={{ color: 'rgba(255,255,255,0.84)' }}>
                  <Check className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: ORANGE }} />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function ComparisonSection() {
  return (
    <section className="py-20 lg:py-24" style={{ backgroundColor: '#FFF9F2' }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <FadeUp>
          <div className="text-center mb-12">
            <p className="text-xs font-black uppercase tracking-[0.18em] mb-3" style={{ color: ORANGE }}>
              Why this pitch is stronger
            </p>
            <h2 className="text-3xl sm:text-4xl font-black" style={{ color: NAVY }}>
              DealerWyze is built for dealers who never had one connected system to begin with.
            </h2>
          </div>
        </FadeUp>

        <div className="overflow-x-auto rounded-2xl" style={{ boxShadow: '0 10px 30px rgba(13,43,85,0.08)' }}>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="py-4 px-5 text-left text-sm font-black" style={{ backgroundColor: '#ECE6DD', color: '#8A7A6C' }}>
                  The usual dealer software problem
                </th>
                <th className="py-4 px-5 text-left text-sm font-black" style={{ backgroundColor: NAVY, color: ORANGE }}>
                  DealerWyze
                </th>
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map((row) => (
                <tr key={row.left}>
                  <td className="py-5 px-5 text-sm border-b align-top" style={{ borderColor: '#E8E2D8', backgroundColor: '#FAFAFA', color: '#6B6355' }}>
                    <span className="flex items-start gap-2">
                      <span className="font-black text-red-400">x</span>
                      <span>{row.left}</span>
                    </span>
                  </td>
                  <td className="py-5 px-5 text-sm border-b align-top" style={{ borderColor: '#DCE6F0', backgroundColor: '#F0F5FB', color: '#17365E' }}>
                    <span className="flex items-start gap-2">
                      <span className="font-black" style={{ color: ORANGE }}>check</span>
                      <span>{row.right}</span>
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

function FeatureSection() {
  return (
    <section id="features" className="bg-white py-20 lg:py-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <FadeUp>
          <div className="max-w-3xl mb-12">
            <p className="text-xs font-black uppercase tracking-[0.18em] mb-3" style={{ color: ORANGE }}>
              What you get once the chaos is connected
            </p>
            <h2 className="text-3xl sm:text-4xl font-black mb-4" style={{ color: NAVY }}>
              A real dealership system for the way independent dealers actually work.
            </h2>
            <p className="text-base sm:text-lg" style={{ color: '#6B6355' }}>
              DealerWyze gives small lots one place for lead capture, communication, vehicle-linked follow-up, BHPH support,
              receipts and bookkeeping, pricing insight, analytics, listing videos, social distribution, and an optional AI
              voice agent.
            </p>
          </div>
        </FadeUp>

        <StaggerGrid className="grid lg:grid-cols-3 gap-5">
          {featureCards.map((card) => (
            <motion.div
              key={card.title}
              variants={cardVariants}
              className="rounded-2xl p-6"
              style={{ backgroundColor: '#fff', border: '1px solid #E8E2D8', boxShadow: '0 2px 16px rgba(13,43,85,0.06)' }}
            >
              <h3 className="text-xl font-black mb-4" style={{ color: NAVY }}>
                {card.title}
              </h3>
              <ul className="space-y-3">
                {card.points.map((point) => (
                  <li key={point} className="flex items-start gap-2.5 text-sm" style={{ color: '#3D3530' }}>
                    <Check className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: ORANGE }} />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </StaggerGrid>
      </div>
    </section>
  )
}

function OfferSection() {
  return (
    <section id="pricing" className="py-20 lg:py-24" style={{ backgroundColor: '#FFF9F2' }}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <FadeUp>
          <div
            className="rounded-[2rem] overflow-hidden"
            style={{ backgroundColor: NAVY, boxShadow: '0 12px 36px rgba(13,43,85,0.22)' }}
          >
            <div className="grid lg:grid-cols-[1.15fr_0.85fr]">
              <div className="p-8 sm:p-10">
                <p className="text-xs font-black uppercase tracking-[0.18em] mb-3" style={{ color: ORANGE }}>
                  Offer
                </p>
                <h2 className="text-3xl sm:text-4xl font-black text-white mb-4">
                  Start free during beta. Replace the patchwork system you are using now.
                </h2>
                <p className="text-base sm:text-lg mb-6 max-w-xl" style={{ color: 'rgba(255,255,255,0.72)' }}>
                  DealerWyze is built to replace spreadsheets, notes, texts, emails, and disconnected dealer tools with one
                  working system. If you want help mapping your current setup first, book a quick workflow review.
                </p>
                <div className="space-y-3 mb-8">
                  {[
                    'Full beta access at $0/month',
                    'No credit card required',
                    'Built for independent and used-car dealers',
                    'At least 30 days notice before any paid transition',
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-2 text-sm" style={{ color: 'rgba(255,255,255,0.86)' }}>
                      <ShieldCheck className="w-4 h-4 flex-shrink-0" style={{ color: ORANGE }} />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Link
                    href="/signup"
                    className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl font-bold text-base text-white transition-all hover:opacity-90 active:scale-95"
                    style={{ backgroundColor: ORANGE }}
                  >
                    Start Free Beta
                    <ChevronRight className="w-4 h-4" />
                  </Link>
                  <a
                    href="mailto:support@dealerwyze.com?subject=15-Minute%20Dealer%20Workflow%20Review"
                    className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl font-semibold text-base transition-all hover:bg-white/10 border"
                    style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.3)' }}
                  >
                    Book a 15-Minute Workflow Review
                  </a>
                </div>
              </div>

              <div className="p-8 sm:p-10 border-t lg:border-t-0 lg:border-l" style={{ borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.03)' }}>
                <p className="text-sm font-semibold mb-2" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  When paid plans launch
                </p>
                <div className="mb-5">
                  <span className="text-5xl font-black text-white">$150</span>
                  <span className="text-sm ml-1" style={{ color: 'rgba(255,255,255,0.6)' }}>/mo</span>
                </div>
                <ul className="space-y-3">
                  {[
                    'Unlimited contacts and leads',
                    'Two-way SMS with a dedicated business number',
                    'Gmail and IMAP lead auto-import',
                    'BHPH loan and payment tracking',
                    'Receipts, bookkeeping, and CSV export',
                    'Smart pricing intelligence and recall checks',
                    'AI listing videos and social auto-posting',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-sm" style={{ color: 'rgba(255,255,255,0.84)' }}>
                      <Check className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: ORANGE }} />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </FadeUp>
      </div>
    </section>
  )
}

function ReviewsSection() {
  return (
    <section className="bg-white py-20 lg:py-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <FadeUp>
          <div className="text-center mb-12">
            <p className="text-xs font-black uppercase tracking-[0.18em] mb-3" style={{ color: ORANGE }}>
              Trust
            </p>
            <h2 className="text-3xl sm:text-4xl font-black" style={{ color: NAVY }}>
              Small dealers do not need another dashboard. They need clarity and control over a messy business.
            </h2>
          </div>
        </FadeUp>

        <StaggerGrid className="grid sm:grid-cols-3 gap-5">
          {reviews.map((review) => (
            <motion.div
              key={review.author}
              variants={cardVariants}
              className="rounded-2xl p-6 flex flex-col"
              style={{ backgroundColor: '#fff', border: '1px solid #E8E2D8', boxShadow: '0 2px 12px rgba(13,43,85,0.07)' }}
            >
              <div className="flex gap-0.5 mb-4">
                {[...Array(5)].map((_, index) => (
                  <Star key={index} className="w-4 h-4 fill-current" style={{ color: ORANGE }} />
                ))}
              </div>
              <p className="text-sm leading-relaxed flex-1 mb-5" style={{ color: '#3D3530' }}>
                &quot;{review.body}&quot;
              </p>
              <p className="text-xs font-semibold" style={{ color: '#6B6355' }}>
                {review.author}
              </p>
            </motion.div>
          ))}
        </StaggerGrid>
      </div>
    </section>
  )
}

function FAQSection() {
  const [open, setOpen] = useState<number | null>(0)

  return (
    <section className="py-20 lg:py-24" style={{ backgroundColor: '#F4F0EA' }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <FadeUp>
          <div className="text-center mb-12">
            <p className="text-xs font-black uppercase tracking-[0.18em] mb-3" style={{ color: ORANGE }}>
              Objection handling
            </p>
            <h2 className="text-3xl sm:text-4xl font-black" style={{ color: NAVY }}>
              Questions a dealer will have before replacing the current setup.
            </h2>
          </div>
        </FadeUp>

        <div className="space-y-3">
          {faqs.map((faq, index) => (
            <div
              key={faq.q}
              className="rounded-2xl overflow-hidden"
              style={{ backgroundColor: '#FDFAF7', border: '1px solid #E8E2D8', boxShadow: '0 1px 6px rgba(13,43,85,0.05)' }}
            >
              <button
                className="w-full text-left px-6 py-4 flex items-center justify-between gap-4 hover:bg-gray-50 transition-colors"
                onClick={() => setOpen(open === index ? null : index)}
              >
                <span className="font-black text-sm" style={{ color: NAVY }}>{faq.q}</span>
                <span
                  className="text-xl font-black flex-shrink-0 transition-transform duration-200"
                  style={{ color: ORANGE, transform: open === index ? 'rotate(45deg)' : 'none' }}
                >
                  +
                </span>
              </button>
              {open === index && (
                <div className="px-6 pb-5">
                  <p className="text-sm leading-relaxed" style={{ color: '#3D3530' }}>
                    {faq.a}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function FinalCTA() {
  return (
    <section className="relative overflow-hidden py-24 lg:py-28" style={{ backgroundColor: NAVY }}>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 110%,rgba(240,112,24,0.2) 0%,transparent 70%)' }}
      />
      <FadeUp>
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white mb-4">
            If the dealership is still running on spreadsheets, notes, texts, and emails, that is the next thing to fix.
          </h2>
          <p className="text-lg mb-10" style={{ color: 'rgba(255,255,255,0.68)' }}>
            Start free or book a quick workflow review. The goal is simple: replace the messy day-to-day system with one
            connected workflow that helps you miss fewer deals.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl font-bold text-base text-white transition-all hover:opacity-90 active:scale-95 shadow-xl"
              style={{ backgroundColor: ORANGE, boxShadow: '0 6px 24px rgba(240,112,24,0.45)' }}
            >
              Start Free Beta
              <ChevronRight className="w-4 h-4" />
            </Link>
            <a
              href="mailto:support@dealerwyze.com?subject=15-Minute%20Dealer%20Workflow%20Review"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl font-semibold text-base transition-all hover:bg-white/10 border"
              style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.35)' }}
            >
              Book a 15-Minute Workflow Review
            </a>
          </div>
          <p className="mt-5 text-sm" style={{ color: 'rgba(255,255,255,0.42)' }}>
            No credit card. No commitment. Free during beta.
          </p>
        </div>
      </FadeUp>
    </section>
  )
}

function AdFooter() {
  return (
    <footer className="py-8" style={{ backgroundColor: '#060F1E' }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
        <p className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.55)' }}>
          DealerWyze by KMA Auto Inc
        </p>
        <div className="flex items-center gap-4 flex-wrap justify-center">
          <a href="/terms.html" className="text-sm hover:text-white" style={{ color: 'rgba(255,255,255,0.42)' }}>
            Terms
          </a>
          <a href="/privacy.html" className="text-sm hover:text-white" style={{ color: 'rgba(255,255,255,0.42)' }}>
            Privacy
          </a>
          <Link href="/login" className="text-sm hover:text-white" style={{ color: 'rgba(255,255,255,0.42)' }}>
            Sign In
          </Link>
        </div>
      </div>
    </footer>
  )
}

export default function PaidAdsLandingPage() {
  return (
    <>
      <AdNav />
      <main className="landing">
        <HeroSection />
        <PainSection />
        <ReplacementSection />
        <ComparisonSection />
        <FeatureSection />
        <OfferSection />
        <ReviewsSection />
        <FAQSection />
        <FinalCTA />
      </main>
      <AdFooter />
    </>
  )
}
