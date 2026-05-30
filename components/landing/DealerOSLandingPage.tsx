'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { captureUtmParams } from '@/lib/analytics/gtag'
import {
  ChevronRight,
  Check,
  Star,
  MessageSquare,
  Phone,
  Repeat2,
  BellRing,
  Video,
  BarChart2,
  BookOpen,
  Zap,
  ArrowRight,
  ShieldCheck,
  X,
} from 'lucide-react'
import { FadeUp, NAVY, ORANGE, StaggerGrid, cardVariants } from './sections/_shared'
import { motion } from 'framer-motion'

// ─── Data ────────────────────────────────────────────────────────────────────

const automationFlows = [
  {
    tag: 'New Lead',
    time: '11:47 pm',
    headline: 'Lead arrives. DealerWyze responds.',
    description:
      'The moment a lead hits your Gmail or marketplace inbox, the system imports it, creates the customer record, and sends the first follow-up message automatically. You wake up to a warm lead, not a missed one.',
    detail: 'Auto-import from Gmail, AutoTrader, CarGurus, and any IMAP inbox. Day-1 message sent within seconds.',
  },
  {
    tag: 'Mark Sold',
    time: 'after the deal',
    headline: 'Car sold. System kicks in.',
    description:
      'Mark a vehicle sold and DealerWyze automatically requests a Google Review, sends a customer satisfaction survey, and enrolls the buyer in a post-sale follow-up sequence. No checklist required.',
    detail: 'Google Review link, Pulse survey via SMS, and retention sequence start automatically on mark-sold.',
  },
  {
    tag: 'BHPH',
    time: 'payment due Thursday',
    headline: 'Reminder sent. No phone tag.',
    description:
      'BHPH customers get automatic payment reminders before the due date, with a one-click pay link included. You see who paid and who did not - fewer calls, less chasing.',
    detail: 'Automated reminders with Stripe payment link. Payment status updated in real time.',
  },
]

const pillars = [
  {
    icon: MessageSquare,
    label: 'Two-Way SMS',
    desc: 'Real conversations on a dedicated business number. Every text logged to the customer record.',
  },
  {
    icon: Phone,
    label: 'AI Voice Agent',
    desc: 'Retell AI answers inbound calls, qualifies the buyer, and logs a summary when you are busy.',
  },
  {
    icon: Repeat2,
    label: 'Automated Sequences',
    desc: 'Multi-step email and SMS drips that start on lead arrival and stop the moment a customer replies.',
  },
  {
    icon: BellRing,
    label: 'Retention Triggers',
    desc: 'Birthday texts, service reminders, anniversary follow-ups, and referral outreach run automatically once customer dates are on file.',
  },
  {
    icon: Video,
    label: 'Listing Videos',
    desc: 'Branded vehicle videos created from your lot photos and posted to Facebook, Instagram, TikTok, and YouTube.',
  },
  {
    icon: BarChart2,
    label: 'Performance Analytics',
    desc: 'Response time, lead-to-sale ratios, rep drill-down, and an AI-written daily dealer brief from Groq.',
  },
  {
    icon: BookOpen,
    label: 'BHPH + Bookkeeping',
    desc: 'Loan tracking, payment history, receipt OCR, ledger, and CSV export in the same system as your leads.',
  },
  {
    icon: Zap,
    label: 'Smart Pricing',
    desc: 'Live market data, deal rating, recall checks, and AI listing descriptions pulled for every vehicle.',
  },
]

