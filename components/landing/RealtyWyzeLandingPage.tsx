'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  Menu, X, ChevronRight, Inbox, Home, Phone, RefreshCw,
  Calendar, Users, BarChart2, Star, Check, ChevronDown,
  Clock, AlertCircle, MessageSquare, Zap, FlaskConical,
} from 'lucide-react'

const NAVY   = '#0D2B55'
const ORANGE = '#F07018'
const CREAM  = '#FBF8F4'

// ── Phone mockup ──────────────────────────────────────────────────────────────
function PhoneMockup() {
  const tasks = [
    { color: '#22c55e', label: 'Buyer',   name: 'Sarah M.',  note: 'Wants to see 123 Oak St this weekend' },
    { color: '#3b82f6', label: 'Showing', name: 'James K.',  note: 'Confirm 2pm tour for 4BR on Maple' },
    { color: ORANGE,    label: 'Seller',  name: 'Emily R.',  note: 'Asking about price adjustment' },
  ]
  return (
    <div className="flex justify-center items-center">
      <div className="relative rounded-[2.5rem] p-1 shadow-2xl"
        style={{ background: 'linear-gradient(145deg,#1a1a2e 0%,#16213e 100%)', width: '220px', border: '2px solid rgba(255,255,255,0.15)' }}>
        <div className="absolute top-0 left-1/2 -translate-x-1/2 rounded-b-xl"
          style={{ width: '80px', height: '22px', backgroundColor: '#0a0a1a', zIndex: 10 }} />
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
            <p className="text-white font-bold text-lg leading-tight">3 clients need you</p>
          </div>
          <div className="flex flex-col gap-2">
            {tasks.map((task, i) => (
              <div key={i} className="rounded-xl overflow-hidden"
                style={{ backgroundColor: task.color + '18', border: `1px solid ${task.color}44` }}>
                <div className="px-3 py-2.5">
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

// ── FAQ item ──────────────────────────────────────────────────────────────────
function FAQItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border-b border-gray-200 last:border-0">
      <button
        type="button"
        className="w-full flex items-start justify-between gap-4 py-5 text-left"
        onClick={() => setOpen(!open)}
      >
        <span className="font-semibold text-base" style={{ color: NAVY }}>{q}</span>
        <ChevronDown className={`w-5 h-5 shrink-0 mt-0.5 transition-transform ${open ? 'rotate-180' : ''}`} style={{ color: ORANGE }} />
      </button>
      {open && <p className="pb-5 text-sm leading-relaxed text-gray-600">{a}</p>}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function RealtyWyzeLandingPage() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="min-h-screen bg-white font-sans antialiased">

      {/* ── Nav ── */}
      <nav className="sticky top-0 z-50 bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <Image src="/rw-logo.png" alt="RealtyWyze" width={140} height={48} priority style={{ height: '44px', width: 'auto' }} />
            <div className="hidden sm:flex items-center gap-6">
              <a href="#pain"     className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">Why it matters</a>
              <a href="#features" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">Features</a>
              <a href="#pricing"  className="text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors">Pricing</a>
              <Link href="/login" className="text-sm font-medium px-4 py-2 rounded-lg transition-colors hover:bg-gray-100" style={{ color: NAVY }}>
                Sign in
              </Link>
              <Link href="/signup" className="text-sm font-semibold px-4 py-2 rounded-lg text-white transition-all hover:opacity-90" style={{ backgroundColor: ORANGE }}>
                Start free trial
              </Link>
            </div>
            <button type="button" className="sm:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle menu">
              {mobileOpen ? <X className="w-5 h-5" style={{ color: NAVY }} /> : <Menu className="w-5 h-5" style={{ color: NAVY }} />}
            </button>
          </div>
          {mobileOpen && (
            <div className="sm:hidden border-t border-gray-100 py-4 flex flex-col gap-2 pb-4">
              <Link href="/login" className="text-sm font-medium px-4 py-2.5 rounded-lg text-center border transition-colors hover:bg-gray-50" style={{ color: NAVY, borderColor: NAVY }} onClick={() => setMobileOpen(false)}>Sign in</Link>
              <Link href="/signup" className="text-sm font-semibold px-4 py-2.5 rounded-lg text-center text-white transition-all hover:opacity-90" style={{ backgroundColor: ORANGE }} onClick={() => setMobileOpen(false)}>Start free trial</Link>
            </div>
          )}
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="px-4 sm:px-6 py-16 sm:py-24" style={{ backgroundColor: NAVY }}>
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <span className="inline-block text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-6" style={{ color: ORANGE, backgroundColor: 'rgba(240,112,24,0.15)' }}>
                Built for independent agents &amp; small brokerages
              </span>
              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white leading-tight mb-6">
                Stop losing clients to agents who simply followed up first.
              </h1>
              <p className="text-lg sm:text-xl text-white/80 leading-relaxed mb-8">
                RealtyWyze puts every inquiry, listing, and client conversation in one place so you always know who needs you next and no deal falls through from lack of follow-up.
              </p>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-6">
                <Link href="/signup" className="w-full sm:w-auto inline-flex items-center justify-center gap-2 text-base font-bold px-8 py-4 rounded-xl text-white transition-all hover:opacity-90 shadow-xl" style={{ backgroundColor: ORANGE }}>
                  Start free trial <ChevronRight className="w-4 h-4" />
                </Link>
                <a href="#pain" className="w-full sm:w-auto text-base font-semibold px-8 py-4 rounded-xl border-2 text-white text-center transition-all hover:bg-white/10" style={{ borderColor: 'rgba(255,255,255,0.35)' }}>
                  See how it works
                </a>
              </div>
              <p className="text-sm text-white/50">No credit card required. Setup in under 10 minutes.</p>
            </div>
            <div className="hidden lg:block">
              <PhoneMockup />
            </div>
          </div>
        </div>
      </section>

      {/* ── Elevator pitch (Limbic — emotion/identity) ── */}
      <section style={{ backgroundColor: ORANGE }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 lg:py-20 text-center">
          <p className="text-xs font-black uppercase tracking-widest mb-6 text-white/70">Who This Is For</p>
          <blockquote className="text-2xl sm:text-3xl lg:text-4xl font-black text-white leading-snug mb-10">
            &ldquo;If you&rsquo;re tired of chasing buyers across six apps, watching good clients go cold because life got busy, and losing listings to agents who simply followed up first, sign up for RealtyWyze.&rdquo;
          </blockquote>
          <p className="text-lg sm:text-xl font-semibold text-white/90 mb-10 max-w-2xl mx-auto">
            Every inquiry answered in under 60 seconds. Every client followed up. Every listing tracked, even when you&rsquo;re in a showing.
          </p>
          <Link href="/signup" className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-bold text-base transition-all hover:opacity-90 active:scale-95 shadow-xl" style={{ backgroundColor: NAVY, color: '#fff', boxShadow: '0 4px 24px rgba(13,43,85,0.35)' }}>
            Start Free Today <ChevronRight className="w-4 h-4" />
          </Link>
          <p className="mt-4 text-sm text-white/60">No credit card. No commitment. 30 days free to try.</p>
        </div>
      </section>

      {/* ── Pain section (Reptilian — survival/fear) ── */}
      <section id="pain" className="py-20 lg:py-28 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <p className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: ORANGE }}>The Problem</p>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black mb-4" style={{ color: NAVY }}>
              Great agents don&apos;t lose deals because of skill.
              <br className="hidden sm:block" />
              <span style={{ color: ORANGE }}> They lose them because of gaps in follow-up.</span>
            </h2>
            <p className="text-lg max-w-xl mx-auto" style={{ color: '#6B6355' }}>
              A buyer calls while you&rsquo;re showing a home. A seller goes cold between meetings. By the time you circle back, the deal is someone else&rsquo;s.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-5">
            {[
              {
                icon: Phone,
                title: 'The showing that cost you a buyer',
                desc: 'You were in a showing. A motivated buyer called. No one answered. By the time you called back, they had already booked a tour with another agent who picked up.',
              },
              {
                icon: AlertCircle,
                title: 'The seller who went cold',
                desc: 'You had a great first meeting. Life got busy. Ten days passed without a real touchpoint. When you checked in, they had already listed with someone else.',
              },
              {
                icon: MessageSquare,
                title: 'Six apps, zero clarity',
                desc: 'Zillow leads in one app. MLS in another. Texts on your phone. Follow-ups in your head. You are the system, and it breaks every time you get busy.',
              },
              {
                icon: Clock,
                title: 'No system means no follow-up',
                desc: 'You meant to send the market update. A showing ran long. Three days passed. The buyer signed with the agent who showed up consistently, not better.',
              },
            ].map(({ icon: Icon, title, desc }, i) => (
              <div key={i} className="group rounded-2xl p-6 transition-all duration-200 hover:-translate-y-1 cursor-default"
                style={{ backgroundColor: '#F8F4EE', border: '1px solid #E8E2D8', boxShadow: '0 1px 4px rgba(13,43,85,0.06)' }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: 'rgba(240,112,24,0.1)' }}>
                  <Icon className="w-5 h-5" style={{ color: ORANGE }} />
                </div>
                <h3 className="font-black text-lg mb-2" style={{ color: NAVY }}>{title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: '#6B6355' }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works (Neocortex — logic/process) ── */}
      <section id="how-it-works" className="py-20 lg:py-28" style={{ backgroundColor: CREAM }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <p className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: ORANGE }}>How It Works</p>
            <h2 className="text-3xl sm:text-4xl font-black" style={{ color: NAVY }}>Built for how agents actually work</h2>
          </div>
          <div className="flex flex-col gap-10">
            {[
              {
                title: 'Connect your inboxes in 10 minutes',
                desc: 'Link your Gmail, connect your phone number, and add your active listings. RealtyWyze pulls every inquiry from Zillow, Realtor.com, email, and text into one unified inbox. No more switching between six apps.',
              },
              {
                title: 'Open Today every morning',
                desc: 'RealtyWyze builds your daily action list overnight. You see exactly who needs a call, text, or follow-up, ranked by urgency. Buyers waiting on responses. Sellers due for a check-in. Showings to confirm. One list. Clear priority.',
              },
              {
                title: 'Let automation protect the gaps',
                desc: 'Set up follow-up sequences for buyers and sellers and let them run. The AI voice agent answers calls when you\'re in a showing and creates a task automatically. You close more deals without working more hours.',
              },
            ].map((step, i) => (
              <div key={step.title} className="flex gap-5 items-start">
                <div className="flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-white font-black text-lg shadow-md" style={{ backgroundColor: ORANGE }}>
                  {i + 1}
                </div>
                <div className="pt-1">
                  <h3 className="text-xl font-black mb-2" style={{ color: NAVY }}>{step.title}</h3>
                  <p className="text-gray-600 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Today List callout (Limbic — control/confidence) ── */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: ORANGE }}>Start Every Day With Clarity</p>
              <h2 className="text-3xl sm:text-4xl font-black mb-5" style={{ color: NAVY }}>
                Know exactly who needs you before you open your first email.
              </h2>
              <p className="text-gray-600 leading-relaxed mb-6">
                Top agents don&rsquo;t work harder. They start every morning with a clear, prioritized list instead of a guess. RealtyWyze builds that list for you overnight: buyers waiting for a response, sellers due for a check-in, showings that need confirmation.
              </p>
              <p className="text-gray-600 leading-relaxed mb-8">
                Open Today. Work the list. Close the day knowing every client was touched and no opportunity was left behind.
              </p>
              <Link href="/signup" className="inline-flex items-center gap-2 text-sm font-bold px-6 py-3 rounded-lg text-white transition-all hover:opacity-90" style={{ backgroundColor: NAVY }}>
                See your Today list <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="rounded-2xl p-6 space-y-3" style={{ backgroundColor: NAVY }}>
              <p className="text-white/60 text-xs uppercase tracking-widest font-bold mb-4">Today, Tuesday May 27</p>
              {[
                { color: '#22c55e', type: 'Call',    name: 'Maria Santos',   note: 'Wants to see the 3/2 on Birchwood Dr',  time: '2h ago' },
                { color: ORANGE,   type: 'Follow up', name: 'Kevin Walsh',  note: 'No reply in 4 days. Pre-approved buyer.', time: '4d' },
                { color: '#3b82f6', type: 'Confirm', name: 'Linda Park',    note: 'Showing at 4pm, needs confirmation',         time: 'Today' },
                { color: '#a855f7', type: 'Update',  name: 'Tom &amp; Jen Rivera', note: 'Price reduction agreed, update MLS listing', time: 'Yesterday' },
              ].map((item, i) => (
                <div key={i} className="rounded-xl px-4 py-3 flex items-start gap-3" style={{ backgroundColor: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <span className="text-[10px] font-bold uppercase px-2 py-1 rounded shrink-0 mt-0.5" style={{ backgroundColor: item.color + '25', color: item.color }}>{item.type}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-semibold leading-tight" dangerouslySetInnerHTML={{ __html: item.name }} />
                    <p className="text-white/50 text-xs leading-tight mt-0.5 truncate" dangerouslySetInnerHTML={{ __html: item.note }} />
                  </div>
                  <span className="text-white/30 text-[10px] shrink-0 mt-1">{item.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Features (Neocortex — logic) ── */}
      <section id="features" className="py-20 lg:py-28" style={{ backgroundColor: CREAM }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <p className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: ORANGE }}>Features</p>
            <h2 className="text-3xl sm:text-4xl font-black" style={{ color: NAVY }}>Everything an independent agent needs. Nothing they don&rsquo;t.</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: Inbox,        title: 'Unified Lead Inbox',       desc: 'Zillow, Realtor.com, email, and text in one queue. Reply by text or email without switching apps. Every message saved to the client timeline.' },
              { icon: Home,         title: 'Listing Management',        desc: 'Add listings with price, beds, baths, and photos. Track offer activity and price history per property.' },
              { icon: Phone,        title: 'AI Voice Agent',            desc: 'Answers inbound calls when you\'re in a showing, qualifies the caller, and creates a follow-up task automatically. Every buyer reaches a human-level response.' },
              { icon: RefreshCw,    title: 'Follow-Up Sequences',       desc: 'Automated email and text cadences for buyers and sellers. Set them once. RealtyWyze keeps the conversation warm between meetings.' },
              { icon: Users,        title: 'Client Profiles',           desc: 'Every call, text, email, note, and saved search in one timeline per client. Anyone on your team can pick up the conversation instantly.' },
              { icon: BarChart2,    title: 'Daily AI Briefing',         desc: 'Every morning, RealtyWyze delivers a concise briefing on active buyers, stale listings, follow-ups overdue, and anything worth knowing before your first call.' },
              { icon: Zap,          title: 'Public Listing Pages',      desc: 'Each listing gets a shareable page with photos and property details. Built for buyer outreach and social posting.' },
              { icon: MessageSquare,title: 'Two-Way Text & Email',      desc: 'Reply to clients by text or email from the same inbox. Templates for the messages you send every day. Your number stays consistent.' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: 'rgba(240,112,24,0.1)' }}>
                  <Icon className="w-5 h-5" style={{ color: ORANGE }} />
                </div>
                <h3 className="font-black text-base mb-2" style={{ color: NAVY }}>{title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why agents switch (Limbic — belonging/identity) ── */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <p className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: ORANGE }}>Why Agents Switch</p>
            <h2 className="text-3xl sm:text-4xl font-black" style={{ color: NAVY }}>From scattered to clear in one week.</h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              { before: 'Six apps open at once. No single source of truth.', after: 'One inbox. Every inquiry from Zillow, email, and text in the same place.' },
              { before: 'Good clients go cold between meetings. No system to stay consistent.', after: 'Automated sequences run between every showing and meeting. Nothing falls through.' },
              { before: 'Missed calls while showing. Buyers book with whoever answered.', after: 'AI voice agent captures every call. Buyers always reach a response.' },
            ].map(({ before, after }, i) => (
              <div key={i} className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
                <div className="px-5 py-4 bg-red-50 border-b border-red-100">
                  <p className="text-xs font-bold uppercase tracking-wide text-red-600 mb-2">Before</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{before}</p>
                </div>
                <div className="px-5 py-4" style={{ backgroundColor: '#f0fdf4' }}>
                  <p className="text-xs font-bold uppercase tracking-wide text-green-700 mb-2">After RealtyWyze</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{after}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Social proof (Limbic — trust/belonging) ── */}
      <section className="py-16 lg:py-20" style={{ backgroundColor: CREAM }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10">
            <p className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: ORANGE }}>Early Agents</p>
            <h2 className="text-2xl sm:text-3xl font-black" style={{ color: NAVY }}>What agents are saying</h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              { quote: 'I used to start every morning guessing who to call. Now I open Today and work the list. It changed how I operate.', name: 'Maria C.', role: 'Independent Agent, Los Angeles' },
              { quote: 'The AI voice agent alone is worth it. I was losing buyers to voicemail during showings. That stopped immediately.', name: 'Kevin W.', role: 'Solo Agent, San Diego' },
              { quote: "My follow-up used to drop off after the second meeting. The sequences keep clients warm until they're ready. My conversion rate went up.", name: 'Sarah L.', role: 'Buyers Agent, Phoenix' },
            ].map(({ quote, name, role }) => (
              <div key={name} className="rounded-2xl p-6 bg-white border border-gray-100 shadow-sm">
                <div className="flex gap-0.5 mb-4">
                  {[...Array(5)].map((_, i) => <Star key={i} className="w-4 h-4 fill-current" style={{ color: ORANGE }} />)}
                </div>
                <p className="text-sm text-gray-700 leading-relaxed mb-5 italic">&ldquo;{quote}&rdquo;</p>
                <div>
                  <p className="text-sm font-bold" style={{ color: NAVY }}>{name}</p>
                  <p className="text-xs text-gray-500">{role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing (Neocortex — rational justification) ── */}
      <section id="pricing" className="py-20 lg:py-28 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-10">
            <p className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: ORANGE }}>Pricing</p>
            <h2 className="text-3xl sm:text-4xl font-black mb-4" style={{ color: NAVY }}>Free forever during beta.</h2>
            <p className="text-gray-600 max-w-xl mx-auto">
              One closing pays for two years of RealtyWyze. We're in beta and everything is free while we build together.
            </p>
          </div>

          {/* Beta banner */}
          <div className="max-w-3xl mx-auto mb-10 rounded-2xl px-6 py-4 flex items-start gap-3"
            style={{ backgroundColor: '#FFF7ED', border: '1.5px solid #FDBA74' }}>
            <FlaskConical className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#9A3412' }} />
            <div>
              <p className="text-sm font-black" style={{ color: '#9A3412' }}>Beta Program</p>
              <p className="text-sm mt-0.5" style={{ color: '#7C2D12' }}>
                We're in beta. Everything is free right now: Growth plan ($0), AI features, SMS, listing videos, and more. We'll notify 30 days before paid plans launch. Early adopters keep the free tier forever.
              </p>
            </div>
          </div>

          {/* Cards */}
          <div className="grid sm:grid-cols-3 gap-6">

            {/* Free Trial — featured */}
            <div className="rounded-2xl p-7 relative flex flex-col"
              style={{ backgroundColor: NAVY, border: `2px solid ${NAVY}`,
                boxShadow: '0 8px 32px rgba(13,43,85,0.35)' }}>
              <div className="mb-5">
                <span className="text-xs font-black uppercase tracking-wide px-3 py-1.5 rounded-full"
                  style={{ backgroundColor: ORANGE, color: '#fff' }}>
                  Available Now, Free
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
                {[
                  'Up to 250 clients & leads',
                  'Up to 50 active listings',
                  'Public listing pages (SEO-ready)',
                  'Listing-linked activity tracking',
                  'Lead pipeline (Kanban board)',
                  'Gmail + IMAP lead auto-import',
                  'AI Lead Scanner (photo & PDF)',
                  'AI Daily Brief (who to call today)',
                  'Follow-up sequences & templates',
                  'Google Calendar integration',
                  'Client Pulse surveys + rep score',
                  'Analytics & full XLSX export',
                  'Contacts & business card scan',
                  'Team members + role-based access',
                ].map((feat, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm" style={{ color: 'rgba(255,255,255,0.85)' }}>
                    <Check className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: ORANGE }} />
                    {feat}
                  </li>
                ))}
              </ul>
              <Link href="/signup"
                className="w-full py-3.5 rounded-xl font-bold text-sm text-white text-center transition-all hover:opacity-90 active:scale-95 block"
                style={{ backgroundColor: ORANGE, boxShadow: '0 4px 16px rgba(240,112,24,0.4)' }}>
                Start Free. No Card Needed.
              </Link>
              <p className="text-center mt-3 text-xs" style={{ color: 'rgba(255,255,255,0.70)' }}>
                No credit card · No commitment
              </p>
            </div>

            {/* Growth */}
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
                  Becomes <strong>$150/mo</strong> after beta ends
                </p>
              </div>
              <ul className="space-y-2.5 mb-7 mt-4 flex-1">
                {[
                  'Unlimited clients & leads',
                  'Unlimited active listings',
                  'Public listing pages (SEO-ready)',
                  'Listing-linked activity tracking',
                  'Lead pipeline (Kanban board)',
                  'Gmail + IMAP lead auto-import',
                  'AI Lead Scanner (photo & PDF)',
                  'AI Daily Brief (who to call today)',
                  'Follow-up sequences & templates',
                  'Google Calendar integration',
                  'Client Pulse surveys + rep score',
                  'Analytics & full XLSX export',
                  'Contacts & business card scan',
                  'Team members + role-based access',
                  '25 AI listing videos/month',
                  'Auto-post to Facebook & Instagram',
                ].map((feat, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm" style={{ color: '#3D3530' }}>
                    <Check className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#C4B8AC' }} />
                    {feat}
                  </li>
                ))}
                <li className="pt-2 border-t" style={{ borderColor: '#E8E2D8', listStyle: 'none' }}>
                  <p className="text-xs font-black uppercase tracking-wide mb-2" style={{ color: ORANGE }}>Messaging</p>
                </li>
                {[
                  'Two-way SMS + dedicated business number',
                  '3,000 SMS credits/month (included)',
                  'SMS credits never expire—they roll over each month',
                ].map((feat, i) => (
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

            {/* Pro */}
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
                  <span className="text-4xl font-black" style={{ color: NAVY }}>$350</span>
                  <span className="text-sm pb-1.5" style={{ color: '#6B6355' }}>/mo</span>
                </div>
                <p className="text-xs mt-1" style={{ color: '#6B6355' }}>
                  Available after beta
                </p>
              </div>
              <ul className="space-y-2.5 mb-7 mt-4 flex-1">
                {[
                  'Unlimited clients & leads',
                  'Unlimited active listings',
                  'Public listing pages (SEO-ready)',
                  'Listing-linked activity tracking',
                  'Lead pipeline (Kanban board)',
                  'Gmail + IMAP lead auto-import',
                  'AI Lead Scanner (photo & PDF)',
                  'AI Daily Brief (who to call today)',
                  'Follow-up sequences & templates',
                  'Google Calendar integration',
                  'Client Pulse surveys + rep score',
                  'Analytics & full XLSX export',
                  'Contacts & business card scan',
                  'Team members + role-based access',
                  '75 AI listing videos/month',
                  'Auto-post to Facebook & Instagram',
                ].map((feat, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-sm" style={{ color: '#3D3530' }}>
                    <Check className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#C4B8AC' }} />
                    {feat}
                  </li>
                ))}
                <li className="pt-2 border-t" style={{ borderColor: '#E8E2D8', listStyle: 'none' }}>
                  <p className="text-xs font-black uppercase tracking-wide mb-2" style={{ color: ORANGE }}>Messaging & Voice</p>
                </li>
                {[
                  'Two-way SMS + dedicated business number',
                  '5,000 SMS credits/month (included)',
                  '3,000 voice minutes/month (included)',
                  'SMS & voice credits never expire—they roll over each month',
                ].map((feat, i) => (
                  <li key={`p${i}`} className="flex items-start gap-2.5 text-sm" style={{ color: '#3D3530' }}>
                    <Check className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#C4B8AC' }} />
                    {feat}
                  </li>
                ))}
                <li className="pt-2 border-t" style={{ borderColor: '#E8E2D8', listStyle: 'none' }}>
                  <p className="text-xs font-black uppercase tracking-wide mb-2" style={{ color: ORANGE }}>AI Voice Agent</p>
                </li>
                {[
                  'Dedicated AI voice agent (Retell AI)',
                  'Answers inbound calls 24/7',
                  'Qualifies buyers on budget, timeline, and pre-approval',
                  'Captures seller leads after hours',
                  'Post-call transcripts & summaries',
                  'Auto lead creation from every inbound call',
                ].map((feat, i) => (
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
            <a href="mailto:support@realtywyze.us"
              className="underline underline-offset-2 hover:opacity-70 transition-opacity"
              style={{ color: NAVY }}>
              support@realtywyze.us
            </a>
          </p>
        </div>
      </section>

      {/* ── Roadmap (Q2 Coming Soon) ── */}
      <section className="py-20 lg:py-28" style={{ backgroundColor: CREAM }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <p className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: ORANGE }}>Coming Q2 2026</p>
            <h2 className="text-3xl sm:text-4xl font-black" style={{ color: NAVY }}>On the roadmap</h2>
            <p className="text-gray-600 max-w-2xl mx-auto mt-4">
              We&rsquo;re shipping new features every week. Here&rsquo;s what agents are asking for most.
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-6">
            {[
              { icon: Calendar, title: 'Showing Scheduler', desc: 'Buyers request showings directly from your listing pages. Manage requests, confirmations, and no-shows from your dashboard.' },
              { icon: Home, title: 'MLS Sync', desc: 'Auto-sync listings from your MLS board. Keep your listing inventory up-to-date automatically with price changes and status updates.' },
              { icon: Users, title: 'Buyer Matching', desc: 'Save buyer criteria once. New listings automatically match to interested buyers. Get notified of perfect matches instantly.' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-2xl border-2 p-6 bg-white text-center" style={{ borderColor: ORANGE }}>
                <div className="w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: `${ORANGE}15` }}>
                  <Icon className="w-6 h-6" style={{ color: ORANGE }} />
                </div>
                <h3 className="font-black text-lg mb-2" style={{ color: NAVY }}>{title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Founder (Limbic — trust/human) ── */}
      <section className="py-20 lg:py-28" style={{ backgroundColor: CREAM }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <p className="text-xs font-black uppercase tracking-widest mb-6" style={{ color: ORANGE }}>From the Founder</p>
          <h2 className="text-2xl sm:text-3xl font-black mb-6" style={{ color: NAVY }}>
            Built by someone who watched great agents lose deals they deserved to win.
          </h2>
          <p className="text-gray-600 leading-relaxed mb-4">
            I built DealerWyze for used car dealers and watched it change how they respond to leads and close deals. The same pattern kept showing up: not a talent problem, not a marketing problem. A follow-up problem. Busy professionals losing deals simply because they didn&rsquo;t have a system to stay consistent.
          </p>
          <p className="text-gray-600 leading-relaxed mb-4">
            RealtyWyze is the same platform, rebuilt for real estate. One place for every client conversation, every listing, every follow-up. The discipline of top-producing agents, built into software so you don&rsquo;t have to hold it all in your head.
          </p>
          <p className="text-gray-600 leading-relaxed mb-8">
            If you&rsquo;re an independent agent or run a small brokerage and you&rsquo;re tired of juggling apps, I&rsquo;d like to show you what this looks like for your business. Text me directly.
          </p>
          <div className="border-t border-gray-200 pt-6">
            <p className="font-black text-lg" style={{ color: NAVY }}>Tim Harmantzis</p>
            <p className="text-gray-500 text-sm mb-2">Founder, RealtyWyze</p>
            <a href="tel:+18054043873" className="text-sm font-semibold hover:underline" style={{ color: ORANGE }}>(805) 404-3873</a>
          </div>
        </div>
      </section>

      {/* ── FAQ (Neocortex — objection handling) ── */}
      <section className="py-20 lg:py-28 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-12">
            <p className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: ORANGE }}>FAQ</p>
            <h2 className="text-3xl sm:text-4xl font-black" style={{ color: NAVY }}>Common questions</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {[
              { q: 'How is RealtyWyze different from a generic CRM?', a: "Generic CRMs like HubSpot or Salesforce are built for sales teams, not agents. RealtyWyze is purpose-built for real estate: AI voice agent answering calls while you're in showings, SMS and email automation, listing management, and a unified inbox for all leads. Setup takes minutes, not weeks." },
              { q: 'Does it replace my MLS or showing software?', a: "No. RealtyWyze connects to your workflow rather than replacing your MLS. It's the CRM layer that captures inquiries, manages client follow-up, and keeps your listings organized. Think of it as the system that makes everything else more effective." },
              { q: 'How does the AI voice agent work?', a: 'When a buyer calls and you\'re unavailable, the AI answers, qualifies the caller (what they\'re looking for, timeline, pre-approval status), and creates a follow-up task in your inbox. Buyers always reach a live-feeling response, even when you\'re in a showing.' },
              { q: 'Can I use it with my current email and phone?', a: 'Yes. Connect your Gmail or another email inbox in Settings. RealtyWyze pulls in inquiries from connected inboxes and lets you reply from within the app. Your business phone number is provisioned inside RealtyWyze for two-way texting.' },
              { q: 'How long does setup take?', a: 'Most agents are fully set up in under 10 minutes: connect your inbox, add your listings, provision your phone number. The onboarding wizard walks you through each step. Your Today list starts building from day one.' },
              { q: 'What does it cost?', a: 'Everything is free during beta. Growth plan is $0 now and becomes $150/mo after beta ends. Pro plan ($350/mo) is coming soon. SMS and voice credits never expire—they roll over month to month. Early adopters get the free tier forever. One closing pays for years of RealtyWyze.' },
            ].map(faq => <FAQItem key={faq.q} {...faq} />)}
          </div>
        </div>
      </section>

      {/* ── Final CTA (Reptilian + Limbic) ── */}
      <section className="px-4 sm:px-6 py-20 sm:py-28 text-center" style={{ backgroundColor: NAVY }}>
        <div className="max-w-3xl mx-auto">
          <p className="text-xs font-black uppercase tracking-widest mb-6 text-white/60">Start Today</p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white mb-5 leading-tight">
            The next deal you lose to a competitor will be a follow-up problem.
            <br className="hidden sm:block" />
            <span style={{ color: ORANGE }}> Fix it today.</span>
          </h2>
          <p className="text-white/70 mb-10 text-lg max-w-xl mx-auto leading-relaxed">
            Set up in under 10 minutes. Your Today list starts working overnight. No credit card, no contract.
          </p>
          <Link href="/signup" className="inline-flex items-center gap-2 text-base font-bold px-10 py-4 rounded-xl text-white transition-all hover:opacity-90 shadow-2xl" style={{ backgroundColor: ORANGE }}>
            Start your free trial <ChevronRight className="w-5 h-5" />
          </Link>
          <p className="mt-5 text-sm text-white/40">Free during beta. Early adopters keep the free tier forever.</p>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="px-4 sm:px-6 py-10" style={{ backgroundColor: '#1E293B' }}>
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 mb-8">
            <div>
              <Image src="/rw-logo.png" alt="RealtyWyze" width={120} height={65} style={{ height: 'auto' }} className="brightness-0 invert" />
              <p className="text-sm text-white/50 mt-1">The CRM for independent agents.</p>
            </div>
            <nav className="flex flex-wrap items-center gap-4 sm:gap-6">
              <a href="#features"          className="text-sm text-white/50 hover:text-white transition-colors">Features</a>
              <a href="#pricing"           className="text-sm text-white/50 hover:text-white transition-colors">Pricing</a>
              <a href="/realtywyze-privacy.html" className="text-sm text-white/50 hover:text-white transition-colors">Privacy</a>
              <a href="/realtywyze-terms.html"   className="text-sm text-white/50 hover:text-white transition-colors">Terms</a>
              <Link href="/login"          className="text-sm text-white/50 hover:text-white transition-colors">Sign in</Link>
            </nav>
          </div>
          <div className="border-t border-white/10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-white/30">&copy; 2026 RealtyWyze. All rights reserved.</p>
            <a href="tel:+18054043873" className="text-xs hover:underline" style={{ color: ORANGE }}>(805) 404-3873</a>
          </div>
        </div>
      </footer>

    </div>
  )
}
