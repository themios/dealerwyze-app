'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
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
} from 'lucide-react'

// ─── Nav ────────────────────────────────────────────────────────────────────

function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-white shadow-md' : 'bg-white/95 backdrop-blur-sm'
      }`}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Wordmark */}
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-black"
              style={{ backgroundColor: '#0D2B55' }}
            >
              A
            </div>
            <span className="font-bold text-lg" style={{ color: '#0D2B55' }}>
              DealerWyze
            </span>
          </div>

          {/* Desktop nav */}
          <div className="hidden sm:flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-medium px-4 py-2 rounded-lg transition-colors hover:bg-gray-100"
              style={{ color: '#0D2B55' }}
            >
              Sign In
            </Link>
            <Link
              href="/signup"
              className="text-sm font-semibold px-4 py-2 rounded-lg text-white transition-all hover:opacity-90 active:scale-95"
              style={{ backgroundColor: '#F07018' }}
            >
              Start Free Trial
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            className="sm:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? (
              <X className="w-5 h-5" style={{ color: '#0D2B55' }} />
            ) : (
              <Menu className="w-5 h-5" style={{ color: '#0D2B55' }} />
            )}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="sm:hidden border-t border-gray-100 py-4 flex flex-col gap-3 pb-4">
            <Link
              href="/login"
              className="text-sm font-medium px-4 py-2.5 rounded-lg text-center border transition-colors hover:bg-gray-50"
              style={{ color: '#0D2B55', borderColor: '#0D2B55' }}
              onClick={() => setMobileOpen(false)}
            >
              Sign In
            </Link>
            <Link
              href="/signup"
              className="text-sm font-semibold px-4 py-2.5 rounded-lg text-white text-center transition-all hover:opacity-90"
              style={{ backgroundColor: '#F07018' }}
              onClick={() => setMobileOpen(false)}
            >
              Start Free Trial
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
    { color: '#22c55e', label: 'Call', name: 'Marcus T.', note: 'Interested in 2021 Camry' },
    { color: '#3b82f6', label: 'Appt', name: 'Sarah L.', note: 'Test drive @ 2pm today' },
    { color: '#F07018', label: 'SMS', name: 'Devon W.', note: 'Asked about financing terms' },
  ]

  return (
    <div className="flex justify-center items-center">
      {/* Phone outer shell */}
      <div
        className="relative rounded-[2.5rem] p-1 shadow-2xl"
        style={{
          background: 'linear-gradient(145deg, #1a1a2e 0%, #16213e 100%)',
          width: '220px',
          border: '2px solid rgba(255,255,255,0.15)',
        }}
      >
        {/* Notch */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 rounded-b-xl"
          style={{
            width: '80px',
            height: '22px',
            backgroundColor: '#0a0a1a',
            zIndex: 10,
          }}
        />
        {/* Screen */}
        <div
          className="rounded-[2rem] overflow-hidden"
          style={{ backgroundColor: '#0D2B55', minHeight: '400px', padding: '28px 12px 16px' }}
        >
          {/* Status bar area */}
          <div className="flex justify-between items-center mb-4 px-1">
            <span className="text-white/50 text-[9px] font-medium">9:41</span>
            <div className="flex gap-1">
              <div className="w-3 h-1.5 rounded-sm bg-white/40" />
              <div className="w-1 h-1.5 rounded-sm bg-white/40" />
            </div>
          </div>

          {/* App header */}
          <div className="mb-3 px-1">
            <p className="text-white/60 text-[10px] uppercase tracking-widest font-semibold">Today</p>
            <p className="text-white font-bold text-lg leading-tight">3 need attention</p>
          </div>

          {/* Task rows */}
          <div className="flex flex-col gap-2">
            {tasks.map((task, i) => (
              <div
                key={i}
                className="rounded-xl overflow-hidden flex"
                style={{ backgroundColor: 'rgba(255,255,255,0.07)' }}
              >
                {/* Color strip */}
                <div className="w-1 flex-shrink-0 rounded-l-xl" style={{ backgroundColor: task.color }} />
                <div className="px-3 py-2.5 flex-1">
                  <div className="flex items-center justify-between mb-0.5">
                    <span
                      className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                      style={{ backgroundColor: task.color + '33', color: task.color }}
                    >
                      {task.label}
                    </span>
                  </div>
                  <p className="text-white text-[11px] font-semibold leading-tight">{task.name}</p>
                  <p className="text-white/50 text-[9px] leading-tight mt-0.5">{task.note}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Bottom indicator */}
          <div className="flex justify-center mt-4">
            <div className="w-12 h-1 rounded-full bg-white/20" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Section 1: Hero ─────────────────────────────────────────────────────────

function HeroSection() {
  return (
    <section
      className="relative overflow-hidden pt-16"
      style={{ backgroundColor: '#0D2B55' }}
    >
      {/* Subtle gradient overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(240,112,24,0.15) 0%, transparent 70%)',
        }}
      />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-20 lg:py-32">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left: copy */}
          <div>
            {/* Eyebrow */}
            <div className="inline-flex items-center gap-2 mb-6">
              <span
                className="text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-full"
                style={{ backgroundColor: '#F07018', color: '#fff' }}
              >
                Built for Independent Dealers
              </span>
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-white leading-[1.05] mb-5">
              Stop Losing Deals
              <br />
              <span style={{ color: '#F07018' }}>Overnight.</span>
            </h1>

            {/* Subheadline */}
            <p
              className="text-lg sm:text-xl leading-relaxed mb-8 max-w-lg"
              style={{ color: 'rgba(255,255,255,0.75)' }}
            >
              DealerWyze gives you one place for every lead, every car, and every
              next step — so you stop context-switching and start closing.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl font-bold text-base text-white transition-all hover:opacity-90 active:scale-95 shadow-lg"
                style={{ backgroundColor: '#F07018', boxShadow: '0 4px 20px rgba(240,112,24,0.4)' }}
              >
                Start Free Trial
                <ChevronRight className="w-4 h-4" />
              </Link>
              <a
                href="#features"
                className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-xl font-semibold text-base transition-all hover:bg-white/10 border"
                style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.35)' }}
              >
                See How It Works
              </a>
            </div>

            {/* Trust line */}
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.45)' }}>
              14-day free trial · No credit card required · Cancel anytime
            </p>
          </div>

          {/* Right: phone mockup */}
          <div className="flex justify-center lg:justify-end">
            <PhoneMockup />
          </div>
        </div>
      </div>

      {/* Bottom wave transition */}
      <div className="relative" style={{ height: '60px', marginTop: '-1px' }}>
        <svg
          viewBox="0 0 1440 60"
          preserveAspectRatio="none"
          className="absolute bottom-0 left-0 w-full h-full"
          style={{ fill: '#ffffff' }}
        >
          <path d="M0,60 C360,0 1080,0 1440,60 L1440,60 L0,60 Z" />
        </svg>
      </div>
    </section>
  )
}

// ─── Section 2: Pain ─────────────────────────────────────────────────────────

const painPoints = [
  {
    emoji: '📱',
    title: 'Leads from everywhere',
    desc: 'Calls, texts, Gmail, AutoTrader, CarGurus — no single place to track them all.',
  },
  {
    emoji: '🌙',
    title: 'The overnight miss',
    desc: "A lead came in at 10pm. By morning, they'd already bought from the dealer who responded at 10:01pm.",
  },
  {
    emoji: '🚗',
    title: 'Which car did they want?',
    desc: 'You remember the customer but not the vehicle. You scroll through texts trying to piece it together.',
  },
  {
    emoji: '📋',
    title: 'No system = no follow-up',
    desc: 'You mean to call back. You get busy. Three days pass. The deal is gone.',
  },
]

function PainSection() {
  return (
    <section className="bg-white py-20 lg:py-28">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="text-center mb-14">
          <p
            className="text-xs font-black uppercase tracking-widest mb-3"
            style={{ color: '#F07018' }}
          >
            The Problem
          </p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-4" style={{ color: '#0D2B55' }}>
            Running a small lot means wearing every hat.
          </h2>
          <p className="text-lg max-w-xl mx-auto" style={{ color: '#6B6355' }}>
            And somewhere between the calls, texts, and emails — deals fall through
            the cracks.
          </p>
        </div>

        {/* Pain cards 2x2 */}
        <div className="grid sm:grid-cols-2 gap-5">
          {painPoints.map((p, i) => (
            <div
              key={i}
              className="group rounded-2xl p-6 transition-all duration-200 hover:-translate-y-1 cursor-default"
              style={{
                backgroundColor: '#F8F4EE',
                border: '1px solid #E8E2D8',
                boxShadow: '0 1px 4px rgba(13,43,85,0.06)',
              }}
            >
              <div className="text-3xl mb-3">{p.emoji}</div>
              <h3 className="font-black text-lg mb-2" style={{ color: '#0D2B55' }}>
                {p.title}
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: '#6B6355' }}>
                {p.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Section 3: Today List Hero ───────────────────────────────────────────────

const todayCallouts = [
  {
    icon: '⚡',
    title: '10-second logging',
    desc: 'Call a customer, log the outcome and next step in one tap. No typing essays.',
  },
  {
    icon: '📅',
    title: 'Never miss a follow-up',
    desc: 'Every touch auto-creates the next step. Nothing falls off the list.',
  },
  {
    icon: '🚗',
    title: 'Vehicle-linked',
    desc: "Every customer is connected to the car they're interested in. Full context, instantly.",
  },
]

function TodayListSection() {
  return (
    <section className="py-20 lg:py-28" style={{ backgroundColor: '#0D2B55' }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white mb-5">
            One list. Everything that needs your{' '}
            <span style={{ color: '#F07018' }}>attention today.</span>
          </h2>
          <p className="text-lg max-w-2xl mx-auto" style={{ color: 'rgba(255,255,255,0.65)' }}>
            Overdue calls. Appointment requests. New leads. Customers waiting on a
            reply. All in one place — ranked by urgency, not by when it arrived in
            your inbox.
          </p>
        </div>

        {/* Callout columns */}
        <div className="grid sm:grid-cols-3 gap-5">
          {todayCallouts.map((c, i) => (
            <div
              key={i}
              className="rounded-2xl p-6 transition-all duration-200 hover:-translate-y-1"
              style={{
                backgroundColor: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.12)',
                backdropFilter: 'blur(10px)',
              }}
            >
              <div className="text-3xl mb-4">{c.icon}</div>
              <h3 className="font-black text-white text-lg mb-2">{c.title}</h3>
              <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>
                {c.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Section 4: Founder Story ─────────────────────────────────────────────────

function FounderSection() {
  return (
    <section className="py-20 lg:py-28" style={{ backgroundColor: '#FAFAFA' }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        {/* Section label */}
        <p
          className="text-xs font-black uppercase tracking-widest mb-4 text-center"
          style={{ color: '#F07018' }}
        >
          Why We Built This
        </p>

        {/* Headline */}
        <h2
          className="text-3xl sm:text-4xl font-black mb-10 text-center"
          style={{ color: '#0D2B55' }}
        >
          I built the CRM I couldn&apos;t find.
        </h2>

        {/* Blockquote */}
        <div className="relative">
          {/* Decorative quote mark */}
          <div
            className="absolute -top-4 -left-2 sm:-left-6 text-8xl font-black leading-none select-none pointer-events-none"
            style={{ color: '#F07018', opacity: 0.25 }}
            aria-hidden="true"
          >
            &ldquo;
          </div>

          <blockquote
            className="relative z-10 text-base sm:text-lg leading-relaxed italic pl-4"
            style={{ color: '#3D3530', borderLeft: '3px solid #F07018' }}
          >
            <p className="mb-4">
              Running a small lot meant every lead came through a
              different place — calls, texts, Gmail lead emails, platform messages —
              and I was constantly context-switching and still missing follow-ups.
              I&apos;d wake up realizing I lost a deal overnight because I couldn&apos;t find
              the last conversation, didn&apos;t remember which car it was tied to, or
              forgot the next step.
            </p>
            <p>
              Nothing on the market was built for a one-person dealership:
              mobile-first, vehicle-linked, and fast enough to log a touch in 10
              seconds. So I built the CRM I needed to stop bleeding leads and turn
              chaos into a simple Today list.
            </p>
          </blockquote>

          {/* Attribution */}
          <div className="mt-6 pl-4">
            <p className="font-bold text-sm" style={{ color: '#0D2B55' }}>
              — Independent dealer, Los Angeles, CA
            </p>
          </div>
        </div>

        {/* Subtle note */}
        <div
          className="mt-10 rounded-xl px-5 py-4 text-sm text-center leading-relaxed"
          style={{
            backgroundColor: 'rgba(240,112,24,0.07)',
            border: '1px solid rgba(240,112,24,0.2)',
            color: '#6B4A28',
          }}
        >
          DealerWyze started as an internal tool. We&apos;re opening it to independent
          dealers who are tired of using enterprise software that wasn&apos;t built for
          them.
        </div>
      </div>
    </section>
  )
}

// ─── Section 5: Reviews ───────────────────────────────────────────────────────

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
    body: "This feels like a 'dealer brain' app, not a corporate CRM. It's mobile-first, instant search by phone/VIN/make-model, and it's lightweight enough that I actually use it during a busy day. The voice notes feature is clutch — after a call I record 15 seconds and I'm done.",
    author: 'Small Lot Owner, Los Angeles, CA',
  },
]

function ReviewsSection() {
  return (
    <section className="bg-white py-20 lg:py-28">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="text-center mb-14">
          <p
            className="text-xs font-black uppercase tracking-widest mb-3"
            style={{ color: '#F07018' }}
          >
            Early Access Dealers
          </p>
          <h2 className="text-3xl sm:text-4xl font-black" style={{ color: '#0D2B55' }}>
            Dealers who stopped losing leads.
          </h2>
        </div>

        {/* Review cards */}
        <div className="grid sm:grid-cols-3 gap-5">
          {reviews.map((r, i) => (
            <div
              key={i}
              className="rounded-2xl p-6 flex flex-col"
              style={{
                backgroundColor: '#fff',
                border: '1px solid #E8E2D8',
                boxShadow: '0 2px 12px rgba(13,43,85,0.07)',
              }}
            >
              {/* Stars */}
              <div className="flex gap-0.5 mb-4">
                {[...Array(5)].map((_, s) => (
                  <Star
                    key={s}
                    className="w-4 h-4 fill-current"
                    style={{ color: '#F07018' }}
                  />
                ))}
              </div>

              {/* Body */}
              <p
                className="text-sm leading-relaxed flex-1 mb-5"
                style={{ color: '#3D3530' }}
              >
                &ldquo;{r.body}&rdquo;
              </p>

              {/* Author */}
              <p className="text-xs font-semibold" style={{ color: '#6B6355' }}>
                — {r.author}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ─── Section 6: Features ──────────────────────────────────────────────────────

const features = [
  {
    icon: ListChecks,
    title: 'Today List',
    desc: 'Your prioritized daily dashboard. Overdue tasks, new leads, appointments, and follow-ups — all ranked and ready.',
  },
  {
    icon: MessageSquare,
    title: 'Two-Way SMS',
    desc: 'Text customers from the app. Replies come back in. Every message is logged to the customer timeline automatically.',
  },
  {
    icon: Mail,
    title: 'Gmail Lead Capture',
    desc: 'AutoTrader, CarGurus, and web form leads land in Gmail and auto-import into Apollo. No copy-pasting.',
  },
  {
    icon: Car,
    title: 'Inventory Linked',
    desc: "Every customer is tied to the vehicle they're considering. See what they wanted, what you showed them, what closed.",
  },
  {
    icon: CalendarDays,
    title: 'Calendar & Appointments',
    desc: 'Schedule test drives, add appointments from texts, sync to Google Calendar with one tap.',
  },
  {
    icon: Search,
    title: 'Instant Search',
    desc: 'Find any customer by name, phone, email, VIN, or make/model in under a second. Even mid-conversation.',
  },
]

function FeaturesSection() {
  return (
    <section id="features" className="py-20 lg:py-28" style={{ backgroundColor: '#F4F0EA' }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="text-center mb-14">
          <p
            className="text-xs font-black uppercase tracking-widest mb-3"
            style={{ color: '#F07018' }}
          >
            What You Get
          </p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black" style={{ color: '#0D2B55' }}>
            Everything a small dealer needs.
            <br className="hidden sm:block" />
            <span style={{ color: '#F07018' }}> Nothing you don&apos;t.</span>
          </h2>
        </div>

        {/* Feature cards 3x2 */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f, i) => {
            const Icon = f.icon
            return (
              <div
                key={i}
                className="rounded-2xl p-6 transition-all duration-200 hover:-translate-y-1 group"
                style={{
                  backgroundColor: '#fff',
                  border: '1px solid #E8E2D8',
                  boxShadow: '0 1px 6px rgba(13,43,85,0.06)',
                }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: 'rgba(240,112,24,0.1)' }}
                >
                  <Icon className="w-5 h-5" style={{ color: '#F07018' }} />
                </div>
                <h3 className="font-black text-base mb-2" style={{ color: '#0D2B55' }}>
                  {f.title}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: '#6B6355' }}>
                  {f.desc}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

// ─── Section 7: Pricing ───────────────────────────────────────────────────────

const crmFeatures = [
  'Unlimited leads & customers',
  'Vehicle-linked activity tracking',
  'Gmail lead auto-import',
  'Calendar & appointments',
  'Inventory management',
  'Up to 5 team members',
  'Google Calendar sync',
]

const smsFeatures = [
  ...crmFeatures,
  'Dedicated business phone number',
  'Two-way SMS from the app',
  '1,000 messages/month included',
  'Inbound appointment detection',
  '$0.03/msg overage',
]

function PricingSection() {
  return (
    <section className="bg-white py-20 lg:py-28">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        {/* Header */}
        <div className="text-center mb-14">
          <p
            className="text-xs font-black uppercase tracking-widest mb-3"
            style={{ color: '#F07018' }}
          >
            Pricing
          </p>
          <h2 className="text-3xl sm:text-4xl font-black mb-3" style={{ color: '#0D2B55' }}>
            Simple pricing. No contracts. No surprises.
          </h2>
          <p className="text-base" style={{ color: '#6B6355' }}>
            Start free for 14 days. Cancel anytime.
          </p>
        </div>

        {/* Cards */}
        <div className="grid sm:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {/* CRM card */}
          <div
            className="rounded-2xl p-7 relative flex flex-col"
            style={{
              backgroundColor: '#fff',
              border: '2px solid #0D2B55',
              boxShadow: '0 2px 16px rgba(13,43,85,0.09)',
            }}
          >
            {/* Badge */}
            <div className="mb-5">
              <span
                className="text-xs font-black uppercase tracking-wide px-3 py-1.5 rounded-full"
                style={{ backgroundColor: 'rgba(13,43,85,0.08)', color: '#0D2B55' }}
              >
                Most Popular
              </span>
            </div>

            <h3 className="text-xl font-black mb-1" style={{ color: '#0D2B55' }}>
              CRM
            </h3>

            <div className="flex items-end gap-1 mb-5">
              <span className="text-4xl font-black" style={{ color: '#0D2B55' }}>
                $49.95
              </span>
              <span className="text-sm pb-1.5" style={{ color: '#6B6355' }}>
                /month
              </span>
            </div>

            <ul className="space-y-2.5 mb-7 flex-1">
              {crmFeatures.map((feat, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm" style={{ color: '#3D3530' }}>
                  <Check
                    className="w-4 h-4 flex-shrink-0 mt-0.5"
                    style={{ color: '#F07018' }}
                  />
                  {feat}
                </li>
              ))}
            </ul>

            <Link
              href="/signup"
              className="w-full py-3.5 rounded-xl font-bold text-sm text-center transition-all hover:opacity-90 active:scale-95"
              style={{ backgroundColor: '#0D2B55', color: '#fff' }}
            >
              Start Free Trial
            </Link>
          </div>

          {/* CRM + SMS card (highlighted) */}
          <div
            className="rounded-2xl p-7 relative flex flex-col"
            style={{
              backgroundColor: '#0D2B55',
              border: '2px solid #0D2B55',
              boxShadow: '0 8px 32px rgba(13,43,85,0.35)',
            }}
          >
            {/* Badge */}
            <div className="mb-5">
              <span
                className="text-xs font-black uppercase tracking-wide px-3 py-1.5 rounded-full"
                style={{ backgroundColor: '#F07018', color: '#fff' }}
              >
                Best Value
              </span>
            </div>

            <h3 className="text-xl font-black mb-1 text-white">CRM + SMS</h3>

            <div className="flex items-end gap-1 mb-1">
              <span className="text-4xl font-black text-white">$64.90</span>
              <span className="text-sm pb-1.5" style={{ color: 'rgba(255,255,255,0.6)' }}>
                /month
              </span>
            </div>
            <p className="text-xs mb-5" style={{ color: 'rgba(255,255,255,0.5)' }}>
              $49.95 CRM + $14.95 SMS add-on
            </p>

            <ul className="space-y-2.5 mb-7 flex-1">
              {smsFeatures.map((feat, i) => {
                const isNew = i >= crmFeatures.length
                return (
                  <li
                    key={i}
                    className="flex items-start gap-2.5 text-sm"
                    style={{ color: isNew ? '#fff' : 'rgba(255,255,255,0.75)' }}
                  >
                    <Check
                      className="w-4 h-4 flex-shrink-0 mt-0.5"
                      style={{ color: isNew ? '#F07018' : 'rgba(255,255,255,0.5)' }}
                    />
                    {feat}
                  </li>
                )
              })}
            </ul>

            <Link
              href="/signup?sms=1"
              className="w-full py-3.5 rounded-xl font-bold text-sm text-white text-center transition-all hover:opacity-90 active:scale-95"
              style={{
                backgroundColor: '#F07018',
                boxShadow: '0 4px 16px rgba(240,112,24,0.4)',
              }}
            >
              Start Free Trial
            </Link>
          </div>
        </div>

        {/* Support line */}
        <p className="text-center mt-8 text-sm" style={{ color: '#6B6355' }}>
          Questions? Email us at{' '}
          <a
            href="mailto:support@dealerwyze.com"
            className="underline underline-offset-2 hover:opacity-70 transition-opacity"
            style={{ color: '#0D2B55' }}
          >
            support@dealerwyze.com
          </a>
        </p>
      </div>
    </section>
  )
}

// ─── Section 8: Final CTA ─────────────────────────────────────────────────────

function FinalCTASection() {
  return (
    <section
      className="relative overflow-hidden py-24 lg:py-32"
      style={{ backgroundColor: '#0D2B55' }}
    >
      {/* Radial glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 70% 60% at 50% 110%, rgba(240,112,24,0.2) 0%, transparent 70%)',
        }}
      />

      <div className="relative max-w-3xl mx-auto px-4 sm:px-6 text-center">
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white mb-4">
          Your competitors already have a system.
        </h2>
        <p
          className="text-lg mb-10"
          style={{ color: 'rgba(255,255,255,0.65)' }}
        >
          Every day without one is a lead you might not get back.
        </p>
        <Link
          href="/signup"
          className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-bold text-base text-white transition-all hover:opacity-90 active:scale-95 shadow-xl"
          style={{
            backgroundColor: '#F07018',
            boxShadow: '0 6px 24px rgba(240,112,24,0.45)',
          }}
        >
          Start Your Free Trial Today
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
        {/* Main row */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
          {/* Left */}
          <p className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.6)' }}>
            DealerWyze by KMA Auto Inc
          </p>

          {/* Center links */}
          <nav className="flex items-center gap-4">
            {[
              { label: 'Terms', href: '/terms' },
              { label: 'Privacy', href: '/privacy' },
              { label: 'Sign In', href: '/login' },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-sm transition-colors hover:text-white"
                style={{ color: 'rgba(255,255,255,0.45)' }}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Right */}
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.35)' }}>
            &copy; 2026 KMA Auto Inc. All rights reserved.
          </p>
        </div>

        {/* Tagline */}
        <p className="text-center text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>
          Built by a dealer, for dealers.
        </p>
      </div>
    </footer>
  )
}

// ─── Root export ──────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <>
      <Nav />
      <main>
        <HeroSection />
        <PainSection />
        <TodayListSection />
        <FounderSection />
        <ReviewsSection />
        <FeaturesSection />
        <PricingSection />
        <FinalCTASection />
      </main>
      <Footer />
    </>
  )
}
