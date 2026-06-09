# Apollo CRM — Feature Status

## Roadmap Document
Full detailed plan with checkboxes: `/home/tim/Applications/Wyze/wyze-app/ROADMAP.md`

## Built & Live (as of 2026-02-28)
- Core CRM (customers, vehicles, activities, templates)
- CarGurus lead ingestion via Gmail IMAP
- Lead follow-up sequence (Day 1–5)
- Twilio outbound SMS + inbound webhook `/api/twilio/inbound`
- Dealer Brief (Groq AI, daily cached)
- BHPH tracking + payment reminders
- To-Do task system
- Receipt-to-Ledger (Anthropic Haiku Vision OCR)
- Stripe billing + SMS add-on
- Performance goals (dealer_goals table)
- Voice Agent (Retell AI, $0.11/min all-in)
- Post-call AI extraction (Anthropic Haiku from transcript)
- Google Calendar appointment creation
- VoiceLeadCard on Today screen
- Billing cycle reset cron
- Voice usage meter on billing page
- Voice settings in organization page
- Appointment activity → app calendar
- Confirmation SMS after voice call (pending 10DLC)
- Admin org list page (read-only)

## Pending External
- Twilio 10DLC approval (blocks confirmation SMS)
- Retell agent prompt needs refinement

## Next Build Queue (in order)
1. Phase 1A: TCPA opt-out (legal)
2. Phase 1B: Appointment reminder SMS
3. Phase 1C: Duplicate customer detection
4. Phase 2: Security (RLS + remove hardcoded APOLLO_USER_ID)
5. Phase 3: True SaaS multi-tenancy
6. Phase 4: Admin panel (full management)
7. Phase 5: Dealer onboarding wizard
8. Phase 6: Growth features
