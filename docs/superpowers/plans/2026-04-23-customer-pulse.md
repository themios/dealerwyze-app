# Customer Pulse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Customer Pulse — token-based post-sale customer surveys, a dealer score dashboard, a PDCA improvement board, and a per-rep anonymous score widget on the Today page.

**Architecture:** Public survey pages at `app/pulse/[token]/` (no auth wrapper, outside `(app)` group) collect responses into `pulse_surveys` + `pulse_responses`. Dealer dashboard at `app/(app)/pulse/` is gated to dealer_admin/dealer_manager. Auto-triggers fire from `/api/bhph/create` (on sold) and the daily cron (day-30/day-180). Reps see their rolling 90-day score on the Today page; clicking it opens an anonymous feedback sheet. Platform benchmarks (Layer 5) are deferred to a future milestone.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase Postgres + RLS, Tailwind v4, shadcn/ui, Twilio SMS (existing pattern)

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/097_customer_pulse.sql`

- [ ] **Step 1: Write migration SQL**

```sql
-- supabase/migrations/097_customer_pulse.sql

-- One survey event per customer per trigger
create table if not exists pulse_surveys (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  customer_id     uuid not null references customers(id) on delete cascade,
  assigned_rep_id uuid references profiles(id) on delete set null,
  trigger_type    text not null check (trigger_type in ('sold', 'manual', 'day30', 'day180')),
  token           text not null unique default encode(gen_random_bytes(32), 'base64url'),
  sent_at         timestamptz,
  opened_at       timestamptz,
  completed_at    timestamptz,
  expires_at      timestamptz not null default (now() + interval '30 days'),
  depth_chosen    text check (depth_chosen in ('quick', 'standard', 'full')),
  wants_followup  boolean,
  overall_score   numeric(3,2),
  created_at      timestamptz not null default now()
);

-- One row per question per survey
create table if not exists pulse_responses (
  id           uuid primary key default gen_random_uuid(),
  survey_id    uuid not null references pulse_surveys(id) on delete cascade,
  org_id       uuid not null,
  category     text not null check (category in ('first_contact','rep','vehicle','process','facility','post_sale')),
  question_key text not null,
  score        int not null check (score between 1 and 5),
  comment      text,
  created_at   timestamptz not null default now()
);

