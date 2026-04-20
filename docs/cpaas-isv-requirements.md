# DealerWyze — CPaaS ISV/Platform Requirements
*Use this doc when speaking with Telnyx, Plivo, or any CPaaS provider*

---

## What We Are
DealerWyze is a SaaS CRM platform for independent used-car dealerships in the US.
We provision a phone number for each dealer tenant on signup. Dealers never manage
their own CPaaS account — all messaging runs through our platform.

- **Launch target:** Q2 2026
- **Initial dealers at launch:** ~5-10
- **12-month target:** ~50-100 dealers
- **Messages per dealer per month:** ~500-2,000 (transactional only)

---

## Message Types (all transactional, no marketing)
- Lead inquiry responses (customer texted the dealer first)
- Appointment confirmations and reminders
- Vehicle availability updates
- BHPH payment reminders (existing customers only)
- Inbound SMS replies from customers

---

## Questions to Ask

### 1. ISV / Platform Program
- Do you have a formal ISV or reseller program for SaaS platforms?
- Is there a monthly platform/ISV fee on top of usage?
- Can we provision numbers via API for each dealer tenant automatically?
- Do dealer numbers operate as sub-accounts under our master account?

### 2. A2P Compliance
- Do you register DealerWyze as the CSP (Campaign Service Provider) with TCR?
- How long does initial CSP + campaign approval take?
- Once our campaign is approved, how fast can new dealer numbers go live?
- Do you assist with campaign registration or is it self-serve?
- What happens if a dealer number gets flagged — do we get notified?

### 3. Pricing
- Per-SMS rate (outbound and inbound) at 10K, 50K, 100K messages/month
- Per-MMS rate
- Monthly number rental per local number
- Number provisioning fee (one-time per number)
- TCR fees: are brand registration, campaign registration, and per-message
  carrier surcharges passed through at cost or marked up?
- Any platform/ISV monthly minimum commitment?

### 4. Technical
- Is your API Twilio-compatible (same endpoints, same request format)?
- Do you support webhook callbacks for inbound SMS (equivalent to Twilio's
  StatusCallback and inbound webhook)?
- Do you support toll-free numbers in addition to local 10DLC?
- What's your SLA for API uptime?
- Do you have a sandbox/test environment?

### 5. Support
- What support tier is included for ISV partners?
- Do ISV partners get a dedicated account manager?
- What is your average response time for compliance/registration issues?

---

## Our Current Setup (for context)
- Currently on Twilio with a toll-free number pending verification (Error 30513)
- Existing codebase uses Twilio REST API (Messages.json endpoint)
- We handle inbound SMS via webhook
- We need number provisioning to be API-driven so new dealers go live same-day

---

## Decision Criteria
1. Time from dealer signup to active SMS number (must be same-day after initial approval)
2. Total cost per dealer per month at ~1,000 messages
3. Quality of compliance support during ISV onboarding
4. API compatibility with our existing Twilio-based code
