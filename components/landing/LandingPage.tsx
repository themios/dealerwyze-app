'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import Script from 'next/script'
import {
  ListChecks,
  MessageSquare,
  Mail,
  Car,
  CalendarDays,
  Search,
  Menu,
  X,
  Check,
  Star,
  ChevronRight,
  Phone,
  FileText,
  BarChart3,
  Mic,
  ScanLine,
  CreditCard,
  Users,
  Printer,
  BookOpen,
  Sparkles,
  Building2,
  Paperclip,
  FileImage,
  Wallet,
  TrendingUp,
  ShieldCheck,
} from 'lucide-react'

// ─── Colours ─────────────────────────────────────────────────────────────────
const NAVY   = '#0D2B55'
const ORANGE = '#F07018'

// ─── Nav ────────────────────────────────────────────────────────────────────

function Nav() {
  const [scrolled, setScrolled]       = useState(false)
  const [mobileOpen, setMobileOpen]   = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const navLinks = [
    { label: 'Features', href: '#features' },
    { label: 'Pricing',  href: '#pricing'  },
    { label: 'Blog',     href: '/blog'     },
  ]

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
      scrolled ? 'bg-white shadow-md' : 'bg-white/95 backdrop-blur-sm'
    }`}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">

          {/* Wordmark */}
          <div className="flex items-center">
            <Image src="/logo.png" alt="DealerWyze" width={140} height={47} className="object-contain" />
          </div>

          {/* Desktop nav */}
          <div className="hidden sm:flex items-center gap-1">
            {navLinks.map(l => (
              <a key={l.href} href={l.href}
                className="text-sm font-medium px-4 py-2 rounded-lg transition-colors hover:bg-gray-100"
                style={{ color: NAVY }}>
                {l.label}
              </a>
            ))}
            <Link href="/login"
              className="text-sm font-medium px-4 py-2 rounded-lg transition-colors hover:bg-gray-100 ml-2"
              style={{ color: NAVY }}>
              Sign In
            </Link>
            <Link href="/signup"
              className="text-sm font-semibold px-4 py-2 rounded-lg text-white transition-all hover:opacity-90 active:scale-95 ml-1"
              style={{ backgroundColor: ORANGE }}>
              Start Free
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button className="sm:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
            onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle menu">
            {mobileOpen
              ? <X    className="w-5 h-5" style={{ color: NAVY }} />
              : <Menu className="w-5 h-5" style={{ color: NAVY }} />}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="sm:hidden border-t border-gray-100 py-4 flex flex-col gap-2 pb-4">
            {navLinks.map(l => (
              <a key={l.href} href={l.href}
                className="text-sm font-medium px-4 py-2.5 rounded-lg text-center hover:bg-gray-50 transition-colors"
                style={{ color: NAVY }}
                onClick={() => setMobileOpen(false)}>
                {l.label}
              </a>
            ))}
            <Link href="/login"
              className="text-sm font-medium px-4 py-2.5 rounded-lg text-center border transition-colors hover:bg-gray-50"
              style={{ color: NAVY, borderColor: NAVY }}
              onClick={() => setMobileOpen(false)}>
              Sign In
            </Link>
            <Link href="/signup"
              className="text-sm font-semibold px-4 py-2.5 rounded-lg text-white text-center transition-all hover:opacity-90"
              style={{ backgroundColor: ORANGE }}
              onClick={() => setMobileOpen(false)}>
              Start Free
            </Link>
          </div>
        )}
      </div>
    </nav>
  )
}

// ─── Phone Mockup ────────────────────────────────────────────────────────────

function PhoneMockup() {
  const tasks = [
    { color: '#22c55e', label: 'Call',  name: 'Marcus T.',  note: 'Interested in 2021 Camry' },
    { color: '#3b82f6', label: 'Appt',  name: 'Sarah L.',   note: 'Test drive @ 2pm today' },
    { color: ORANGE,    label: 'SMS',   name: 'Devon W.',   note: 'Asked about financing terms' },
  ]

  return (
    <div className="flex justify-center items-center">
      <div className="relative rounded-[2.5rem] p-1 shadow-2xl"
        style={{ background: 'linear-gradient(145deg,#1a1a2e 0%,#16213e 100%)', width: '220px',
          border: '2px solid rgba(255,255,255,0.15)' }}>
        {/* Notch */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 rounded-b-xl"
          style={{ width: '80px', height: '22px', backgroundColor: '#0a0a1a', zIndex: 10 }} />
        {/* Screen */}
        <div className="rounded-[2rem] overflow-hidden"
          style={{ backgroundColor: NAVY, minHeight: '400px', padding: '28px 12px 16px' }}>
          <div className="flex justify-between items-center mb-4 px-1">
            <span className="text-white/50 text-[9px] font-medium">9:41</span>
            <div className="flex gap-1">
              <div className="w-3 h-1.5 rounded-sm bg-white/40" />
              <div className="w-1 h-1.5 rounded-sm bg-white/40" />
            </div>
          </div>
          <div className="mb-3 px-1">
            <p className="text-white/60 text-[10px] uppercase tracking-widest font-semibold">Today</p>
            <p className="text-white font-bold text-lg leading-tight">3 need attention</p>
          </div>
          <div className="flex flex-col gap-2">
            {tasks.map((task, i) => (
              <div key={i} className="rounded-xl overflow-hidden flex"
                style={{ backgroundColor: 'rgba(255,255,255,0.07)' }}>
                <div className="w-1 flex-shrink-0 rounded-l-xl" style={{ backgroundColor: task.color }} />
                <div className="px-3 py-2.5 flex-1">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: task.color + '33', color: task.color }}>
                      {task.label}
                    </span>
                  </div>
                  <p className="text-white text-[11px] font-semibold leading-tight">{task.name}</p>
                  <p className="text-white/50 text-[9px] leading-tight mt-0.5">{task.note}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-center mt-4">
            <div className="w-12 h-1 rounded-full bg-white/20" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Hero ────────────────────────────────────────────────────────────────────

function HeroSection() {
  return (
    <section className="relative overflow-hidden pt-16" style={{ backgroundColor: NAVY }}>
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 80% 60% at 50% -10%,rgba(240,112,24,0.15) 0%,transparent 70%)' }} />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-20 lg:py-32">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div>
            <div className="inline-flex items-center gap-2 mb-6">
              <span className="text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full"
                style={{ backgroundColor: ORANGE, color: '#fff' }}>
                Built for Independent Dealers
              </span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white leading-[1.05] mb-5">
              Stop Losing Deals<br />
              <span style={{ color: ORANGE }}>Overnight.</span>
            </h1>
            <p className="text-lg sm:text-xl leading-relaxed mb-8 max-w-lg"
              style={{ color: 'rgba(255,255,255,0.75)' }}>
              DealerWyze gives you one place for every lead, every car, and every
              next step — so you stop context-switching and start closing.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <Link href="/signup"
                className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl font-bold text-base text-white transition-all hover:opacity-90 active:scale-95 shadow-lg"
                style={{ backgroundColor: ORANGE, boxShadow: '0 4px 20px rgba(240,112,24,0.4)' }}>
                Start Free — No Card Needed
                <ChevronRight className="w-4 h-4" />
              </Link>
              <a href="#features"
                className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl font-semibold text-base transition-all hover:bg-white/10 border"
                style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.35)' }}>
                See How It Works
              </a>
            </div>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
              Free during beta · No credit card · No commitment
            </p>
          </div>
          <div className="flex justify-center lg:justify-end">
            <PhoneMockup />
          </div>
        </div>
      </div>

      <div className="relative" style={{ height: '60px', marginTop: '-1px' }}>
        <svg viewBox="0 0 1440 60" preserveAspectRatio="none"
          className="absolute bottom-0 left-0 w-full h-full" style={{ fill: '#ffffff' }}>
          <path d="M0,60 C360,0 1080,0 1440,60 L1440,60 L0,60 Z" />
        </svg>
      </div>
    </section>
  )
}

// ─── Pain ────────────────────────────────────────────────────────────────────

const painPoints = [
  { emoji: '📱', title: 'Leads from everywhere',
    desc: 'Calls, texts, Gmail, AutoTrader, CarGurus — no single place to track them all.' },
  { emoji: '🌙', title: 'The overnight miss',
    desc: "A lead came in at 10pm. By morning, they'd already bought from the dealer who responded at 10:01pm." },
  { emoji: '🚗', title: 'Which car did they want?',
    desc: 'You remember the customer but not the vehicle. You scroll through texts trying to piece it together.' },
  { emoji: '📋', title: 'No system = no follow-up',
    desc: 'You mean to call back. You get busy. Three days pass. The deal is gone.' },
]

function PainSection() {
  return (
    <section className="bg-white py-20 lg:py-28">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-14">
          <p className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: ORANGE }}>
            The Problem
          </p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-4" style={{ color: NAVY }}>
            Running a small lot means wearing every hat.
          </h2>
          <p className="text-lg max-w-xl mx-auto" style={{ color: '#6B6355' }}>
            And somewhere between the calls, texts, and emails — deals fall through the cracks.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-5">
          {painPoints.map((p, i) => (
            <div key={i} className="group rounded-2xl p-6 transition-all duration-200 hover:-translate-y-1 cursor-default"
              style={{ backgroundColor: '#F8F4EE', border: '1px solid #E8E2D8',
                boxShadow: '0 1px 4px rgba(13,43,85,0.06)' }}>
              <div className="text-3xl mb-3">{p.emoji}</div>
              <h3 className="font-black text-lg mb-2" style={{ color: NAVY }}>{p.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: '#6B6355' }}>{p.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── How It Works ─────────────────────────────────────────────────────────────

const howSteps = [
  {
    num: '01',
    title: 'Connect your lead sources',
    desc: 'Link Gmail or any IMAP account. Leads from AutoTrader, CarGurus, and your website forms import automatically — no copy-pasting ever again.',
  },
  {
    num: '02',
    title: 'Work your Today list',
    desc: 'Every customer links to their vehicle interest. Log a call in 10 seconds. Set the next step. The app surfaces exactly who needs attention and when.',
  },
  {
    num: '03',
    title: 'Close more deals — and prove it',
    desc: 'Track every deal from first contact to sold. BHPH loans, payments, and collections in the same app. Analytics show what\'s working.',
  },
]

function HowItWorksSection() {
  return (
    <section className="py-20 lg:py-28" style={{ backgroundColor: '#F4F0EA' }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-14">
          <p className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: ORANGE }}>
            How It Works
          </p>
          <h2 className="text-3xl sm:text-4xl font-black" style={{ color: NAVY }}>
            Up and running in an afternoon.
          </h2>
          <p className="text-base mt-3 max-w-xl mx-auto" style={{ color: '#6B6355' }}>
            No IT department. No 6-week onboarding. No training sessions.
          </p>
        </div>
        <div className="grid sm:grid-cols-3 gap-6">
          {howSteps.map((step, i) => (
            <div key={i} className="relative rounded-2xl p-7 flex flex-col"
              style={{ backgroundColor: '#fff', border: '1px solid #E8E2D8',
                boxShadow: '0 2px 12px rgba(13,43,85,0.06)' }}>
              <div className="text-5xl font-black mb-4 leading-none select-none"
                style={{ color: `rgba(240,112,24,0.18)` }}>
                {step.num}
              </div>
              <h3 className="font-black text-lg mb-2" style={{ color: NAVY }}>{step.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: '#6B6355' }}>{step.desc}</p>
              {i < howSteps.length - 1 && (
                <div className="hidden sm:block absolute -right-3 top-1/2 -translate-y-1/2 z-10
                  w-6 h-6 rounded-full flex items-center justify-center text-xs font-black"
                  style={{ backgroundColor: ORANGE, color: '#fff' }}>
                  →
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Today List ───────────────────────────────────────────────────────────────

const todayCallouts = [
  { icon: '⚡', title: '10-second logging',
    desc: 'Call a customer, log the outcome and next step in one tap. No typing essays.' },
  { icon: '📅', title: 'Never miss a follow-up',
    desc: 'Every touch auto-creates the next step. Nothing falls off the list.' },
  { icon: '🚗', title: 'Vehicle-linked',
    desc: "Every customer is connected to the car they're considering. Full context, instantly." },
]

function TodayListSection() {
  return (
    <section className="py-20 lg:py-28" style={{ backgroundColor: NAVY }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white mb-5">
            One list. Everything that needs your{' '}
            <span style={{ color: ORANGE }}>attention today.</span>
          </h2>
          <p className="text-lg max-w-2xl mx-auto" style={{ color: 'rgba(255,255,255,0.65)' }}>
            Overdue calls. Appointment requests. New leads. Customers waiting on a reply.
            All in one place — ranked by urgency, not by when it arrived in your inbox.
          </p>
        </div>
        <div className="grid sm:grid-cols-3 gap-5">
          {todayCallouts.map((c, i) => (
            <div key={i} className="rounded-2xl p-6 transition-all duration-200 hover:-translate-y-1"
              style={{ backgroundColor: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(10px)' }}>
              <div className="text-3xl mb-4">{c.icon}</div>
              <h3 className="font-black text-white text-lg mb-2">{c.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>{c.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── AI Section ───────────────────────────────────────────────────────────────

const aiFeatures = [
  { icon: '🤖', title: 'AI Voice Agent',
    desc: 'A Retell AI agent answers inbound calls, qualifies leads, and logs the full transcript and summary back to the customer record — automatically.' },
  { icon: '📸', title: 'AI Lead Scanner',
    desc: 'Snap a photo of a handwritten buyer inquiry or upload a PDF. AI extracts the customer name, phone, vehicle interest, and creates the lead in seconds.' },
  { icon: '📰', title: 'AI Dealer Brief',
    desc: 'Every morning, a one-paragraph summary of your day: new leads, appointments, overdue follow-ups, and what needs to happen first.' },
  { icon: '🧾', title: 'AI Receipt OCR',
    desc: 'Upload a receipt photo. AI extracts vendor, amount, category, and posts it to your ledger — cutting bookkeeping time by half.' },
  { icon: '📊', title: 'AI Smart Pricing',
    desc: 'Get live Fast Sale, Fair Market, and Max Return price tiers for any vehicle in your inventory — with market comps, an NHTSA reliability check, and a full AI market analysis. No CarGurus subscription needed.' },
]

function AISection() {
  return (
    <section className="py-20 lg:py-28" style={{ backgroundColor: '#FAFAFA' }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 mb-4 px-4 py-2 rounded-full"
            style={{ backgroundColor: 'rgba(240,112,24,0.1)', border: '1px solid rgba(240,112,24,0.25)' }}>
            <Sparkles className="w-4 h-4" style={{ color: ORANGE }} />
            <span className="text-xs font-black uppercase tracking-widest" style={{ color: ORANGE }}>
              AI-Powered
            </span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-4" style={{ color: NAVY }}>
            Works while you&apos;re on the lot.
          </h2>
          <p className="text-lg max-w-2xl mx-auto" style={{ color: '#6B6355' }}>
            Five AI systems handle the tedious parts — so you focus on the customer in front of you.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-5">
          {aiFeatures.map((f, i) => (
            <div key={i} className="rounded-2xl p-6 flex gap-4 transition-all duration-200 hover:-translate-y-1"
              style={{ backgroundColor: '#fff', border: '1px solid #E8E2D8',
                boxShadow: '0 2px 12px rgba(13,43,85,0.06)' }}>
              <div className="text-3xl flex-shrink-0">{f.icon}</div>
              <div>
                <h3 className="font-black text-base mb-1.5" style={{ color: NAVY }}>{f.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: '#6B6355' }}>{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Smart Pricing ────────────────────────────────────────────────────────────

function SmartPricingSection() {
  const tiers = [
    { label: 'Fast Sale',    color: '#22c55e', desc: '60-day target — price to move now' },
    { label: 'Fair Market',  color: ORANGE,    desc: '90-day target — balanced approach' },
    { label: 'Max Return',   color: '#3b82f6', desc: '120-day target — hold for top dollar' },
  ]

  return (
    <section className="py-20 lg:py-28" style={{ backgroundColor: '#F4F0EA' }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">

          {/* Left — copy */}
          <div>
            <div className="inline-flex items-center gap-2 mb-5 px-4 py-2 rounded-full"
              style={{ backgroundColor: 'rgba(240,112,24,0.1)', border: '1px solid rgba(240,112,24,0.25)' }}>
              <TrendingUp className="w-4 h-4" style={{ color: ORANGE }} />
              <span className="text-xs font-black uppercase tracking-widest" style={{ color: ORANGE }}>
                Smart Pricing Intelligence
              </span>
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black leading-[1.1] mb-5" style={{ color: NAVY }}>
              Know exactly what to price
              <br />
              <span style={{ color: ORANGE }}>every car on your lot.</span>
            </h2>
            <p className="text-lg leading-relaxed mb-6" style={{ color: '#6B6355' }}>
              CarGurus charges $2,000/month for live pricing comps. DealerWyze puts the same
              intelligence inside your CRM — with three pricing tiers, a market confidence score,
              and an AI-written market analysis report — for no additional cost.
            </p>
            <ul className="space-y-3 mb-8">
              {[
                'Live market comps based on comparable vehicles sold nearby',
                'NHTSA recall check and reliability risk on every vehicle',
                'AI-generated listing description from market data',
                'Deal rating badge for your public inventory pages',
                'Results cached 7 days — one click, instant answer',
              ].map((item, i) => (
                <li key={i} className="flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: ORANGE }} />
                  <span className="text-sm leading-snug" style={{ color: '#3D3530' }}>{item}</span>
                </li>
              ))}
            </ul>
            <p className="text-sm font-semibold" style={{ color: NAVY }}>
              Price to move in 60 days — or hold for maximum return. The choice is yours.
            </p>
          </div>

          {/* Right — pricing card mockup */}
          <div className="flex justify-center lg:justify-end">
            <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-2xl"
              style={{ backgroundColor: '#fff', border: '1px solid #E8E2D8' }}>

              {/* Card header */}
              <div className="px-5 py-4 border-b" style={{ borderColor: '#E8E2D8' }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-black uppercase tracking-widest" style={{ color: NAVY }}>
                    Market Intelligence
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: '#dcfce7', color: '#15803d' }}>
                    Strong Market · 47 comps
                  </span>
                </div>
                <p className="text-sm font-semibold" style={{ color: '#6B6355' }}>2019 Toyota Camry SE · 62k mi</p>
              </div>

              {/* Pricing tiers */}
              <div className="px-5 py-4 space-y-3">
                {tiers.map((t, i) => (
                  <div key={i} className="flex items-center justify-between py-2.5 px-3 rounded-xl"
                    style={{ backgroundColor: t.color + '12', border: `1px solid ${t.color}33` }}>
                    <div>
                      <p className="text-xs font-black" style={{ color: t.color }}>{t.label}</p>
                      <p className="text-[10px]" style={{ color: '#9C897A' }}>{t.desc}</p>
                    </div>
                    <p className="text-lg font-black" style={{ color: t.color }}>
                      {i === 0 ? '$18,400' : i === 1 ? '$20,200' : '$22,500'}
                    </p>
                  </div>
                ))}
              </div>

              {/* NHTSA row */}
              <div className="px-5 py-3 border-t flex items-center justify-between" style={{ borderColor: '#E8E2D8' }}>
                <span className="text-xs font-semibold" style={{ color: '#6B6355' }}>NHTSA Reliability</span>
                <span className="text-[11px] font-black px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: '#dcfce7', color: '#15803d' }}>Low Risk · 0 recalls</span>
              </div>

              {/* Deal badge row */}
              <div className="px-5 py-3 border-t flex items-center justify-between" style={{ borderColor: '#E8E2D8' }}>
                <span className="text-xs font-semibold" style={{ color: '#6B6355' }}>Your list price: $19,995</span>
                <span className="text-[11px] font-black px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: '#dbeafe', color: '#1d4ed8' }}>Good Deal</span>
              </div>

              {/* Footer */}
              <div className="px-5 py-3 border-t" style={{ borderColor: '#E8E2D8', backgroundColor: '#FAFAFA' }}>
                <p className="text-[10px] text-center" style={{ color: '#9C897A' }}>
                  Powered by live market data · Updated daily · Cached 7 days
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  )
}

// ─── Founder ─────────────────────────────────────────────────────────────────

function FounderSection() {
  return (
    <section className="py-20 lg:py-28" style={{ backgroundColor: '#F4F0EA' }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <p className="text-xs font-black uppercase tracking-widest mb-4 text-center" style={{ color: ORANGE }}>
          Why We Built This
        </p>
        <h2 className="text-3xl sm:text-4xl font-black mb-10 text-center" style={{ color: NAVY }}>
          I built the CRM I couldn&apos;t find.
        </h2>
        <div className="relative">
          <div className="absolute -top-4 -left-2 sm:-left-6 text-8xl font-black leading-none select-none pointer-events-none"
            style={{ color: ORANGE, opacity: 0.25 }} aria-hidden="true">
            &ldquo;
          </div>
          <blockquote className="relative z-10 text-base sm:text-lg leading-relaxed italic pl-4"
            style={{ color: '#3D3530', borderLeft: `3px solid ${ORANGE}` }}>
            <p className="mb-4">
              Running a small lot meant every lead came through a different place — calls, texts,
              Gmail lead emails, platform messages — and I was constantly context-switching and still
              missing follow-ups. I&apos;d wake up realizing I lost a deal overnight because I couldn&apos;t
              find the last conversation, didn&apos;t remember which car it was tied to, or forgot the
              next step.
            </p>
            <p>
              Nothing on the market was built for a one-person dealership: mobile-first,
              vehicle-linked, and fast enough to log a touch in 10 seconds. So I built the CRM
              I needed to stop bleeding leads and turn chaos into a simple Today list.
            </p>
          </blockquote>
          <div className="mt-6 pl-4">
            <p className="font-bold text-sm" style={{ color: NAVY }}>— Independent dealer, Los Angeles, CA</p>
          </div>
        </div>
        <div className="mt-10 rounded-xl px-5 py-4 text-sm text-center leading-relaxed"
          style={{ backgroundColor: 'rgba(240,112,24,0.07)', border: '1px solid rgba(240,112,24,0.2)',
            color: '#6B4A28' }}>
          DealerWyze started as an internal tool. We&apos;re opening it to independent dealers who are
          tired of using enterprise software that wasn&apos;t built for them.
        </div>
      </div>
    </section>
  )
}

// ─── Reviews ─────────────────────────────────────────────────────────────────

const reviews = [
  {
    body: "I run a small used car lot and this is the first CRM that actually fits how we work. One tap to call/text, it logs the attempt automatically, and when I come back it forces a quick outcome + next step so nothing falls through. The Today list alone paid for it — I stopped losing leads overnight.",
    author: 'Independent Dealer, Southern California',
  },
  {
    body: "Everything is finally in one place: customer, car, and every conversation across calls, texts, and lead emails. I used to waste time scrolling through Gmail and my phone trying to remember who wanted which vehicle. Now I open a customer and the full timeline is there, plus templates that let me reply fast without sounding generic.",
    author: 'Used Car Dealer, Central Valley, CA',
  },
  {
    body: "This feels like a 'dealer brain' app, not a corporate CRM. It's mobile-first, instant search by phone/VIN/make-model, and lightweight enough that I actually use it during a busy day. The voice notes feature is clutch — after a call I record 15 seconds and I'm done.",
    author: 'Small Lot Owner, Los Angeles, CA',
  },
]

function ReviewsSection() {
  return (
    <section className="bg-white py-20 lg:py-28">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-14">
          <p className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: ORANGE }}>
            Early Access Dealers
          </p>
          <h2 className="text-3xl sm:text-4xl font-black" style={{ color: NAVY }}>
            Dealers who stopped losing leads.
          </h2>
        </div>
        <div className="grid sm:grid-cols-3 gap-5">
          {reviews.map((r, i) => (
            <div key={i} className="rounded-2xl p-6 flex flex-col"
              style={{ backgroundColor: '#fff', border: '1px solid #E8E2D8',
                boxShadow: '0 2px 12px rgba(13,43,85,0.07)' }}>
              <div className="flex gap-0.5 mb-4">
                {[...Array(5)].map((_, s) => (
                  <Star key={s} className="w-4 h-4 fill-current" style={{ color: ORANGE }} />
                ))}
              </div>
              <p className="text-sm leading-relaxed flex-1 mb-5" style={{ color: '#3D3530' }}>
                &ldquo;{r.body}&rdquo;
              </p>
              <p className="text-xs font-semibold" style={{ color: '#6B6355' }}>— {r.author}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Integrations ─────────────────────────────────────────────────────────────

const integrations = [
  { name: 'Gmail',             detail: 'Lead import + email sync'       },
  { name: 'AutoTrader',        detail: 'Lead auto-import'               },
  { name: 'CarGurus',          detail: 'Lead auto-import'               },
  { name: 'Google Calendar',   detail: 'Appointment sync'               },
  { name: 'Google Business',   detail: 'Review management'              },
  { name: 'Twilio',            detail: 'SMS + voice calls'              },
  { name: 'Retell AI',         detail: 'AI voice agent'                 },
  { name: 'Stripe',            detail: 'Subscription billing'           },
]

function IntegrationsSection() {
  return (
    <section className="py-16 border-t border-b" style={{ backgroundColor: '#FAFAFA', borderColor: '#E8E2D8' }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <p className="text-center text-xs font-black uppercase tracking-widest mb-8"
          style={{ color: '#9C897A' }}>
          Works with the tools you already use
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {integrations.map((intg, i) => (
            <div key={i} className="rounded-xl p-3 text-center transition-all hover:-translate-y-0.5"
              style={{ backgroundColor: '#fff', border: '1px solid #E8E2D8',
                boxShadow: '0 1px 4px rgba(13,43,85,0.05)' }}>
              <p className="font-black text-xs mb-0.5" style={{ color: NAVY }}>{intg.name}</p>
              <p className="text-[10px] leading-tight" style={{ color: '#9C897A' }}>{intg.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Features ─────────────────────────────────────────────────────────────────

const features: { icon: React.ElementType; title: string; desc: string; badge?: string }[] = [
  { icon: ListChecks,    title: 'Today Dashboard',
    desc: 'Prioritized daily action list — overdue tasks, new leads, appointments, and follow-ups ranked by urgency.' },
  { icon: Car,           title: 'Lead Pipeline',
    desc: 'Kanban board from New Lead → Contacted → Appointment → Sold. Drag to advance, filter by rep.' },
  { icon: MessageSquare, title: 'Two-Way SMS',
    desc: 'Text from the app with a dedicated business number. Inbound replies land in the customer thread automatically. STOP/START handled.' },
  { icon: Mail,          title: 'Gmail & IMAP Lead Import',
    desc: 'AutoTrader, CarGurus, and web form leads auto-import from Gmail or any IMAP account. No copy-pasting.' },
  { icon: ScanLine,      title: 'AI Lead Scanner',
    desc: 'Photograph a walk-in buyer card or PDF. AI extracts name, phone, email, and vehicle interest — pre-fills the lead form in seconds.' },
  { icon: Paperclip,      title: 'Document Attachments',
    desc: 'Attach photos, PDFs, and docs to vehicles or customer records. Vehicle docs get an AI-generated summary on upload.' },
  { icon: CalendarDays,  title: 'Calendar & Appointments',
    desc: 'Schedule test drives, sync to Google Calendar, and get SMS reminders to customers — one tap.' },
  { icon: Building2,     title: 'Google Business Reviews',
    desc: 'Pull and reply to Google Business Profile reviews from inside the app. Never let a review go unanswered.' },
  { icon: CreditCard,    title: 'BHPH Loan Tracking',
    desc: 'Track in-house loans, payment schedules, and collections. Automated payment reminders via SMS.' },
  { icon: FileImage,      title: 'Vehicle Documents',
    desc: 'Store title photos, inspection reports, and repair records with each vehicle. Blocked on sold vehicles to preserve legal records.' },
  { icon: BookOpen,      title: 'Receipts & Ledger',
    desc: 'Upload receipt photos → AI extracts vendor, amount, and category → auto-posted to your ledger. CSV export.' },
  { icon: Printer,       title: 'Fax',
    desc: 'Send and receive faxes from the app. PDFs and images supported. Full history per customer.' },
  { icon: BarChart3,     title: 'Analytics & Reports',
    desc: 'Lead funnel, SMS stats, response time, BHPH collection rate, revenue trends. Full XLSX export.' },
  { icon: Wallet,         title: 'Prepaid Overage Credit',
    desc: 'Add credit ($10–$100) to keep texting and calling past your plan limits. Deducts automatically — no surprise bills.' },
  { icon: Search,        title: 'Instant Search',
    desc: 'Find any customer by name, phone, email, VIN, or make/model in under a second. Mid-conversation fast.' },
  { icon: Users,         title: 'Team & Roles',
    desc: 'Invite staff with role-based access: admin, manager, finance, rep, or staff. Reps see only their assigned leads.' },
  { icon: FileText,      title: 'Contacts & Business Cards',
    desc: 'Scan a business card with your camera. AI fills the contact form. Export to CSV.' },
  { icon: Mic,           title: 'Voice Notes',
    desc: 'Record a 15-second note after a call. AI transcribes and attaches it to the customer timeline.' },
  { icon: Phone,         title: 'AI Voice Agent',
    desc: 'Retell AI answers calls, qualifies leads, and writes the full transcript to the customer record — even after hours.',
    badge: 'Core + Voice' },
  { icon: TrendingUp,    title: 'Smart Pricing Intelligence',
    desc: 'Fast Sale, Fair Market, and Max Return price tiers with live comps, NHTSA reliability check, AI market analysis, and a public deal badge — all in one click.' },
]

function FeaturesSection() {
  return (
    <section id="features" className="py-20 lg:py-28" style={{ backgroundColor: '#F4F0EA' }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-14">
          <p className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: ORANGE }}>
            What You Get
          </p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black" style={{ color: NAVY }}>
            Everything a small dealer needs.
            <br className="hidden sm:block" />
            <span style={{ color: ORANGE }}> Nothing you don&apos;t.</span>
          </h2>
          <p className="text-base mt-4 max-w-xl mx-auto" style={{ color: '#6B6355' }}>
            One platform. Everything included in Core.
            AI Voice Agent available on Core + Voice.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((f, i) => {
            const Icon = f.icon
            return (
              <div key={i}
                className="rounded-2xl p-5 transition-all duration-200 hover:-translate-y-1 group relative"
                style={{ backgroundColor: '#fff', border: '1px solid #E8E2D8',
                  boxShadow: '0 1px 6px rgba(13,43,85,0.06)' }}>
                {f.badge && (
                  <span className="absolute top-3 right-3 text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: 'rgba(240,112,24,0.12)', color: ORANGE }}>
                    {f.badge}
                  </span>
                )}
                <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3"
                  style={{ backgroundColor: 'rgba(240,112,24,0.1)' }}>
                  <Icon className="w-4 h-4" style={{ color: ORANGE }} />
                </div>
                <h3 className="font-black text-sm mb-1.5" style={{ color: NAVY }}>{f.title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: '#6B6355' }}>{f.desc}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ─── Pricing ─────────────────────────────────────────────────────────────────

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
  'Analytics & full XLSX export',
  'Contacts & business card scan',
  'Team members + role-based access',
]

const voiceFeatures = [
  'Dedicated AI voice agent (Retell AI)',
  'Answers inbound calls 24/7',
  'Post-call transcripts & summaries',
  'Auto lead creation from inbound calls',
  '1,000 voice minutes/month included',
  'After-hours call handling',
]

function PricingSection() {
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
          <p className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: ORANGE }}>
            Pricing
          </p>
          <h2 className="text-3xl sm:text-4xl font-black mb-3" style={{ color: NAVY }}>
            Start free today. No credit card needed.
          </h2>
          <p className="text-base" style={{ color: '#6B6355' }}>
            We&apos;re in beta — free access while we build together. Paid plans launch when the product is ready.
          </p>
        </div>

        {/* Beta notice banner */}
        <div className="max-w-3xl mx-auto mb-10 rounded-2xl px-6 py-4 flex items-start gap-3"
          style={{ backgroundColor: '#FFF7ED', border: '1.5px solid #FDBA74' }}>
          <span className="text-xl flex-shrink-0 mt-0.5">🧪</span>
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

          {/* Free Beta — featured */}
          <div className="rounded-2xl p-7 relative flex flex-col"
            style={{ backgroundColor: NAVY, border: `2px solid ${NAVY}`,
              boxShadow: '0 8px 32px rgba(13,43,85,0.35)' }}>
            <div className="mb-5">
              <span className="text-xs font-black uppercase tracking-wide px-3 py-1.5 rounded-full"
                style={{ backgroundColor: ORANGE, color: '#fff' }}>
                Available Now — Free
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
              Start Free — No Card Needed
            </Link>
            <p className="text-center mt-3 text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
              No credit card · No commitment
            </p>
          </div>

          {/* Complete CRM — Coming Soon */}
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
              All-inclusive CRM — SMS, fax, AI tools, BHPH, no add-ons
            </p>
            <div className="mb-1">
              <div className="flex items-end gap-1">
                <span className="text-4xl font-black" style={{ color: NAVY }}>${crmMonthly}</span>
                <span className="text-sm pb-1.5" style={{ color: '#6B6355' }}>/mo, billed monthly</span>
              </div>
              <p className="text-xs mt-1" style={{ color: '#9A3412' }}>
                or <strong>${crmAnnual}/mo</strong> billed annually — save ${crmSavings}/yr
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

          {/* Complete CRM + Voice — Coming Soon */}
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
                <span className="text-4xl font-black" style={{ color: NAVY }}>${(crmMonthly + voiceAddon).toFixed(2)}</span>
                <span className="text-sm pb-1.5" style={{ color: '#6B6355' }}>/mo</span>
              </div>
              <p className="text-xs mt-1" style={{ color: '#6B6355' }}>
                $150 CRM + $200 Voice add-on
              </p>
              <p className="text-xs mt-0.5" style={{ color: '#9A3412' }}>
                or <strong>${fullAnnual}/mo</strong> billed annually — save ${fullSavings}/yr
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

// ─── FAQ ──────────────────────────────────────────────────────────────────────

const faqs = [
  {
    q: 'Is there a contract?',
    a: 'No. DealerWyze is month-to-month. Cancel anytime from your billing settings — no phone calls, no cancellation fees.',
  },
  {
    q: 'Do I need a credit card to sign up?',
    a: 'No. DealerWyze is free during beta — no credit card required at any point. When paid plans launch, you\'ll have at least 30 days notice and the option to choose a plan or cancel.',
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
    a: 'Complete CRM ($150/mo) is all-inclusive: unlimited contacts and leads, two-way SMS with a dedicated business number, fax, Gmail sync, AI Lead Scanner, AI Dealer Brief, AI Receipt OCR, BHPH loan tracking, bookkeeping, analytics, and team management. No add-ons or hidden fees.',
  },
  {
    q: 'What does the Voice AI add-on do?',
    a: 'The Voice AI add-on ($200/mo, requires Complete CRM) adds a Retell AI phone agent that answers inbound calls 24/7, qualifies leads, and writes call transcripts directly to the customer record — even when you\'re on the lot or after hours. Includes 1,000 voice minutes/month.',
  },
  {
    q: 'Is there an annual discount?',
    a: 'Yes — 10% off when you pay annually. Complete CRM drops from $150/mo to $135/mo (saving $180/yr). The full CRM + Voice stack drops from $350/mo to $315/mo (saving $420/yr).',
  },
  {
    q: 'Is two-way SMS included?',
    a: 'Yes. Two-way SMS is included in Complete CRM and the full stack. You get a dedicated local business number, inbound replies land in the customer thread automatically, and STOP/START opt-out is handled per TCPA requirements.',
  },
  {
    q: 'How is my data protected?',
    a: 'All data is encrypted at rest and in transit (AES-256 / TLS 1.3). Each dealership\'s data is fully isolated — no tenant can access another\'s records. Staff access is role-gated, and every admin action is logged.',
  },
  {
    q: 'What happens to my data if I cancel?',
    a: 'You retain full access until your billing period ends. Before canceling, you can export your customers, vehicles, and transactions to CSV. After a 90-day grace period, data is purged from our servers.',
  },
]

function FAQSection() {
  const [open, setOpen] = useState<number | null>(null)

  return (
    <section className="py-20 lg:py-28" style={{ backgroundColor: '#F4F0EA' }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <p className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: ORANGE }}>
            FAQ
          </p>
          <h2 className="text-3xl sm:text-4xl font-black" style={{ color: NAVY }}>
            Common questions.
          </h2>
        </div>
        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <div key={i} className="rounded-2xl overflow-hidden transition-all"
              style={{ backgroundColor: '#fff', border: '1px solid #E8E2D8',
                boxShadow: '0 1px 6px rgba(13,43,85,0.05)' }}>
              <button
                className="w-full text-left px-6 py-4 flex items-center justify-between gap-4 hover:bg-gray-50 transition-colors"
                onClick={() => setOpen(open === i ? null : i)}>
                <span className="font-black text-sm" style={{ color: NAVY }}>{faq.q}</span>
                <span className="text-xl font-black flex-shrink-0 transition-transform duration-200"
                  style={{ color: ORANGE, transform: open === i ? 'rotate(45deg)' : 'none' }}>
                  +
                </span>
              </button>
              {open === i && (
                <div className="px-6 pb-5">
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

// ─── Final CTA ────────────────────────────────────────────────────────────────

function FinalCTASection() {
  return (
    <section className="relative overflow-hidden py-24 lg:py-32" style={{ backgroundColor: NAVY }}>
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 70% 60% at 50% 110%,rgba(240,112,24,0.2) 0%,transparent 70%)' }} />
      <div className="relative max-w-3xl mx-auto px-4 sm:px-6 text-center">
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white mb-4">
          Your competitors already have a system.
        </h2>
        <p className="text-lg mb-10" style={{ color: 'rgba(255,255,255,0.65)' }}>
          Every day without one is a lead you might not get back.
        </p>
        <Link href="/signup"
          className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-bold text-base text-white transition-all hover:opacity-90 active:scale-95 shadow-xl"
          style={{ backgroundColor: ORANGE, boxShadow: '0 6px 24px rgba(240,112,24,0.45)' }}>
          Start Free Today — No Card Needed
          <ChevronRight className="w-4 h-4" />
        </Link>
        <p className="mt-5 text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
          14-day free trial · No credit card · Cancel anytime
        </p>
      </div>
    </section>
  )
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="py-10" style={{ backgroundColor: '#060F1E' }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
          <p className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.6)' }}>
            DealerWyze by KMA Auto Inc
          </p>
          <nav className="flex items-center gap-4 flex-wrap justify-center">
            {[
              { label: 'Features', href: '#features' },
              { label: 'Pricing',  href: '#pricing'  },
              { label: 'Blog',     href: '/blog'      },
              { label: 'Terms',    href: '/terms'     },
              { label: 'Privacy',  href: '/privacy'   },
              { label: 'Sign In',  href: '/login'     },
            ].map((link) => (
              <a key={link.href} href={link.href}
                className="text-sm transition-colors hover:text-white"
                style={{ color: 'rgba(255,255,255,0.45)' }}>
                {link.label}
              </a>
            ))}
          </nav>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.35)' }}>
            &copy; 2026 KMA Auto Inc. All rights reserved.
          </p>
        </div>
        <p className="text-center text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>
          Built by a dealer, for dealers.
        </p>
      </div>
    </footer>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const intervoWidgetId =
    process.env.NEXT_PUBLIC_INTERVO_WIDGET_ID ?? '1708eacc-5d8e-4d85-95ea-9ba6f309989a'

  return (
    <>
      {/* Intervo.ai website widget (temporary test) */}
      <Script
        src="https://widget.intervo.ai"
        id="intervoLoader"
        data-widget-id={intervoWidgetId}
        strategy="afterInteractive"
      />
      {/* Right-side float override (best-effort; targets Intervo iframe by src). */}
      <style jsx global>{`
        iframe[src*="intervo"] {
          position: fixed !important;
          right: 16px !important;
          top: 50% !important;
          transform: translateY(-50%) !important;
          z-index: 2147483647 !important;
        }
      `}</style>

      <Nav />
      <main>
        <HeroSection />
        <PainSection />
        <HowItWorksSection />
        <TodayListSection />
        <AISection />
        <SmartPricingSection />
        <FounderSection />
        <ReviewsSection />
        <IntegrationsSection />
        <FeaturesSection />
        <PricingSection />
        <FAQSection />
        <FinalCTASection />
      </main>
      <Footer />
    </>
  )
}