-- PDCA improvement actions
create table if not exists pulse_actions (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  category     text not null check (category in ('first_contact','rep','vehicle','process','facility','post_sale')),
  plan_text    text not null,
  assigned_to  uuid references profiles(id) on delete set null,
  due_at       timestamptz,
  status       text not null default 'plan' check (status in ('plan','doing','checking','standardized')),
  score_before numeric(3,2),
  score_after  numeric(3,2),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- org_settings additions
alter table org_settings
  add column if not exists pulse_enabled           boolean not null default false,
  add column if not exists pulse_auto_send_on_sold boolean not null default true,
  add column if not exists pulse_send_day30        boolean not null default true,
  add column if not exists pulse_send_day180       boolean not null default false;

-- profiles additions
alter table profiles
  add column if not exists pulse_score            numeric(3,2),
  add column if not exists pulse_score_updated_at timestamptz;

-- RLS
alter table pulse_surveys   enable row level security;
alter table pulse_responses enable row level security;
alter table pulse_actions   enable row level security;

create policy "pulse_surveys_org"   on pulse_surveys   using (org_id = public.get_org_id());
create policy "pulse_responses_org" on pulse_responses  using (org_id = public.get_org_id());
create policy "pulse_actions_org"   on pulse_actions    using (org_id = public.get_org_id());

-- Indexes
create index if not exists pulse_surveys_org_idx      on pulse_surveys(org_id);
create index if not exists pulse_surveys_customer_idx on pulse_surveys(customer_id);
create index if not exists pulse_surveys_token_idx    on pulse_surveys(token);
create index if not exists pulse_surveys_rep_idx      on pulse_surveys(assigned_rep_id);
create index if not exists pulse_responses_survey_idx on pulse_responses(survey_id);
create index if not exists pulse_responses_org_idx    on pulse_responses(org_id);
create index if not exists pulse_actions_org_idx      on pulse_actions(org_id);
```

- [ ] **Step 2: Hand migration to Tim**

This migration must be applied manually in the Supabase SQL editor. Stop here and ask Tim to apply it before continuing.

---

### Task 2: Survey Question Definitions

**Files:**
- Create: `apollo-crm/lib/pulse/questions.ts`

- [ ] **Step 1: Write question definitions**

```typescript
// lib/pulse/questions.ts

export type Category = 'first_contact' | 'rep' | 'vehicle' | 'process' | 'facility' | 'post_sale'
export type Depth = 'quick' | 'standard' | 'full'

export interface SurveyQuestion {
  key: string
  category: Category
  text: string
  depths: Depth[]
  followUp?: boolean  // only shown when parent category avg score <= 3
}

export const SURVEY_QUESTIONS: SurveyQuestion[] = [
  // First Contact
  { key: 'fc_welcome',  category: 'first_contact', text: 'How welcomed did you feel from your very first interaction with us?', depths: ['quick','standard','full'] },
  { key: 'fc_speed',    category: 'first_contact', text: 'How quickly did we respond to your inquiry?',                         depths: ['standard','full'] },
  { key: 'fc_speed_fu', category: 'first_contact', text: 'What would have made our response faster or better?',                 depths: ['full'], followUp: true },

  // Your Rep
  { key: 'rep_communication', category: 'rep', text: 'How well did your rep communicate throughout the entire process?', depths: ['quick','standard','full'] },
  { key: 'rep_knowledge',     category: 'rep', text: 'How knowledgeable was your rep about the vehicle and the deal?',   depths: ['standard','full'] },
  { key: 'rep_pressure',      category: 'rep', text: 'How comfortable and pressure-free was your experience with us?',   depths: ['standard','full'] },
  { key: 'rep_fu',            category: 'rep', text: 'What could your rep have done differently to serve you better?',   depths: ['full'], followUp: true },

  // The Vehicle
  { key: 'veh_condition',   category: 'vehicle', text: 'How well did the vehicle match what was described or shown online?',  depths: ['quick','standard','full'] },
  { key: 'veh_cleanliness', category: 'vehicle', text: 'How clean and well-prepared was the vehicle when you received it?',  depths: ['standard','full'] },
  { key: 'veh_fu',          category: 'vehicle', text: 'What could we do better in how we present or prepare our vehicles?', depths: ['full'], followUp: true },

  // The Process
  { key: 'proc_ease',      category: 'process', text: 'How easy and straightforward was the overall buying process?',     depths: ['quick','standard','full'] },
  { key: 'proc_paperwork', category: 'process', text: 'How smooth and fast was the paperwork and signing?',               depths: ['standard','full'] },
  { key: 'proc_financing', category: 'process', text: 'How clearly was financing or payment explained to you?',           depths: ['standard','full'] },
  { key: 'proc_fu',        category: 'process', text: 'What would have made the buying process smoother for you?',        depths: ['full'], followUp: true },

  // The Facility
  { key: 'fac_cleanliness', category: 'facility', text: 'How clean and comfortable was our dealership?',               depths: ['standard','full'] },
  { key: 'fac_wait',        category: 'facility', text: 'How would you rate your overall wait experience while here?',  depths: ['full'] },
  { key: 'fac_fu',          category: 'facility', text: 'How could we improve our space or your visit experience?',     depths: ['full'], followUp: true },

  // Post-Sale
  { key: 'ps_followup', category: 'post_sale', text: 'How satisfied are you with the follow-up you received after your purchase?', depths: ['standard','full'] },
  { key: 'ps_refer',    category: 'post_sale', text: 'How likely are you to refer friends or family to us?',                        depths: ['quick','standard','full'] },
  { key: 'ps_return',   category: 'post_sale', text: 'How likely are you to buy from us again in the future?',                      depths: ['standard','full'] },
]

export const CATEGORY_LABELS: Record<Category, string> = {
  first_contact: 'First Contact',
  rep:           'Your Rep',
  vehicle:       'The Vehicle',
  process:       'The Process',
  facility:      'The Facility',
  post_sale:     'Post-Sale',
}

/** Returns non-follow-up questions visible at a given depth */
export function getQuestionsForDepth(depth: Depth): SurveyQuestion[] {
  return SURVEY_QUESTIONS.filter(q => q.depths.includes(depth) && !q.followUp)
}

/** Returns follow-up question for a category (only shown when that category scores <= 3) */
export function getFollowUpQuestion(category: Category): SurveyQuestion | undefined {
  return SURVEY_QUESTIONS.find(q => q.category === category && q.followUp === true)
}
```

- [ ] **Step 2: Commit**

```bash
git add apollo-crm/lib/pulse/questions.ts
git commit -m "feat(pulse): add survey question definitions and depth/follow-up helpers"
```

---

### Task 3: Survey Delivery Helper

**Files:**
- Create: `apollo-crm/lib/pulse/deliver.ts`

Creates a `pulse_surveys` row (token auto-generated by DB) and sends an SMS via Twilio. Non-blocking — survey record is always created even if SMS fails. Fetches customer details from DB when not provided so callers can pass just IDs.

- [ ] **Step 1: Write delivery helper**

```typescript
// lib/pulse/deliver.ts
import { createServiceClient } from '@/lib/supabase/service'

export interface DeliverPulseOptions {
  orgId: string
  customerId: string
  assignedRepId?: string | null
  triggerType: 'sold' | 'manual' | 'day30' | 'day180'
  customerPhone?: string | null
  customerName?: string
}

export async function deliverPulseSurvey(opts: DeliverPulseOptions): Promise<{ token: string } | null> {
  const { orgId, customerId, triggerType } = opts
  const supabase = createServiceClient()

  // Check pulse is enabled for this org
  const { data: settings } = await supabase
    .from('org_settings')
    .select('pulse_enabled, pulse_auto_send_on_sold, twilio_phone_number, business_name')
    .eq('org_id', orgId)
    .maybeSingle()

  if (!settings?.pulse_enabled) return null

  // Respect per-trigger-type settings
  if (triggerType === 'sold' && settings.pulse_auto_send_on_sold === false) return null

  // Guard: no duplicate survey for same customer + trigger type within 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: existing } = await supabase
    .from('pulse_surveys')
    .select('id')
    .eq('org_id', orgId)
    .eq('customer_id', customerId)
    .eq('trigger_type', triggerType)
    .gte('created_at', sevenDaysAgo)
    .maybeSingle()

  if (existing) return null

  // Fetch customer details from DB when not provided by caller
  let phone = opts.customerPhone ?? null
  let name  = opts.customerName  ?? ''
  let repId = opts.assignedRepId ?? null

  if (!name || phone === undefined) {
    const { data: cust } = await supabase
      .from('customers')
      .select('name, primary_phone, assigned_to')
      .eq('id', customerId)
      .maybeSingle()
    if (!name)           name  = cust?.name ?? ''
    if (phone === null)  phone = cust?.primary_phone ?? null
    if (repId === null)  repId = cust?.assigned_to ?? null
  }

  // Create survey record (token auto-generated by DB default)
  const { data: survey, error } = await supabase
    .from('pulse_surveys')
    .insert({
      org_id:          orgId,
      customer_id:     customerId,
      assigned_rep_id: repId,
      trigger_type:    triggerType,
      sent_at:         new Date().toISOString(),
    })
    .select('id, token')
    .single()

  if (error || !survey) return null

  const appUrl    = process.env.NEXT_PUBLIC_APP_URL ?? 'https://dealerwyze.com'
  const surveyUrl = `${appUrl}/pulse/${survey.token}`
  const firstName = name.split(' ')[0] || 'there'
  const bizName   = settings.business_name || 'the dealership'

  // Send SMS via Twilio (non-blocking — survey already created above)
  if (
    phone &&
    settings.twilio_phone_number &&
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN
  ) {
    const twilio = (await import('twilio')).default
    try {
      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
      await client.messages.create({
        to:   phone,
        from: settings.twilio_phone_number,
        body: `Hi ${firstName}! Thank you for your recent purchase at ${bizName}. Your experience matters to us. Please take a moment to share your feedback: ${surveyUrl}`,
      })
    } catch {
      // Non-blocking — do not propagate SMS errors
    }
  }

  return { token: survey.token }
}
```

- [ ] **Step 2: Commit**

```bash
git add apollo-crm/lib/pulse/deliver.ts
git commit -m "feat(pulse): add survey delivery helper with Twilio SMS and dedup guard"
```

---

### Task 4: Token Validation API

**Files:**
- Create: `apollo-crm/app/api/pulse/[token]/route.ts`

Public GET — no auth. Returns only the customer's first name (not full name) and org name to minimize PII. Marks `opened_at` on first visit.

- [ ] **Step 1: Write API route**

```typescript
// app/api/pulse/[token]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const supabase = createServiceClient()

  const { data: survey } = await supabase
    .from('pulse_surveys')
    .select('id, completed_at, expires_at, customer:customers(name), org:organizations(name)')
    .eq('token', token)
    .maybeSingle()

  if (!survey) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (survey.completed_at) {
    return NextResponse.json({ error: 'already_completed' }, { status: 410 })
  }
  if (new Date(survey.expires_at) < new Date()) {
    return NextResponse.json({ error: 'expired' }, { status: 410 })
  }

  // Mark opened_at on first visit (fire-and-forget, ignore errors)
  supabase
    .from('pulse_surveys')
    .update({ opened_at: new Date().toISOString() })
    .eq('token', token)
    .is('opened_at', null)
    .then(() => {})

  const customer = survey.customer as { name: string } | null
  const org      = survey.org      as { name: string } | null

  return NextResponse.json({
    survey_id:           survey.id,
    customer_first_name: customer?.name?.split(' ')[0] ?? 'there',
    org_name:            org?.name ?? 'the dealership',
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add apollo-crm/app/api/pulse/[token]/route.ts
git commit -m "feat(pulse): add public token validation API"
```

---

### Task 5: Response Submission API

**Files:**
- Create: `apollo-crm/app/api/pulse/[token]/respond/route.ts`

Public POST, token-validated. Validates each response, inserts rows, computes overall score, marks survey complete, creates follow-up task if requested, fires `admin_alert` if any category avg <= 2, updates assigned rep's rolling `pulse_score` on `profiles`.

- [ ] **Step 1: Write API route**

```typescript
// app/api/pulse/[token]/respond/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import type { Category, Depth } from '@/lib/pulse/questions'

interface ResponseEntry {
  category: Category
  question_key: string
  score: number
  comment?: string
}

interface SubmitBody {
  depth: Depth
  responses: ResponseEntry[]
  wants_followup: boolean
}

const VALID_CATEGORIES = new Set<string>(['first_contact','rep','vehicle','process','facility','post_sale'])
const VALID_DEPTHS     = new Set<string>(['quick','standard','full'])

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const supabase  = createServiceClient()

  const { data: survey } = await supabase
    .from('pulse_surveys')
    .select('id, org_id, customer_id, assigned_rep_id, completed_at, expires_at')
    .eq('token', token)
    .maybeSingle()

  if (!survey)             return NextResponse.json({ error: 'Not found' },        { status: 404 })
  if (survey.completed_at) return NextResponse.json({ error: 'already_completed' }, { status: 410 })
  if (new Date(survey.expires_at) < new Date()) {
    return NextResponse.json({ error: 'expired' }, { status: 410 })
  }

  let body: SubmitBody
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }

  const { depth, responses, wants_followup } = body

  if (!VALID_DEPTHS.has(depth)) {
    return NextResponse.json({ error: 'Invalid depth' }, { status: 400 })
  }
  if (!Array.isArray(responses) || responses.length === 0) {
    return NextResponse.json({ error: 'Responses required' }, { status: 400 })
  }

  for (const r of responses) {
    if (!VALID_CATEGORIES.has(r.category))            return NextResponse.json({ error: 'Invalid category' },     { status: 400 })
    if (!r.question_key || typeof r.question_key !== 'string') return NextResponse.json({ error: 'Invalid question_key' }, { status: 400 })
    if (!Number.isInteger(r.score) || r.score < 1 || r.score > 5) return NextResponse.json({ error: 'Score must be 1-5' }, { status: 400 })
  }

  // Insert all responses
  const rows = responses.map(r => ({
    survey_id:    survey.id,
    org_id:       survey.org_id,
    category:     r.category,
    question_key: r.question_key,
    score:        r.score,
    comment:      r.comment ? r.comment.slice(0, 1000) : null,
  }))

  const { error: insertErr } = await supabase.from('pulse_responses').insert(rows)
  if (insertErr) return NextResponse.json({ error: 'Failed to save' }, { status: 500 })

  // Compute overall average (exclude follow-up text questions)
  const scoredResponses = responses.filter(r => !r.question_key.endsWith('_fu'))
  const overall = scoredResponses.length > 0
    ? Math.round((scoredResponses.reduce((a, r) => a + r.score, 0) / scoredResponses.length) * 100) / 100
    : null

  // Mark survey complete
  await supabase
    .from('pulse_surveys')
    .update({
      completed_at:  new Date().toISOString(),
      depth_chosen:  depth,
      wants_followup: wants_followup === true,
      overall_score: overall,
    })
    .eq('id', survey.id)

  // Create follow-up task if customer requested it
  if (wants_followup) {
    supabase.from('activities').insert({
      user_id:     survey.org_id,
      customer_id: survey.customer_id,
      type:        'task',
      direction:   'outbound',
      priority:    'high',
      outcome:     'pending',
      body:        'Customer requested follow-up on their satisfaction survey.',
      due_at:      new Date().toISOString(),
    }).then(() => {})
  }

  // Create admin_alert if any category average <= 2
  const catScores: Record<string, number[]> = {}
  for (const r of scoredResponses) {
    if (!catScores[r.category]) catScores[r.category] = []
    catScores[r.category].push(r.score)
  }
  const lowCategories = Object.entries(catScores)
    .filter(([, scores]) => scores.reduce((a, b) => a + b, 0) / scores.length <= 2)
    .map(([cat]) => cat)

  if (lowCategories.length > 0) {
    supabase.from('admin_alerts').insert({
      org_id:   survey.org_id,
      type:     'pulse_low_score',
      message:  `Low satisfaction score in: ${lowCategories.join(', ')}. Survey ${survey.id}`,
      resolved: false,
    }).then(() => {})
  }

  // Update assigned rep's rolling 90-day pulse_score on profiles
  if (survey.assigned_rep_id) {
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    supabase
      .from('pulse_surveys')
      .select('overall_score')
      .eq('org_id', survey.org_id)
      .eq('assigned_rep_id', survey.assigned_rep_id)
      .not('overall_score', 'is', null)
      .gte('completed_at', since)
      .then(({ data: repSurveys }) => {
        if (!repSurveys || repSurveys.length === 0) return
        const scores = repSurveys.map(s => s.overall_score as number)
        const avg = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
        supabase.from('profiles').update({
          pulse_score:            avg,
          pulse_score_updated_at: new Date().toISOString(),
        }).eq('id', survey.assigned_rep_id).then(() => {})
      })
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Commit**

```bash
git add apollo-crm/app/api/pulse/[token]/respond/route.ts
git commit -m "feat(pulse): add response submission API with score rollup, follow-up task, and admin alert"
```

---

### Task 6: Public Survey Page

**Files:**
- Create: `apollo-crm/app/pulse/[token]/page.tsx`
- Create: `apollo-crm/app/pulse/[token]/SurveyClient.tsx`

This directory is outside `app/(app)/` so it gets no auth middleware. Three stages: welcome + depth selection, questions (with adaptive follow-ups for low scores), thank-you.

- [ ] **Step 1: Create page shell**

```typescript
// app/pulse/[token]/page.tsx
import type { Metadata } from 'next'
import SurveyClient from './SurveyClient'

export const metadata: Metadata = {
  title: 'Share Your Feedback',
}

export default async function PulseSurveyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <SurveyClient token={token} />
}
```

- [ ] **Step 2: Create survey client component**

```typescript
// app/pulse/[token]/SurveyClient.tsx
'use client'

import { useState, useEffect } from 'react'
import { getQuestionsForDepth, getFollowUpQuestion, CATEGORY_LABELS } from '@/lib/pulse/questions'
import type { Depth, Category, SurveyQuestion } from '@/lib/pulse/questions'

type Stage = 'loading' | 'error' | 'welcome' | 'questions' | 'thankyou'

interface SurveyMeta {
  survey_id: string
  customer_first_name: string
  org_name: string
}

export default function SurveyClient({ token }: { token: string }) {
  const [stage, setStage]         = useState<Stage>('loading')
  const [meta, setMeta]           = useState<SurveyMeta | null>(null)
  const [errorType, setErrorType] = useState('')
  const [depth, setDepth]         = useState<Depth>('standard')
  const [answers, setAnswers]     = useState<Record<string, number>>({})
  const [comments, setComments]   = useState<Record<string, string>>({})
  const [wantsFollowup, setWants] = useState(false)
  const [submitting, setSubmit]   = useState(false)

  useEffect(() => {
    fetch(`/api/pulse/${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setErrorType(d.error); setStage('error'); return }
        setMeta(d)
        setStage('welcome')
      })
      .catch(() => { setErrorType('network'); setStage('error') })
  }, [token])

  const questions = getQuestionsForDepth(depth)

  // Determine adaptive follow-up questions (full depth, category avg <= 3)
  const followUps: SurveyQuestion[] = []
  if (depth === 'full') {
    const cats = [...new Set(questions.map(q => q.category))]
    for (const cat of cats) {
      const catAnswers = questions.filter(q => q.category === cat).map(q => answers[q.key]).filter(Boolean)
      if (catAnswers.length > 0 && catAnswers.reduce((a, b) => a + b, 0) / catAnswers.length <= 3) {
        const fu = getFollowUpQuestion(cat as Category)
        if (fu) followUps.push(fu)
      }
    }
  }

  async function handleSubmit() {
    setSubmit(true)
    const allQuestions = [...questions, ...followUps]
    const responses = allQuestions
      .filter(q => answers[q.key] !== undefined || comments[q.key])
      .map(q => ({
        category:     q.category,
        question_key: q.key,
        score:        answers[q.key] ?? 3,
        comment:      comments[q.key] || undefined,
      }))

    const res = await fetch(`/api/pulse/${token}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ depth, responses, wants_followup: wantsFollowup }),
    })

    if (res.ok) {
      setStage('thankyou')
    } else {
      const data = await res.json().catch(() => ({}))
      setErrorType(data.error || 'submit_failed')
      setStage('error')
    }
    setSubmit(false)
  }

  if (stage === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-400">Loading...</p>
      </div>
    )
  }

  if (stage === 'error') {
    const msg =
      errorType === 'already_completed' ? "You've already submitted your feedback. Thank you!"
      : errorType === 'expired'          ? 'This survey link has expired.'
      : 'Something went wrong. Please try again or contact the dealership directly.'
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-sm text-center">
          <p className="text-3xl mb-3">🙏</p>
          <p className="text-base font-medium text-gray-800">{msg}</p>
        </div>
      </div>
    )
  }

  if (stage === 'welcome') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-md p-8">
          <p className="text-sm font-semibold text-orange-600 uppercase tracking-wide mb-2">{meta?.org_name}</p>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">
            Hi {meta?.customer_first_name}, your feedback means everything.
          </h1>
          <p className="text-gray-600 mb-6 leading-relaxed">
            A few minutes of your time helps us serve every customer better. Your responses go directly to management and are never shared publicly. Please be honest - it is the most helpful thing you can do for us.
          </p>
          <p className="text-sm font-semibold text-gray-700 mb-3">How much time do you have?</p>
          <div className="space-y-3 mb-8">
            {([
              { value: 'quick' as Depth,    label: 'Quick',    sub: '5 questions - about 60 seconds' },
              { value: 'standard' as Depth, label: 'Standard', sub: 'All areas - about 2-3 minutes' },
              { value: 'full' as Depth,     label: 'Full',     sub: 'All areas + comments - 4-5 minutes' },
            ]).map(opt => (
              <button
                key={opt.value}
                onClick={() => setDepth(opt.value)}
                className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all ${
                  depth === opt.value
                    ? 'border-orange-500 bg-orange-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <p className="font-semibold text-gray-800">{opt.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{opt.sub}</p>
              </button>
            ))}
          </div>
          <button
            onClick={() => setStage('questions')}
            className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl transition-colors"
          >
            Start Survey
          </button>
        </div>
      </div>
    )
  }

  if (stage === 'questions') {
    const unansweredCount = questions.filter(q => answers[q.key] === undefined).length
    const canProceed = unansweredCount === 0

    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-md mx-auto">
          <div className="mb-6 pt-4">
            <p className="text-xs font-semibold text-orange-600 uppercase tracking-wide">{meta?.org_name}</p>
            <p className="text-sm text-gray-500 mt-1">
              {questions.length - unansweredCount} of {questions.length} answered
            </p>
          </div>

          {([...new Set(questions.map(q => q.category))] as Category[]).map(cat => {
            const catQs = questions.filter(q => q.category === cat)
            return (
              <div key={cat} className="bg-white rounded-2xl shadow-sm p-5 mb-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">{CATEGORY_LABELS[cat]}</p>
                {catQs.map(q => (
                  <div key={q.key} className="mb-5 last:mb-0">
                    <p className="text-sm font-medium text-gray-800 mb-3">{q.text}</p>
                    <div className="flex gap-2">
                      {[1,2,3,4,5].map(n => (
                        <button
                          key={n}
                          onClick={() => setAnswers(p => ({ ...p, [q.key]: n }))}
                          className={`flex-1 h-10 rounded-lg text-sm font-semibold border-2 transition-all ${
                            answers[q.key] === n
                              ? n <= 2 ? 'border-red-400 bg-red-50 text-red-700'
                                : n === 3 ? 'border-yellow-400 bg-yellow-50 text-yellow-700'
                                : 'border-green-500 bg-green-50 text-green-700'
                              : 'border-gray-200 text-gray-500 hover:border-gray-300'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <div className="flex justify-between text-[10px] text-gray-400 mt-1 px-1">
                      <span>Poor</span><span>Excellent</span>
                    </div>
                  </div>
                ))}
              </div>
            )
          })}

          {/* Adaptive follow-up text questions for low-scoring categories */}
          {followUps.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Help Us Understand</p>
              {followUps.map(q => (
                <div key={q.key} className="mb-4 last:mb-0">
                  <p className="text-sm font-medium text-gray-800 mb-2">{q.text}</p>
                  <textarea
                    className="w-full border border-gray-200 rounded-lg p-3 text-sm resize-none focus:outline-none focus:border-orange-400"
                    rows={3}
                    placeholder="Optional..."
                    value={comments[q.key] ?? ''}
                    onChange={e => setComments(p => ({ ...p, [q.key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Follow-up contact preference */}
          <div className="bg-white rounded-2xl shadow-sm p-5 mb-4">
            <p className="text-sm font-medium text-gray-800 mb-3">
              Would you like someone from our team to follow up with you?
            </p>
            <div className="flex gap-3">
              {([true, false] as const).map(v => (
                <button
                  key={String(v)}
                  onClick={() => setWants(v)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold border-2 transition-all ${
                    wantsFollowup === v
                      ? 'border-orange-500 bg-orange-50 text-orange-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {v ? 'Yes please' : 'No thanks'}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!canProceed || submitting}
            className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white font-semibold rounded-xl transition-colors mb-8"
          >
            {submitting ? 'Submitting...' : 'Submit Feedback'}
          </button>
        </div>
      </div>
    )
  }

  // Thank-you stage
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <p className="text-4xl mb-4">🙏</p>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Thank you so much.</h1>
        <p className="text-gray-600 leading-relaxed">
          Your feedback has been received and goes directly to management. We take every word seriously - it helps us improve for every customer who comes after you.
        </p>
        {wantsFollowup && (
          <p className="mt-4 text-sm text-orange-600 font-medium">
            Someone from our team will be in touch with you shortly.
          </p>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add apollo-crm/app/pulse/[token]/page.tsx apollo-crm/app/pulse/[token]/SurveyClient.tsx
git commit -m "feat(pulse): add public survey page with depth selection and adaptive follow-ups"
```

---

### Task 7: Manual Survey Trigger API

**Files:**
- Create: `apollo-crm/app/api/pulse/surveys/route.ts`

POST — dealer_admin only. Creates and delivers a manual survey for any customer.

- [ ] **Step 1: Write API route**

```typescript
// app/api/pulse/surveys/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { deliverPulseSurvey } from '@/lib/pulse/deliver'
import { isDealerAdmin } from '@/lib/auth/dealerRoles'
import type { UserRole } from '@/types/index'

export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  if (!isDealerAdmin(profile.role as UserRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { customer_id } = body

  if (!customer_id) {
    return NextResponse.json({ error: 'customer_id required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Verify customer belongs to this org
  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('id', customer_id)
    .eq('user_id', profile.org_id)
    .maybeSingle()

  if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

  const result = await deliverPulseSurvey({
    orgId:       profile.org_id,
    customerId:  customer_id,
    triggerType: 'manual',
  })

  if (!result) {
    return NextResponse.json(
      { error: 'Pulse not enabled or survey already sent recently' },
      { status: 422 }
    )
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}
```

- [ ] **Step 2: Commit**

```bash
git add apollo-crm/app/api/pulse/surveys/route.ts
git commit -m "feat(pulse): add manual survey trigger API"
```

---

### Task 8: Auto-Trigger on Deal Sold

**Files:**
- Modify: `apollo-crm/app/api/bhph/create/route.ts`

Add a fire-and-forget pulse survey trigger at the end of the sale flow, identical in pattern to the existing Google review trigger.

- [ ] **Step 1: Read bhph/create route**

Read `apollo-crm/app/api/bhph/create/route.ts` fully to locate the success return statement and the existing review-request trigger pattern.

- [ ] **Step 2: Add import**

At the top of `apollo-crm/app/api/bhph/create/route.ts`, after the existing imports, add:

```typescript
import { deliverPulseSurvey } from '@/lib/pulse/deliver'
```

- [ ] **Step 3: Add trigger before the success return**

Find the block where `fetch('/api/customers/review-request', ...)` is called (fire-and-forget for Google review). Immediately after that block, add:

```typescript
  // Trigger pulse survey for the buyer (non-blocking)
  if (customer_id) {
    deliverPulseSurvey({
      orgId:       orgId,
      customerId:  customer_id,
      triggerType: 'sold',
    }).catch(() => {})
  }
```

- [ ] **Step 4: Commit**

```bash
git add apollo-crm/app/api/bhph/create/route.ts
git commit -m "feat(pulse): auto-trigger survey on deal sold"
```

---

### Task 9: Day-30 and Day-180 Cron Triggers

**Files:**
- Modify: `apollo-crm/app/api/cron/check-tasks/route.ts`

Add a section that scans `vehicles` for records where `sold_at` falls within the day-30 or day-180 window (±12 hours) and fires a survey for each buyer.

- [ ] **Step 1: Read check-tasks route**

Read `apollo-crm/app/api/cron/check-tasks/route.ts` to find the end of the main cron handler body — the last `try/catch` section before the final response.

- [ ] **Step 2: Add import**

At the top of the cron file, after existing imports, add:

```typescript
import { deliverPulseSurvey } from '@/lib/pulse/deliver'
```

- [ ] **Step 3: Add pulse trigger section**

Insert the following block inside the handler function, after all existing `try/catch` sections and before the final `return NextResponse.json(...)`:

```typescript
  // === PULSE: day-30 and day-180 follow-up surveys ===
  try {
    const { data: pulseOrgs } = await supabase
      .from('org_settings')
      .select('org_id, pulse_send_day30, pulse_send_day180')
      .eq('pulse_enabled', true)

    if (pulseOrgs && pulseOrgs.length > 0) {
      const now = new Date()

      for (const os of pulseOrgs) {
        if (os.pulse_send_day30) {
          const from30 = new Date(now.getTime() - 30.5 * 24 * 60 * 60 * 1000).toISOString()
          const to30   = new Date(now.getTime() - 29.5 * 24 * 60 * 60 * 1000).toISOString()
          const { data: vehicles30 } = await supabase
            .from('vehicles')
            .select('sold_to_customer_id')
            .eq('user_id', os.org_id)
            .eq('status', 'sold')
            .gte('sold_at', from30)
            .lte('sold_at', to30)
            .not('sold_to_customer_id', 'is', null)

          for (const v of vehicles30 ?? []) {
            if (!v.sold_to_customer_id) continue
            deliverPulseSurvey({
              orgId:       os.org_id,
              customerId:  v.sold_to_customer_id,
              triggerType: 'day30',
            }).catch(() => {})
          }
        }

        if (os.pulse_send_day180) {
          const from180 = new Date(now.getTime() - 180.5 * 24 * 60 * 60 * 1000).toISOString()
          const to180   = new Date(now.getTime() - 179.5 * 24 * 60 * 60 * 1000).toISOString()
          const { data: vehicles180 } = await supabase
            .from('vehicles')
            .select('sold_to_customer_id')
            .eq('user_id', os.org_id)
            .eq('status', 'sold')
            .gte('sold_at', from180)
            .lte('sold_at', to180)
            .not('sold_to_customer_id', 'is', null)

          for (const v of vehicles180 ?? []) {
            if (!v.sold_to_customer_id) continue
            deliverPulseSurvey({
              orgId:       os.org_id,
              customerId:  v.sold_to_customer_id,
              triggerType: 'day180',
            }).catch(() => {})
          }
        }
      }
    }
  } catch (e) {
    console.error('[cron/check-tasks] pulse triggers failed:', e)
  }
```

- [ ] **Step 4: Commit**

```bash
git add apollo-crm/app/api/cron/check-tasks/route.ts
git commit -m "feat(pulse): add day-30 and day-180 cron survey triggers"
```

---

### Task 10: Scores Aggregation API

**Files:**
- Create: `apollo-crm/app/api/pulse/scores/route.ts`

Dealer_admin/dealer_manager only. Returns overall score, per-category breakdown (worst first), and recent 20 responses. Supports `days` (default 90, max 365), `rep_id`, and `trigger_type` query params.

- [ ] **Step 1: Write API route**

```typescript
// app/api/pulse/scores/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { canManageUsers } from '@/lib/auth/dealerRoles'
import type { UserRole } from '@/types/index'
import { CATEGORY_LABELS } from '@/lib/pulse/questions'
import type { Category } from '@/lib/pulse/questions'

export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  if (!canManageUsers(profile.role as UserRole) && profile.role !== 'dealer_manager') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url         = new URL(req.url)
  const days        = Math.min(parseInt(url.searchParams.get('days') ?? '90'), 365)
  const repId       = url.searchParams.get('rep_id') ?? null
  const triggerType = url.searchParams.get('trigger_type') ?? null
  const since       = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const supabase = createServiceClient()

  let q = supabase
    .from('pulse_surveys')
    .select('id, assigned_rep_id, trigger_type, overall_score, completed_at, customer:customers(id, name)')
    .eq('org_id', profile.org_id)
    .not('completed_at', 'is', null)
    .gte('completed_at', since)
    .order('completed_at', { ascending: false })
    .limit(200)

  if (repId)       q = q.eq('assigned_rep_id', repId)
  if (triggerType) q = q.eq('trigger_type', triggerType)

  const { data: surveys } = await q
  if (!surveys) return NextResponse.json({ error: 'Failed to load' }, { status: 500 })

  if (surveys.length === 0) {
    return NextResponse.json({ overall_score: null, response_count: 0, by_category: [], recent: [] })
  }

  const { data: responses } = await supabase
    .from('pulse_responses')
    .select('survey_id, category, score')
    .in('survey_id', surveys.map(s => s.id))

  const allScores = (responses ?? []).map(r => r.score)
  const overall = allScores.length > 0
    ? Math.round((allScores.reduce((a, b) => a + b, 0) / allScores.length) * 10) / 10
    : null

  const catMap: Record<string, number[]> = {}
  for (const r of responses ?? []) {
    if (!catMap[r.category]) catMap[r.category] = []
    catMap[r.category].push(r.score)
  }

  const by_category = Object.entries(catMap).map(([cat, scores]) => ({
    category: cat as Category,
    label:    CATEGORY_LABELS[cat as Category] ?? cat,
    score:    Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
    count:    scores.length,
  })).sort((a, b) => a.score - b.score) // worst-performing first

  const recent = surveys.slice(0, 20).map(s => ({
    id:            s.id,
    overall_score: s.overall_score,
    completed_at:  s.completed_at,
    customer:      s.customer,
    trigger_type:  s.trigger_type,
  }))

  return NextResponse.json({ overall_score: overall, response_count: surveys.length, by_category, recent })
}
```

- [ ] **Step 2: Commit**

```bash
git add apollo-crm/app/api/pulse/scores/route.ts
git commit -m "feat(pulse): add scores aggregation API with category breakdown"
```

---

### Task 11: Dealer Dashboard Page

**Files:**
- Create: `apollo-crm/app/(app)/pulse/page.tsx`
- Create: `apollo-crm/app/(app)/pulse/PulseDashboard.tsx`

Dashboard at `/pulse` — overall score, category cards (worst first, color-coded), recent responses list. Period switcher (30/90/180 days).

- [ ] **Step 1: Create page shell**

```typescript
// app/(app)/pulse/page.tsx
import { requireProfile } from '@/lib/auth/profile'
import { redirect } from 'next/navigation'
import { canManageUsers } from '@/lib/auth/dealerRoles'
import type { UserRole } from '@/types/index'
import TopBar from '@/components/layout/TopBar'
import PulseDashboard from './PulseDashboard'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default async function PulsePage() {
  const profile = await requireProfile()
  if (!canManageUsers(profile.role as UserRole) && profile.role !== 'dealer_manager') {
    redirect('/today')
  }
  return (
    <div className="flex flex-col h-screen">
      <TopBar
        title="Customer Pulse"
        right={
          <div className="flex gap-1">
            <Link href="/pulse/actions">
              <Button variant="ghost" size="sm" className="text-xs h-7 px-2">Board</Button>
            </Link>
            <Link href="/pulse/team">
              <Button variant="ghost" size="sm" className="text-xs h-7 px-2">Team</Button>
            </Link>
          </div>
        }
      />
      <div className="flex-1 overflow-y-auto">
        <PulseDashboard />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create dashboard client**

```typescript
// app/(app)/pulse/PulseDashboard.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import type { Category } from '@/lib/pulse/questions'

function scoreColor(s: number | null): 'green' | 'yellow' | 'red' {
  if (s === null) return 'yellow'
  if (s >= 4.5) return 'green'
  if (s >= 3.5) return 'yellow'
  return 'red'
}

function ScoreBadge({ score }: { score: number | null }) {
  const c = scoreColor(score)
  return (
    <span className={cn(
      'text-sm font-bold px-2 py-0.5 rounded-full',
      c === 'green'  && 'bg-green-100 text-green-700',
      c === 'yellow' && 'bg-yellow-100 text-yellow-700',
      c === 'red'    && 'bg-red-100 text-red-600',
    )}>
      {score?.toFixed(1) ?? '--'}
    </span>
  )
}

interface CategoryRow { category: Category; label: string; score: number; count: number }
interface RecentItem  { id: string; overall_score: number | null; completed_at: string; customer: { id: string; name: string } | null; trigger_type: string }
interface ScoresData  { overall_score: number | null; response_count: number; by_category: CategoryRow[]; recent: RecentItem[] }

export default function PulseDashboard() {
  const [data, setData]     = useState<ScoresData | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays]     = useState(90)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/pulse/scores?days=${days}`)
    if (res.ok) setData(await res.json())
    setLoading(false)
  }, [days])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>

  return (
    <div className="px-4 py-4 space-y-5 max-w-2xl mx-auto">
      {/* Period toggle */}
      <div className="flex gap-2">
        {[30, 90, 180].map(d => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
              days === d
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:bg-accent'
            )}
          >
            {d} days
          </button>
        ))}
      </div>

      {/* Overall score */}
      <div className="bg-card rounded-xl border p-6 text-center">
        <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Overall Pulse Score</p>
        <div className={cn(
          'text-5xl font-bold mb-1',
          scoreColor(data?.overall_score ?? null) === 'green'  && 'text-green-600',
          scoreColor(data?.overall_score ?? null) === 'yellow' && 'text-yellow-600',
          scoreColor(data?.overall_score ?? null) === 'red'    && 'text-red-600',
        )}>
          {data?.overall_score?.toFixed(1) ?? '--'}
        </div>
        <p className="text-xs text-muted-foreground">
          {data?.response_count ?? 0} responses in the last {days} days
        </p>
      </div>

      {/* By category */}
      {(data?.by_category?.length ?? 0) > 0 && (
        <div className="bg-card rounded-xl border overflow-hidden">
          <p className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b">By Category</p>
          {data!.by_category.map((row, i) => (
            <div key={row.category} className={cn('flex items-center justify-between px-4 py-3', i > 0 && 'border-t')}>
              <div>
                <p className="text-sm font-medium">{row.label}</p>
                <p className="text-xs text-muted-foreground">{row.count} responses</p>
              </div>
              <ScoreBadge score={row.score} />
            </div>
          ))}
        </div>
      )}

      {/* Recent responses */}
      {(data?.recent?.length ?? 0) > 0 && (
        <div className="bg-card rounded-xl border overflow-hidden">
          <p className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b">Recent Responses</p>
          {data!.recent.map((r, i) => (
            <div key={r.id} className={cn('flex items-center justify-between px-4 py-3', i > 0 && 'border-t')}>
              <div>
                <p className="text-sm font-medium">{r.customer?.name ?? 'Unknown'}</p>
                <p className="text-xs text-muted-foreground capitalize">
                  {r.trigger_type.replace('_', '-')} &middot; {new Date(r.completed_at).toLocaleDateString()}
                </p>
              </div>
              <ScoreBadge score={r.overall_score} />
            </div>
          ))}
        </div>
      )}

      {(!data || data.response_count === 0) && (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-3xl mb-3">📊</p>
          <p className="text-sm">No survey responses yet.</p>
          <p className="text-xs mt-1">Enable Customer Pulse in Settings, then send your first survey.</p>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add apollo-crm/app/(app)/pulse/page.tsx apollo-crm/app/(app)/pulse/PulseDashboard.tsx
git commit -m "feat(pulse): add dealer dashboard at /pulse"
```

---

### Task 12: PDCA Actions API

**Files:**
- Create: `apollo-crm/app/api/pulse/actions/route.ts`
- Create: `apollo-crm/app/api/pulse/actions/[id]/route.ts`

- [ ] **Step 1: Write GET/POST route**

```typescript
// app/api/pulse/actions/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { canManageUsers } from '@/lib/auth/dealerRoles'
import type { UserRole } from '@/types/index'

const VALID_CATS = new Set(['first_contact','rep','vehicle','process','facility','post_sale'])

export async function GET() {
  const profile = await requireProfile()
  if (!canManageUsers(profile.role as UserRole) && profile.role !== 'dealer_manager') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('pulse_actions')
    .select('*, assignee:profiles!assigned_to(id, display_name)')
    .eq('org_id', profile.org_id)
    .order('created_at', { ascending: false })
    .limit(100)
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  if (!canManageUsers(profile.role as UserRole) && profile.role !== 'dealer_manager') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { category, plan_text, assigned_to, due_at, score_before } = body

  if (!VALID_CATS.has(category))  return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
  if (!plan_text?.trim())          return NextResponse.json({ error: 'plan_text required' }, { status: 400 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('pulse_actions')
    .insert({
      org_id:       profile.org_id,
      category,
      plan_text:    plan_text.trim(),
      assigned_to:  assigned_to ?? null,
      due_at:       due_at ?? null,
      score_before: score_before ?? null,
      status:       'plan',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Failed to create' }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 2: Write PATCH route**

```typescript
// app/api/pulse/actions/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { canManageUsers } from '@/lib/auth/dealerRoles'
import type { UserRole } from '@/types/index'

const VALID_STATUSES = new Set(['plan','doing','checking','standardized'])

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const profile = await requireProfile()
  if (!canManageUsers(profile.role as UserRole) && profile.role !== 'dealer_manager') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id }  = await params
  const body    = await req.json()
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body.status && VALID_STATUSES.has(body.status))  updates.status      = body.status
  if (body.score_after !== undefined)                   updates.score_after = body.score_after
  if (body.plan_text?.trim())                           updates.plan_text   = body.plan_text.trim()
  if (body.assigned_to !== undefined)                   updates.assigned_to = body.assigned_to
  if (body.due_at !== undefined)                        updates.due_at      = body.due_at

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('pulse_actions')
    .update(updates)
    .eq('id', id)
    .eq('org_id', profile.org_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 3: Commit**

```bash
git add apollo-crm/app/api/pulse/actions/route.ts apollo-crm/app/api/pulse/actions/[id]/route.ts
git commit -m "feat(pulse): add PDCA actions CRUD API"
```

---

### Task 13: PDCA Action Board Page

**Files:**
- Create: `apollo-crm/app/(app)/pulse/actions/page.tsx`
- Create: `apollo-crm/app/(app)/pulse/actions/PdcaBoard.tsx`

Four-column board (Plan / Do / Check / Act). Cards show category, description, assignee, due date. Move buttons on each card advance status.

- [ ] **Step 1: Create page**

```typescript
// app/(app)/pulse/actions/page.tsx
import { requireProfile } from '@/lib/auth/profile'
import { redirect } from 'next/navigation'
import { canManageUsers } from '@/lib/auth/dealerRoles'
import type { UserRole } from '@/types/index'
import TopBar from '@/components/layout/TopBar'
import PdcaBoard from './PdcaBoard'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

export default async function PdcaPage() {
  const profile = await requireProfile()
  if (!canManageUsers(profile.role as UserRole) && profile.role !== 'dealer_manager') {
    redirect('/today')
  }
  return (
    <div className="flex flex-col h-screen">
      <TopBar
        left={
          <Link href="/pulse" className="flex items-center gap-1 text-sm text-white/80 hover:text-white">
            <ChevronLeft className="h-4 w-4" />Pulse
          </Link>
        }
        title="Improvement Board"
      />
      <div className="flex-1 overflow-y-auto">
        <PdcaBoard />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create board client**

```typescript
// app/(app)/pulse/actions/PdcaBoard.tsx
'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { CATEGORY_LABELS } from '@/lib/pulse/questions'
import type { Category } from '@/lib/pulse/questions'

type ActionStatus = 'plan' | 'doing' | 'checking' | 'standardized'

interface PulseAction {
  id: string
  category: Category
  plan_text: string
  status: ActionStatus
  score_before: number | null
  score_after: number | null
  due_at: string | null
  assignee: { id: string; display_name: string } | null
}

const COLUMNS: { status: ActionStatus; label: string; description: string }[] = [
  { status: 'plan',         label: 'Plan', description: 'What needs to change?' },
  { status: 'doing',        label: 'Do',   description: 'Actively being worked on' },
  { status: 'checking',     label: 'Check', description: 'Monitoring for impact' },
  { status: 'standardized', label: 'Act',  description: 'Confirmed working - now standard' },
]

export default function PdcaBoard() {
  const [actions, setActions] = useState<PulseAction[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/pulse/actions')
      .then(r => r.json())
      .then(d => { setActions(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  async function moveCard(id: string, status: ActionStatus) {
    setActions(prev => prev.map(a => a.id === id ? { ...a, status } : a))
    await fetch(`/api/pulse/actions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
  }

  if (loading) return <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>

  return (
    <div className="p-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {COLUMNS.map(col => {
          const colActions = actions.filter(a => a.status === col.status)
          return (
            <div key={col.status} className="bg-muted/40 rounded-xl p-3 min-h-[200px]">
              <div className="mb-3">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{col.label}</p>
                <p className="text-[10px] text-muted-foreground">{col.description}</p>
              </div>
              <div className="space-y-2">
                {colActions.map(action => (
                  <div key={action.id} className="bg-card rounded-lg p-3 border shadow-sm">
                    <p className="text-[10px] font-semibold text-orange-600 uppercase mb-1">
                      {CATEGORY_LABELS[action.category] ?? action.category}
                    </p>
                    <p className="text-xs font-medium text-foreground mb-2 leading-snug">{action.plan_text}</p>
                    {action.assignee && (
                      <p className="text-[10px] text-muted-foreground">Assigned: {action.assignee.display_name}</p>
                    )}
                    {action.due_at && (
                      <p className="text-[10px] text-muted-foreground">Due {new Date(action.due_at).toLocaleDateString()}</p>
                    )}
                    <div className="flex flex-wrap gap-1 mt-2 pt-2 border-t">
                      {COLUMNS.filter(c => c.status !== col.status).map(c => (
                        <button
                          key={c.status}
                          onClick={() => moveCard(action.id, c.status)}
                          className="text-[10px] px-2 py-0.5 rounded border hover:bg-accent transition-colors"
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {colActions.length === 0 && (
                  <p className="text-[10px] text-muted-foreground/50 text-center py-4">Empty</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add apollo-crm/app/(app)/pulse/actions/page.tsx apollo-crm/app/(app)/pulse/actions/PdcaBoard.tsx
git commit -m "feat(pulse): add PDCA action board at /pulse/actions"
```

---

### Task 14: Per-Rep Coaching View

**Files:**
- Create: `apollo-crm/app/(app)/pulse/team/page.tsx`
- Create: `apollo-crm/app/(app)/pulse/team/TeamPulse.tsx`
- Create: `apollo-crm/app/api/pulse/team-scores/route.ts`

Manager view showing each rep's overall score and per-category breakdown. Expandable rows. 90-day rolling window.

- [ ] **Step 1: Write team-scores API**

```typescript
// app/api/pulse/team-scores/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { canManageUsers } from '@/lib/auth/dealerRoles'
import type { UserRole } from '@/types/index'
import { CATEGORY_LABELS } from '@/lib/pulse/questions'
import type { Category } from '@/lib/pulse/questions'

export async function GET(req: NextRequest) {
  const profile = await requireProfile()
  if (!canManageUsers(profile.role as UserRole) && profile.role !== 'dealer_manager') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url  = new URL(req.url)
  const days = Math.min(parseInt(url.searchParams.get('days') ?? '90'), 365)
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const supabase = createServiceClient()

  const { data: surveys } = await supabase
    .from('pulse_surveys')
    .select('id, assigned_rep_id, overall_score, rep:profiles!assigned_rep_id(id, display_name)')
    .eq('org_id', profile.org_id)
    .not('completed_at', 'is', null)
    .not('assigned_rep_id', 'is', null)
    .gte('completed_at', since)

  if (!surveys || surveys.length === 0) return NextResponse.json([])

  const { data: responses } = await supabase
    .from('pulse_responses')
    .select('survey_id, category, score')
    .in('survey_id', surveys.map(s => s.id))

  // Group data by rep
  const repMap = new Map<string, { name: string; overallScores: number[]; catScores: Record<string, number[]> }>()
  for (const s of surveys) {
    const rep = s.rep as { id: string; display_name: string } | null
    if (!rep || !s.assigned_rep_id) continue
    if (!repMap.has(s.assigned_rep_id)) {
      repMap.set(s.assigned_rep_id, { name: rep.display_name, overallScores: [], catScores: {} })
    }
    const entry = repMap.get(s.assigned_rep_id)!
    if (s.overall_score !== null) entry.overallScores.push(s.overall_score as number)
  }
  for (const r of responses ?? []) {
    const survey = surveys.find(s => s.id === r.survey_id)
    if (!survey?.assigned_rep_id) continue
    const entry = repMap.get(survey.assigned_rep_id)
    if (!entry) continue
    if (!entry.catScores[r.category]) entry.catScores[r.category] = []
    entry.catScores[r.category].push(r.score)
  }

  const result = Array.from(repMap.entries()).map(([repId, { name, overallScores, catScores }]) => ({
    rep_id:         repId,
    name,
    overall_score:  overallScores.length > 0
      ? Math.round((overallScores.reduce((a, b) => a + b, 0) / overallScores.length) * 10) / 10
      : null,
    response_count: overallScores.length,
    by_category:    Object.entries(catScores).map(([cat, scores]) => ({
      category: cat as Category,
      label:    CATEGORY_LABELS[cat as Category] ?? cat,
      score:    Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
    })),
  })).sort((a, b) => (b.overall_score ?? 0) - (a.overall_score ?? 0))

  return NextResponse.json(result)
}
```

- [ ] **Step 2: Create page**

```typescript
// app/(app)/pulse/team/page.tsx
import { requireProfile } from '@/lib/auth/profile'
import { redirect } from 'next/navigation'
import { canManageUsers } from '@/lib/auth/dealerRoles'
import type { UserRole } from '@/types/index'
import TopBar from '@/components/layout/TopBar'
import TeamPulse from './TeamPulse'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

export default async function TeamPulsePage() {
  const profile = await requireProfile()
  if (!canManageUsers(profile.role as UserRole) && profile.role !== 'dealer_manager') {
    redirect('/today')
  }
  return (
    <div className="flex flex-col h-screen">
      <TopBar
        left={
          <Link href="/pulse" className="flex items-center gap-1 text-sm text-white/80 hover:text-white">
            <ChevronLeft className="h-4 w-4" />Pulse
          </Link>
        }
        title="Team Scores"
      />
      <div className="flex-1 overflow-y-auto">
        <TeamPulse />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create TeamPulse client**

```typescript
// app/(app)/pulse/team/TeamPulse.tsx
'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface RepScore {
  rep_id: string
  name: string
  overall_score: number | null
  response_count: number
  by_category: { category: string; label: string; score: number }[]
}

function scoreColor(s: number | null) {
  if (s === null) return 'text-muted-foreground'
  if (s >= 4.5) return 'text-green-600'
  if (s >= 3.5) return 'text-yellow-600'
  return 'text-red-600'
}

export default function TeamPulse() {
  const [reps, setReps]         = useState<RepScore[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    fetch('/api/pulse/team-scores?days=90')
      .then(r => r.json())
      .then(d => { setReps(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>

  if (reps.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-3xl mb-3">👥</p>
        <p className="text-sm">No team scores yet.</p>
        <p className="text-xs mt-1">Scores appear here once surveys are completed.</p>
      </div>
    )
  }

  return (
    <div className="px-4 py-4 space-y-3 max-w-lg mx-auto">
      {reps.map(rep => (
        <div key={rep.rep_id} className="bg-card rounded-xl border overflow-hidden">
          <button
            className="w-full flex items-center justify-between p-4 hover:bg-accent/50 transition-colors"
            onClick={() => setExpanded(e => e === rep.rep_id ? null : rep.rep_id)}
          >
            <div className="text-left">
              <p className="text-sm font-semibold">{rep.name}</p>
              <p className="text-xs text-muted-foreground">{rep.response_count} surveys</p>
            </div>
            <span className={cn('text-2xl font-bold', scoreColor(rep.overall_score))}>
              {rep.overall_score?.toFixed(1) ?? '--'}
            </span>
          </button>
          {expanded === rep.rep_id && (
            <div className="border-t px-4 py-3 space-y-2">
              {rep.by_category.map(c => (
                <div key={c.category} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{c.label}</span>
                  <span className={cn('font-semibold', scoreColor(c.score))}>{c.score.toFixed(1)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add apollo-crm/app/(app)/pulse/team/ apollo-crm/app/api/pulse/team-scores/route.ts
git commit -m "feat(pulse): add per-rep coaching view at /pulse/team"
```

---

### Task 15: Today Page Pulse Widget (Per-Rep)

**Files:**
- Create: `apollo-crm/components/today/PulseScoreWidget.tsx`
- Create: `apollo-crm/app/api/pulse/rep-feedback/route.ts`
- Modify: `apollo-crm/app/(app)/today/page.tsx`

Reps see their own rolling 90-day Pulse Score as a tappable badge. Tapping opens a bottom sheet with their anonymous feedback (no customer names). Only rendered when `profile.pulse_score` is not null.

- [ ] **Step 1: Create rep-feedback API**

```typescript
// app/api/pulse/rep-feedback/route.ts
// Returns the calling rep's own anonymous feedback (no customer names)
import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { CATEGORY_LABELS } from '@/lib/pulse/questions'
import type { Category } from '@/lib/pulse/questions'

export async function GET() {
  const profile  = await requireProfile()
  const supabase = createServiceClient()
  const since    = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()

  const { data: surveys } = await supabase
    .from('pulse_surveys')
    .select('id, overall_score, completed_at')
    .eq('org_id', profile.org_id)
    .eq('assigned_rep_id', profile.id)
    .not('completed_at', 'is', null)
    .gte('completed_at', since)
    .order('completed_at', { ascending: false })
    .limit(20)

  if (!surveys || surveys.length === 0) return NextResponse.json([])

  const { data: responses } = await supabase
    .from('pulse_responses')
    .select('survey_id, category, score')
    .in('survey_id', surveys.map(s => s.id))

  const result = surveys.map(s => {
    const sResponses = (responses ?? []).filter(r => r.survey_id === s.id)
    const catMap: Record<string, number[]> = {}
    for (const r of sResponses) {
      if (!catMap[r.category]) catMap[r.category] = []
      catMap[r.category].push(r.score)
    }
    const by_category = Object.entries(catMap).map(([cat, scores]) => ({
      category: cat as Category,
      label:    CATEGORY_LABELS[cat as Category] ?? cat,
      score:    Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
    }))
    return { overall_score: s.overall_score, completed_at: s.completed_at, by_category }
  })

  return NextResponse.json(result)
}
```

- [ ] **Step 2: Create PulseScoreWidget component**

```typescript
// components/today/PulseScoreWidget.tsx
'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

interface AnonFeedback {
  overall_score: number | null
  completed_at: string
  by_category: { category: string; label: string; score: number }[]
}

interface Props {
  pulseScore: number
}

function scoreColor(s: number) {
  if (s >= 4.5) return 'text-green-600 bg-green-50 border-green-200'
  if (s >= 3.5) return 'text-yellow-600 bg-yellow-50 border-yellow-200'
  return 'text-red-600 bg-red-50 border-red-200'
}

export default function PulseScoreWidget({ pulseScore }: Props) {
  const [open, setOpen]       = useState(false)
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState<AnonFeedback[]>([])

  async function handleOpen() {
    setOpen(true)
    if (feedback.length > 0) return
    setLoading(true)
    const res = await fetch('/api/pulse/rep-feedback')
    if (res.ok) setFeedback(await res.json())
    setLoading(false)
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-semibold transition-colors hover:opacity-80',
          scoreColor(pulseScore)
        )}
      >
        <span>My Pulse</span>
        <span className="text-lg font-bold">{pulseScore.toFixed(1)}</span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-[70vh]">
          <SheetHeader className="mb-2">
            <SheetTitle>My Feedback - Last 90 Days</SheetTitle>
          </SheetHeader>
          <p className="text-xs text-muted-foreground mb-4">
            Customer names are never shown. All feedback here is anonymous.
          </p>
          {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
          {!loading && feedback.length === 0 && (
            <p className="text-sm text-muted-foreground">No completed surveys yet.</p>
          )}
          <div className="space-y-3 overflow-y-auto max-h-[calc(70vh-120px)] pb-4">
            {feedback.map((f, i) => (
              <div key={i} className="bg-card rounded-xl border p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs text-muted-foreground">{new Date(f.completed_at).toLocaleDateString()}</p>
                  <span className={cn(
                    'text-sm font-bold px-2 py-0.5 rounded-full',
                    (f.overall_score ?? 0) >= 4.5 ? 'bg-green-100 text-green-700'
                    : (f.overall_score ?? 0) >= 3.5 ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-red-100 text-red-600'
                  )}>
                    {f.overall_score?.toFixed(1) ?? '--'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  {f.by_category.map(c => (
                    <div key={c.category} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{c.label}</span>
                      <span className="font-medium">{c.score.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
```

- [ ] **Step 3: Add widget to Today page**

In `apollo-crm/app/(app)/today/page.tsx`, add the import near the top with other imports:

```typescript
import PulseScoreWidget from '@/components/today/PulseScoreWidget'
```

Then find the JSX return block and add the widget after `<TopBar ...>` and before `<TodayContent ...>`:

```typescript
{typeof profile.pulse_score === 'number' && profile.pulse_score !== null && (
  <div className="px-4 pt-3">
    <PulseScoreWidget pulseScore={profile.pulse_score} />
  </div>
)}
```

- [ ] **Step 4: Commit**

```bash
git add apollo-crm/components/today/PulseScoreWidget.tsx apollo-crm/app/api/pulse/rep-feedback/route.ts apollo-crm/app/(app)/today/page.tsx
git commit -m "feat(pulse): add per-rep anonymous score widget to Today page"
```

---

### Task 16: Settings Entry + Nav Links

**Files:**
- Create: `apollo-crm/app/(app)/settings/pulse/page.tsx`
- Create: `apollo-crm/app/(app)/settings/pulse/PulseSettingsClient.tsx`
- Create: `apollo-crm/app/api/settings/pulse/route.ts`
- Modify: `apollo-crm/app/(app)/settings/page.tsx`
- Modify: `apollo-crm/components/layout/DesktopSidebar.tsx`

- [ ] **Step 1: Create pulse settings API route**

```typescript
// app/api/settings/pulse/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createServiceClient } from '@/lib/supabase/service'
import { canManageUsers } from '@/lib/auth/dealerRoles'
import type { UserRole } from '@/types/index'

export async function GET() {
  const profile  = await requireProfile()
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('org_settings')
    .select('pulse_enabled, pulse_auto_send_on_sold, pulse_send_day30, pulse_send_day180')
    .eq('org_id', profile.org_id)
    .maybeSingle()
  return NextResponse.json(data ?? {
    pulse_enabled: false, pulse_auto_send_on_sold: true,
    pulse_send_day30: true, pulse_send_day180: false,
  })
}

export async function PUT(req: NextRequest) {
  const profile = await requireProfile()
  if (!canManageUsers(profile.role as UserRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const update: Record<string, unknown> = {}
  if (typeof body.pulse_enabled           === 'boolean') update.pulse_enabled           = body.pulse_enabled
  if (typeof body.pulse_auto_send_on_sold === 'boolean') update.pulse_auto_send_on_sold = body.pulse_auto_send_on_sold
  if (typeof body.pulse_send_day30        === 'boolean') update.pulse_send_day30        = body.pulse_send_day30
  if (typeof body.pulse_send_day180       === 'boolean') update.pulse_send_day180       = body.pulse_send_day180

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('org_settings')
    .update(update)
    .eq('org_id', profile.org_id)

  if (error) return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Create settings page + client**

```typescript
// app/(app)/settings/pulse/page.tsx
import { requireProfile } from '@/lib/auth/profile'
import { redirect } from 'next/navigation'
import { canManageUsers } from '@/lib/auth/dealerRoles'
import type { UserRole } from '@/types/index'
import TopBar from '@/components/layout/TopBar'
import PulseSettingsClient from './PulseSettingsClient'

export default async function PulseSettingsPage() {
  const profile = await requireProfile()
  if (!canManageUsers(profile.role as UserRole)) redirect('/settings')
  return (
    <div>
      <TopBar title="Customer Pulse" />
      <PulseSettingsClient />
    </div>
  )
}
```

```typescript
// app/(app)/settings/pulse/PulseSettingsClient.tsx
'use client'

import { useState, useEffect } from 'react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

interface PulseSettings {
  pulse_enabled: boolean
  pulse_auto_send_on_sold: boolean
  pulse_send_day30: boolean
  pulse_send_day180: boolean
}

export default function PulseSettingsClient() {
  const [settings, setSettings] = useState<PulseSettings>({
    pulse_enabled: false, pulse_auto_send_on_sold: true,
    pulse_send_day30: true, pulse_send_day180: false,
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)

  useEffect(() => {
    fetch('/api/settings/pulse')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setSettings(d) })
  }, [])

  async function save() {
    setSaving(true)
    const res = await fetch('/api/settings/pulse', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
    setSaving(false)
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000) }
  }

  return (
    <div className="px-4 py-6 space-y-6 max-w-lg">
      <div className="bg-card rounded-xl border p-5 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm font-medium">Enable Customer Pulse</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Send satisfaction surveys after every sale and track your scores
            </p>
          </div>
          <Switch
            checked={settings.pulse_enabled}
            onCheckedChange={v => setSettings(p => ({ ...p, pulse_enabled: v }))}
          />
        </div>

        {settings.pulse_enabled && (
          <div className="border-t pt-4 space-y-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Auto-Send Triggers</p>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">On sale (immediately)</Label>
                <p className="text-xs text-muted-foreground">Survey sent when you mark a vehicle sold</p>
              </div>
              <Switch
                checked={settings.pulse_auto_send_on_sold}
                onCheckedChange={v => setSettings(p => ({ ...p, pulse_auto_send_on_sold: v }))}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">30-day follow-up</Label>
                <p className="text-xs text-muted-foreground">Second survey 30 days after the sale</p>
              </div>
              <Switch
                checked={settings.pulse_send_day30}
                onCheckedChange={v => setSettings(p => ({ ...p, pulse_send_day30: v }))}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">6-month follow-up</Label>
                <p className="text-xs text-muted-foreground">Third survey 6 months after the sale</p>
              </div>
              <Switch
                checked={settings.pulse_send_day180}
                onCheckedChange={v => setSettings(p => ({ ...p, pulse_send_day180: v }))}
              />
            </div>
          </div>
        )}
      </div>

      <Button onClick={save} disabled={saving}>
        {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Settings'}
      </Button>
    </div>
  )
}
```

- [ ] **Step 3: Add Pulse entry to settings/page.tsx**

In `apollo-crm/app/(app)/settings/page.tsx`:

1. Add `Heart` to the lucide-react import on line 5.

2. In the Communication section (the `<div>` containing the Google Reviews `<Link>`), add after the Google Reviews block:

```typescript
<Link href="/settings/pulse">
  <div className="flex items-center justify-between p-4 border-t border-border hover:bg-accent transition-colors">
    <div className="flex items-center gap-3">
      <Heart className="h-5 w-5 text-primary" />
      <div>
        <p className="font-medium text-sm">Customer Pulse</p>
        <p className="text-xs text-muted-foreground mt-0.5">Send post-sale satisfaction surveys and track your team scores</p>
      </div>
    </div>
    <ChevronRight className="h-4 w-4 text-muted-foreground" />
  </div>
</Link>
```

- [ ] **Step 4: Add Pulse to DesktopSidebar**

In `apollo-crm/components/layout/DesktopSidebar.tsx`:

1. Add `Heart` to the lucide-react import (line 8-15).

2. In `ROLE_NAV` (line 50-57), add after the Analytics entry:

```typescript
{ href: '/pulse', label: 'Pulse', icon: Heart, requiresRole: (r: string) => ['dealer_admin', 'dealer_manager', 'admin'].includes(r) },
```

- [ ] **Step 5: Commit**

```bash
git add apollo-crm/app/(app)/settings/pulse/ apollo-crm/app/api/settings/pulse/route.ts apollo-crm/app/(app)/settings/page.tsx apollo-crm/components/layout/DesktopSidebar.tsx
git commit -m "feat(pulse): add settings UI, API, and nav links for Customer Pulse"
```

---

## Self-Review: Spec Coverage

| Spec Requirement | Task |
|---|---|
| Token-based public URL `/pulse/[token]` | Task 4, 6 |
| No auth required on survey page | Task 6 (outside `(app)`) |
| Token expires in 30 days | Task 1 migration default |
| Customer chooses depth (Quick/Standard/Full) | Task 6 welcome stage |
| 6 survey categories | Task 2 questions |
| Adaptive follow-up for scores <= 3 | Task 6 questions stage |
| Thank-you closing screen | Task 6 thank-you stage |
| Follow-up contact preference | Task 6 questions stage |
| Survey via SMS | Task 3 deliver.ts |
| Auto-trigger on deal sold | Task 8 (bhph/create) |
| Post-sale 30-day trigger | Task 9 (cron) |
| Post-sale 180-day trigger | Task 9 (cron) |
| Manual dealer trigger | Task 7 |
| Dedup guard (no double surveys) | Task 3 deliver.ts |
| Overall score computed from responses | Task 5 respond API |
| Follow-up request creates priority task | Task 5 respond API |
| Low score (<=2) creates admin_alert | Task 5 respond API |
| Rep pulse_score updated on profiles | Task 5 respond API |
| Dealer dashboard at `/pulse` | Task 11 |
| Score by category | Tasks 10, 11 |
| Recent responses list | Tasks 10, 11 |
| Routing restricted to admin/manager | Tasks 10, 11, 12, 13, 14 |
| PDCA action board at `/pulse/actions` | Tasks 12, 13 |
| PDCA status transitions (Plan/Do/Check/Act) | Task 12 PATCH API, Task 13 board |
| Per-rep coaching view at `/pulse/team` | Task 14 |
| Today page rep score widget | Task 15 |
| Rep sees only own anonymous feedback | Task 15 rep-feedback API |
| Color-coded score (green/yellow/red) | Tasks 11, 14, 15 |
| Settings enable/disable + configure triggers | Task 16 |
| Nav link to `/pulse` | Task 16 |
| pulse_surveys / pulse_responses / pulse_actions tables | Task 1 |
| org_settings pulse columns | Task 1 |
| profiles pulse_score columns | Task 1 |

All spec requirements covered across 16 tasks.