const notACRMRows = [
  {
    crm: 'You log what happened after a call.',
    os: 'The system sends the follow-up before you think to.',
  },
  {
    crm: 'You manually text every new lead.',
    os: 'The system texts the lead within seconds of arrival - before you get the chance to.',
  },
  {
    crm: 'You remember to ask for a review.',
    os: 'The system asks for the review when you mark it sold.',
  },
  {
    crm: 'You chase BHPH customers before due dates.',
    os: 'The system sends the reminder and the pay link automatically.',
  },
  {
    crm: 'Videos and social posting are a separate project.',
    os: 'List the vehicle, the video gets made and posted.',
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
    q: "What does 'takes over communication' actually mean?",
    a: 'It means the system sends messages on your behalf, on a schedule, without you having to think about it. A new lead triggers an immediate text or email. A sale triggers a review request and a survey. A due date triggers a payment reminder. You set the rules once. The system runs them every day.',
  },
  {
    q: 'Is this just a CRM with extra features?',
    a: 'No. A CRM is a place to log what you already did. DealerWyze is a system that does things on your behalf - lead follow-up, payment reminders, review requests, birthday texts, listing videos, and social posting all happen automatically. The CRM part is one module in a larger operating system.',
  },
  {
    q: 'Do I need to set everything up manually?',
    a: "The system includes pre-built starter sequences for new leads, post-sale follow-up, and re-engagement. You can go live with those as-is or customize them. The AI voice agent and social posting require a one-time setup per platform, which takes about 10 minutes each.",
  },
  {
    q: 'Can I use this if I do BHPH?',
    a: 'Yes. BHPH loan tracking, payment history, automated reminders, and secure one-click pay links are built in. Everything is linked to the same customer record as your leads and conversations.',
  },
  {
    q: 'Is DealerWyze free right now?',
    a: 'Yes. DealerWyze is free during the beta period. No credit card is required. You will get at least 30 days notice before any paid transition.',
  },
  {
    q: 'What about birthday texts and service reminders - do those run automatically too?',
    a: 'Yes, but they depend on having the customer date on file. When you add or edit a customer, you can save their birthday and last service date. Once those are in, the triggers fire automatically on schedule. The system will also remind you when useful customer data is missing.',
  },
  {
    q: 'What should I do first?',
    a: 'If you want help mapping your current workflow, book the 15-minute review. If you are ready to try it, sign up and connect your Gmail - your leads will start flowing in within minutes.',
  },
]

// ─── Nav ─────────────────────────────────────────────────────────────────────

function OSNav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm shadow-sm">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          <Image src="/logo.png" alt="DealerWyze" width={140} height={47} priority style={{ height: 'auto' }} className="object-contain" />
          <div className="flex items-center gap-2">
            <a
              href="mailto:support@dealerwyze.com?subject=15-Minute%20Dealer%20Workflow%20Review"
              className="hidden sm:inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold border transition-colors hover:bg-gray-50"
              style={{ color: NAVY, borderColor: 'rgba(13,43,85,0.18)' }}
            >
              Book a Review
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

// ─── Hero ─────────────────────────────────────────────────────────────────────

