'use client'

import React from 'react'
import { motion } from 'framer-motion'
import {
  ListChecks,
  MessageSquare,
  Car,
  CalendarDays,
  Search,
  BarChart3,
  Mic,
  CreditCard,
  Users,
  BookOpen,
  TrendingUp,
  Inbox,
  Heart,
} from 'lucide-react'
import { NAVY, ORANGE, StaggerGrid, cardVariants } from './_shared'

const features: { icon: React.ElementType; title: string; desc: string }[] = [
  { icon: ListChecks,    title: 'Today Dashboard',
    desc: 'Prioritized daily action list - overdue tasks, new leads, appointments, and follow-ups ranked by urgency.' },
  { icon: Car,           title: 'Lead Pipeline',
    desc: 'Kanban board from New Lead to Contacted to Appointment to Sold. Drag to advance, filter by rep.' },
  { icon: MessageSquare, title: 'Two-Way SMS & Email',
    desc: 'Text and email from one inbox with a dedicated business number. Replies land in the customer thread automatically.' },
  { icon: Inbox,         title: 'Lead Import',
    desc: 'Auto-import leads from Gmail, IMAP, AutoTrader, CarGurus, walk-in buyer cards, and uploaded screenshots - no manual entry.' },
  { icon: CalendarDays,  title: 'Calendar & Appointments',
    desc: 'Schedule test drives, sync to Google Calendar, and send automatic SMS reminders to customers.' },
  { icon: CreditCard,    title: 'BHPH Loan Tracking',
    desc: 'Track in-house loans, payment schedules, and collections. Automated overdue payment reminders via SMS.' },
  { icon: BookOpen,      title: 'Receipt Import & Ledger',
    desc: 'Upload a receipt photo - AI extracts vendor, amount, and category, then posts it to your ledger automatically.' },
  { icon: BarChart3,     title: 'Analytics & Reports',
    desc: 'Lead funnel, SMS stats, response time, BHPH collection rate, and revenue trends. Full XLSX export.' },
  { icon: Search,        title: 'Instant Search',
    desc: 'Find any customer by name, phone, email, VIN, or make/model in under a second. Mid-conversation fast.' },
  { icon: Users,         title: 'Team & Roles',
    desc: 'Invite staff with role-based access: admin, manager, finance, rep, or staff. Reps see only their assigned leads.' },
  { icon: Mic,           title: 'Voice Notes',
    desc: 'Record a 15-second note after a call. AI transcribes and attaches it to the customer timeline.' },
  { icon: TrendingUp,    title: 'AI Pricing Intelligence',
    desc: 'Fast Sale, Fair Market, and Max Return price tiers with live comps, NHTSA reliability check, and an AI market analysis - one click.' },
  { icon: Heart,         title: 'Customer Pulse',
    desc: 'Auto-send post-sale satisfaction surveys. Track per-rep scores, spot unhappy buyers before they leave a bad review, and turn feedback into team improvement.' },
]

export default function FeaturesSection() {
  return (
    <section id="features" className="py-20 lg:py-28" style={{ backgroundColor: '#F4F0EA' }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-14">
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

        <StaggerGrid className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f, i) => {
            const Icon = f.icon
            return (
              <motion.div key={i} variants={cardVariants}
                className="rounded-2xl p-6 transition-all duration-200 hover:-translate-y-1 flex gap-4"
                style={{ backgroundColor: '#FDFAF7', border: '1px solid #E8E2D8',
                  boxShadow: '0 1px 6px rgba(13,43,85,0.06)' }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ backgroundColor: 'rgba(240,112,24,0.1)' }}>
                  <Icon className="w-5 h-5" style={{ color: ORANGE }} />
                </div>
                <div>
                  <h3 className="font-black text-base mb-1.5" style={{ color: NAVY }}>{f.title}</h3>
                  <p className="text-sm leading-relaxed" style={{ color: '#6B6355' }}>{f.desc}</p>
                </div>
              </motion.div>
            )
          })}
        </StaggerGrid>
      </div>
    </section>
  )
}