function OSHeroSection() {
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
                  style={{ backgroundColor: 'rgba(240,112,24,0.18)', color: ORANGE }}
                >
                  Dealership Operating System
                </span>
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-[3.4rem] font-black text-white leading-[1.05] mb-5">
                Your lot keeps running{' '}
                <span style={{ color: ORANGE }}>even when you step away.</span>
              </h1>
              <p className="text-lg sm:text-xl leading-relaxed mb-4 max-w-xl" style={{ color: 'rgba(255,255,255,0.75)' }}>
                DealerWyze answers leads, follows up with buyers, sends BHPH reminders, posts listing videos, and keeps
                retention running - automatically. It is not just a CRM. It is the system that runs your dealership
                communication so your team can focus on selling.
              </p>
              <p className="text-sm mb-8 max-w-xl" style={{ color: 'rgba(255,255,255,0.52)' }}>
                Connect your Gmail and most automation is live within minutes. AI voice and social posting need a
                one-time per-platform setup - about 10 minutes each.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 mb-6">
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

              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm" style={{ color: 'rgba(255,255,255,0.58)' }}>
                {['Free during beta', 'No credit card', 'Built for independent dealers', '30-day notice before any paid plan'].map((item) => (
                  <span key={item} className="flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5" style={{ color: ORANGE }} />
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </FadeUp>

          {/* Live activity feed mockup */}
          <FadeUp delay={0.08}>
            <div className="rounded-[2rem] overflow-hidden shadow-2xl" style={{ background: 'linear-gradient(145deg,#16213e 0%,#0D2B55 100%)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div className="px-5 py-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.04)' }}>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] mb-1" style={{ color: 'rgba(255,255,255,0.70)' }}>
                  Running right now
                </p>
                <p className="text-white font-black text-lg">DealerWyze handled this while you slept</p>
              </div>
              <div className="p-4 space-y-3" style={{ backgroundColor: '#070F1D' }}>
                {[
                  { label: 'Auto-responded', name: 'Marcus T.', note: '2021 Camry inquiry - Day 1 message sent 11:52pm', color: ORANGE },
                  { label: 'Review sent', name: 'Jennifer R.', note: 'Google Review request delivered post-sale', color: '#34D399' },
                  { label: 'Payment reminder', name: 'Devon W.', note: 'BHPH due Friday - reminder + pay link sent', color: '#60A5FA' },
                  { label: 'Sequence step', name: 'Carla M.', note: 'Day 3 follow-up on 2019 Civic delivered', color: ORANGE },
                ].map((item) => (
                  <div
                    key={item.name}
                    className="rounded-xl p-3.5 flex items-start gap-3"
                    style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                  >
                    <span
                      className="text-[9px] font-black uppercase tracking-wide px-2 py-1 rounded-full flex-shrink-0 mt-0.5"
                      style={{ backgroundColor: `${item.color}22`, color: item.color }}
                    >
                      {item.label}
                    </span>
                    <div className="min-w-0">
                      <p className="text-white text-sm font-semibold">{item.name}</p>
                      <p className="text-xs mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.5)' }}>{item.note}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-5 py-3" style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.38)' }}>
                  4 actions taken automatically overnight. You had no part in any of them.
                </p>
              </div>
              <div className="px-5 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-sm italic leading-relaxed" style={{ color: 'rgba(255,255,255,0.65)' }}>
                  &ldquo;It finally keeps the customer, the car, and the conversation in one place.&rdquo;
                </p>
                <p className="text-xs mt-1.5 font-semibold" style={{ color: 'rgba(255,255,255,0.38)' }}>
                  Used Car Dealer, Central Valley, CA
                </p>
              </div>
            </div>
          </FadeUp>
        </div>
      </div>
    </section>
  )
}

// ─── Not-a-CRM section ───────────────────────────────────────────────────────

function NotACRMSection() {
  return (
    <section className="py-20 lg:py-24" style={{ backgroundColor: '#F4F0EA' }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <FadeUp>
          <div className="max-w-3xl mb-12">
            <p className="text-xs font-black uppercase tracking-[0.18em] mb-3" style={{ color: ORANGE }}>
              This is not a CRM
            </p>
            <h2 className="text-3xl sm:text-4xl font-black mb-4" style={{ color: NAVY }}>
              A CRM stores what you already did. DealerWyze does things on your behalf.
            </h2>
            <p className="text-base sm:text-lg" style={{ color: '#6B6355' }}>
              Most dealer software is a better place to log notes. DealerWyze is a system that acts - automatically,
              on a schedule, without you triggering it every time.
            </p>
          </div>
        </FadeUp>

        <div className="rounded-[2rem] overflow-hidden shadow-lg" style={{ border: '1px solid #E0D8CE' }}>
          <div className="grid sm:grid-cols-2">
            {/* Header row */}
            <div className="px-6 py-4" style={{ backgroundColor: '#EDE7DC' }}>
              <p className="text-xs font-black uppercase tracking-[0.15em]" style={{ color: '#9A7F68' }}>
                Standard CRM
              </p>
            </div>
            <div className="px-6 py-4" style={{ backgroundColor: NAVY }}>
              <p className="text-xs font-black uppercase tracking-[0.15em]" style={{ color: ORANGE }}>
                DealerWyze
              </p>
            </div>
            {/* Rows */}
            {notACRMRows.map((row, i) => (
              <React.Fragment key={i}>
                <div
                  className="px-6 py-5 flex items-start gap-3 text-sm border-t"
                  style={{ backgroundColor: i % 2 === 0 ? '#FDFAF7' : '#FAF5EF', borderColor: '#E8E2D8', color: '#5E554C' }}
                >
                  <X className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-400" />
                  <span>{row.crm}</span>
                </div>
                <div
                  className="px-6 py-5 flex items-start gap-3 text-sm border-t"
                  style={{ backgroundColor: i % 2 === 0 ? '#0E2244' : '#0D2B55', borderColor: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.82)' }}
                >
                  <Check className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: ORANGE }} />
                  <span>{row.os}</span>
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── Automation Flows ─────────────────────────────────────────────────────────

function AutomationSection() {
  return (
    <section className="bg-white py-20 lg:py-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <FadeUp>
          <div className="max-w-3xl mb-12">
            <p className="text-xs font-black uppercase tracking-[0.18em] mb-3" style={{ color: ORANGE }}>
              What runs automatically
            </p>
            <h2 className="text-3xl sm:text-4xl font-black mb-4" style={{ color: NAVY }}>
              Three workflows your dealership runs today - now running without you.
            </h2>
            <p className="text-base sm:text-lg" style={{ color: '#6B6355' }}>
              These are not features you check in on. They are workflows that fire on their own, every day, across your
              entire customer list.
            </p>
          </div>
        </FadeUp>

        <StaggerGrid className="grid lg:grid-cols-3 gap-5">
          {automationFlows.map((flow) => (
            <motion.div
              key={flow.tag}
              variants={cardVariants}
              className="rounded-2xl overflow-hidden flex flex-col"
              style={{ border: '1px solid #E8E2D8', boxShadow: '0 4px 20px rgba(13,43,85,0.07)' }}
            >
              <div className="px-6 py-4" style={{ backgroundColor: NAVY }}>
                <div className="flex items-center justify-between">
                  <span
                    className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full"
                    style={{ backgroundColor: 'rgba(240,112,24,0.22)', color: ORANGE }}
                  >
                    {flow.tag}
                  </span>
                  <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.4)' }}>{flow.time}</span>
                </div>
              </div>
              <div className="px-6 py-6 flex-1 flex flex-col" style={{ backgroundColor: '#FDFAF7' }}>
                <h3 className="text-xl font-black mb-3" style={{ color: NAVY }}>
                  {flow.headline}
                </h3>
                <p className="text-sm leading-relaxed flex-1 mb-4" style={{ color: '#5E554C' }}>
                  {flow.description}
                </p>
                <p className="text-xs font-semibold leading-relaxed px-3 py-2.5 rounded-xl" style={{ color: '#7A5C3A', backgroundColor: 'rgba(240,112,24,0.09)' }}>
                  {flow.detail}
                </p>
              </div>
            </motion.div>
          ))}
        </StaggerGrid>
      </div>
    </section>
  )
}

// ─── Feature Pillars ─────────────────────────────────────────────────────────

function FeaturePillarsSection() {
  return (
    <section className="py-20 lg:py-24" style={{ backgroundColor: '#FFF9F2' }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <FadeUp>
          <div className="max-w-3xl mb-12">
            <p className="text-xs font-black uppercase tracking-[0.18em] mb-3" style={{ color: ORANGE }}>
              The full system
            </p>
            <h2 className="text-3xl sm:text-4xl font-black mb-4" style={{ color: NAVY }}>
              That is the communication layer. The full system covers your entire dealership.
            </h2>
            <p className="text-base sm:text-lg" style={{ color: '#6B6355' }}>
              Beyond automated follow-up: BHPH loan tracking, receipt OCR, bookkeeping, smart pricing with market
              comparisons, recall checks, AI listing descriptions, performance analytics, and a daily AI dealer brief.
              All in the same login as your leads and conversations.
            </p>
          </div>
        </FadeUp>

        <StaggerGrid className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {pillars.map((pillar) => {
            const Icon = pillar.icon
            return (
              <motion.div
                key={pillar.label}
                variants={cardVariants}
                className="rounded-2xl p-5"
                style={{ backgroundColor: '#fff', border: '1px solid #E8E2D8', boxShadow: '0 2px 12px rgba(13,43,85,0.06)' }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: 'rgba(240,112,24,0.1)', color: ORANGE }}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <h3 className="text-base font-black mb-1.5" style={{ color: NAVY }}>
                  {pillar.label}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: '#6B6355' }}>
                  {pillar.desc}
                </p>
              </motion.div>
            )
          })}
        </StaggerGrid>
      </div>
    </section>
  )
}

// ─── Social Proof ─────────────────────────────────────────────────────────────

function SocialProofSection() {
  return (
    <section className="bg-white py-20 lg:py-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <FadeUp>
          <div className="text-center mb-12">
            <p className="text-xs font-black uppercase tracking-[0.18em] mb-3" style={{ color: ORANGE }}>
              Early dealers
            </p>
            <h2 className="text-3xl sm:text-4xl font-black" style={{ color: NAVY }}>
              Built with feedback from small lots that are already using it.
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
                {[...Array(5)].map((_, idx) => (
                  <Star key={idx} className="w-4 h-4 fill-current" style={{ color: ORANGE }} />
                ))}
              </div>
              <p className="text-sm leading-relaxed flex-1 mb-5" style={{ color: '#3D3530' }}>
                &ldquo;{review.body}&rdquo;
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

// ─── Offer ────────────────────────────────────────────────────────────────────

function OfferSection() {
  return (
    <section className="py-20 lg:py-24" style={{ backgroundColor: '#F4F0EA' }}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <FadeUp>
          <div
            className="rounded-[2rem] overflow-hidden"
            style={{ backgroundColor: NAVY, boxShadow: '0 12px 36px rgba(13,43,85,0.22)' }}
          >
            <div className="grid lg:grid-cols-[1.2fr_0.8fr]">
              <div className="p-8 sm:p-10">
                <p className="text-xs font-black uppercase tracking-[0.18em] mb-3" style={{ color: ORANGE }}>
                  Offer
                </p>
                <h2 className="text-3xl sm:text-4xl font-black text-white mb-4">
                  Free during beta. Full operating system from day one.
                </h2>
                <p className="text-base sm:text-lg mb-6 max-w-xl" style={{ color: 'rgba(255,255,255,0.72)' }}>
                  Every feature - automated follow-up, AI voice, BHPH, bookkeeping, videos, social posting - is included.
                  No credit card. No stripped-down trial.
                </p>
                <div className="space-y-3 mb-8">
                  {[
                    'Full beta access at $0/month',
                    'No credit card required',
                    'At least 30 days notice before any paid transition',
                    'Built for independent and used-car dealers',
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

              <div
                className="p-8 sm:p-10 border-t lg:border-t-0 lg:border-l"
                style={{ borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.03)' }}
              >
                <p className="text-sm font-semibold mb-2" style={{ color: 'rgba(255,255,255,0.6)' }}>
                  When paid plans launch
                </p>
                <div className="mb-5">
                  <span className="text-5xl font-black text-white">$150</span>
                  <span className="text-sm ml-1" style={{ color: 'rgba(255,255,255,0.6)' }}>/mo</span>
                </div>
                <ul className="space-y-2.5">
                  {[
                    'Unlimited contacts and leads',
                    'Two-way SMS + dedicated number',
                    'AI voice agent',
                    'Gmail and IMAP auto-import',
                    'Automated sequences',
                    'BHPH loan and payment tracking',
                    'Receipts, bookkeeping, CSV export',
                    'Listing videos + social auto-posting',
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

// ─── FAQ ──────────────────────────────────────────────────────────────────────

function OSFAQSection() {
  const [open, setOpen] = useState<number | null>(0)

  return (
    <section className="py-20 lg:py-24 bg-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <FadeUp>
          <div className="text-center mb-12">
            <p className="text-xs font-black uppercase tracking-[0.18em] mb-3" style={{ color: ORANGE }}>
              Common questions
            </p>
            <h2 className="text-3xl sm:text-4xl font-black" style={{ color: NAVY }}>
              What dealers ask before switching.
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

// ─── Final CTA ────────────────────────────────────────────────────────────────

function OSFinalCTA() {
  return (
    <section className="relative overflow-hidden py-24 lg:py-28" style={{ backgroundColor: NAVY }}>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 110%,rgba(240,112,24,0.2) 0%,transparent 70%)' }}
      />
      <FadeUp>
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white mb-4">
            One system for your leads, your customers, and your lot.
          </h2>
          <p className="text-lg mb-10" style={{ color: 'rgba(255,255,255,0.68)' }}>
            Connect your Gmail and most automation is live in minutes. The rest of the system - BHPH, bookkeeping,
            pricing, videos, analytics - is there when you need it. Start free or book a quick workflow review.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl font-bold text-base text-white transition-all hover:opacity-90 active:scale-95 shadow-xl"
              style={{ backgroundColor: ORANGE, boxShadow: '0 6px 24px rgba(240,112,24,0.45)' }}
            >
              Start Free Beta
              <ArrowRight className="w-4 h-4" />
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

// ─── Footer ───────────────────────────────────────────────────────────────────

function OSFooter() {
  return (
    <footer className="py-8" style={{ backgroundColor: '#060F1E' }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
        <p className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.55)' }}>
          DealerWyze by KMA Auto Inc
        </p>
        <div className="flex items-center gap-4 flex-wrap justify-center">
          <a href="/terms.html" className="text-sm hover:text-white" style={{ color: 'rgba(255,255,255,0.42)' }}>Terms</a>
          <a href="/privacy.html" className="text-sm hover:text-white" style={{ color: 'rgba(255,255,255,0.42)' }}>Privacy</a>
          <Link href="/login" className="text-sm hover:text-white" style={{ color: 'rgba(255,255,255,0.42)' }}>Sign In</Link>
        </div>
      </div>
    </footer>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DealerOSLandingPage() {
  // Capture UTM params on first view so they survive navigation to /signup
  useEffect(() => { captureUtmParams() }, [])

  return (
    <>
      <OSNav />
      <main className="landing">
        <OSHeroSection />
        <NotACRMSection />
        <AutomationSection />
        <FeaturePillarsSection />
        <SocialProofSection />
        <OfferSection />
        <OSFAQSection />
        <OSFinalCTA />
      </main>
      <OSFooter />
    </>
  )
}
