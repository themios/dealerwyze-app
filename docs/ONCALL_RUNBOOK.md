# OnCall Runbook

Emergency procedures for production incidents affecting DealerWyze and RealtyWyze.

## Incident Response Escalation

**On-call rotation:** Tim (owner-operator)  
**Escalation:** Contact support@dealerwyze.com or call [PHONE]  
**Incident channel:** Telegram (PLATFORM_OWNER_TELEGRAM_ID)

---

## Twilio Outage

**Symptom:** SMS, voice calls, or Twilio webhooks failing.

### Immediate Actions
1. **Check Twilio status:** https://status.twilio.com
2. **Verify auth:** Log in to Twilio console, check API keys and webhooks are live
3. **Check logs:** Review `app/api/twilio/*` endpoint logs in Vercel for auth failures or timeout patterns

### If Outage Confirmed
1. **Notify users:** Post status update in app dashboard (if UI is live)
2. **Route calls manually:** If inbound routing fails, provide dealers fallback phone number
3. **Pause sequences:** Disable SMS-dependent sequences in the UI to prevent queue buildup
4. **Monitor recovery:** Twilio typically recovers within 1–4 hours. Check status page every 15 min

### Recovery Checklist
- [ ] Twilio status page shows "All Systems Operational"
- [ ] Test SMS send via `/lib/twilio/send.ts` to verify auth + routing
- [ ] Test inbound webhook with test call / SMS to verify payload delivery
- [ ] Re-enable sequences in UI
- [ ] Notify affected dealers (bounce-back email or in-app alert)

### Escalation
If outage > 2 hours and no ETA from Twilio, contact Twilio support (premium account). Provide:
- Affected account SID
- Timestamp of first failure
- Webhook endpoint (https://dealerwyze.com/api/twilio/...)
- Error logs from Vercel

---

## Supabase (Database / Auth / Storage) Outage

**Symptom:** Login fails, database queries timeout, file uploads fail, or Supabase dashboard unreachable.

### Immediate Actions
1. **Check Supabase status:** https://status.supabase.com
2. **Verify connectivity:** Run health check endpoint (if one exists) or test a simple SELECT in Vercel logs
3. **Check credentials:** Verify `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY` are current in `.env.production`

### If Outage Confirmed
1. **Assess scope:** Is it auth only, database only, or entire region?
   - Auth failure → users cannot log in; existing sessions remain valid
   - Database failure → app cannot load data; redirects to error page
   - All → entire app is down
2. **Notify:** Post status on landing page if CDN is unaffected
3. **Customer comms:** Send email to dealers: "We're investigating a service interruption. ETA [TIME]."

### Recovery Checklist
- [ ] Supabase status shows "All Systems Operational"
- [ ] Test login with a test dealer account
- [ ] Verify RLS policies are still enforced (spot-check with curl to API)
- [ ] Test file upload / storage access
- [ ] Rerun migration 202 (company emails) to confirm schema is intact
- [ ] Verify cron jobs are running (check `audit_log` for recent entries)

### Escalation
If outage > 1 hour:
1. Log in to Supabase console and check **Infrastructure** tab for region status
2. If region is degraded, scale up connection pool if available
3. Contact Supabase support (Premium tier) with:
   - Organization ID
   - Project ID
   - Timestamp + error patterns from logs

---

## Stripe (Payments / Billing) Outage

**Symptom:** Payment processing fails, billing webhooks don't fire, or Stripe dashboard is down.

### Immediate Actions
1. **Check Stripe status:** https://status.stripe.com
2. **Verify webhook delivery:** Log in to Stripe dashboard → Developers → Webhooks. Check recent events for failures
3. **Check webhook signing:** Verify `STRIPE_WEBHOOK_SECRET` in `lib/stripe/webhook.ts` matches Stripe dashboard

### If Outage Confirmed
1. **New subscriptions:** Disable checkout UI or show status banner warning
2. **Existing payments:** If processing is down but auth is up, pause new payment attempts to avoid failed charges
3. **Notify dealers:** Email + SMS (via Twilio, if live) explaining billing is temporarily unavailable

### Recovery Checklist
- [ ] Stripe status shows "All Systems Operational"
- [ ] Test webhook delivery: trigger test event in Stripe → verify webhook received in logs
- [ ] Test payment creation: attempt a test subscription in sandbox (if available)
- [ ] Reconcile failed payments: Query `stripe_invoice` / `stripe_subscription` logs for failures during outage window
- [ ] Reprocess failed charges: Either retry automatically (Stripe will auto-retry within 3 days) or contact customers

### Escalation
If outage > 30 minutes:
1. Check Stripe status for any announced degradation
2. Contact Stripe support (live chat in Stripe dashboard, Premium tier)
3. Provide:
   - Account ID (API key prefix)
   - Affected endpoint (e.g., POST /v1/checkout/sessions)
   - Timestamp of first failure

---

## Retell AI (Voice Agent) Outage

**Symptom:** Inbound calls fail, callers hear disconnect, or agent responds incorrectly.

### Immediate Actions
1. **Check Retell status:** Contact Retell support (no public status page)
2. **Verify webhook:** Check `app/api/retell/webhook` logs for delivery failures
3. **Check agent config:** Verify `RETELL_AGENT_ID` in `.env.production` matches Retell dashboard

### If Outage Confirmed
1. **Divert calls:** Update Twilio routing to forward to dealer's fallback number (set in org_settings.fallback_phone_number)
2. **Notify dealers:** Send alert: "Voice agent temporarily unavailable. Calls forwarding to your fallback number."

### Recovery Checklist
- [ ] Retell dashboard shows agents are active
- [ ] Test inbound call to Retell webhook endpoint
- [ ] Verify agent responds with expected greeting
- [ ] Test fallback routing in Twilio (if engaged)

### Escalation
Contact Retell support:
- Agent ID
- Timestamp of first failure
- Example call SID (from Twilio logs)

---

## Vercel Deployment Failure

**Symptom:** Deploy fails, production URL is unreachable, or build is stuck.

### Immediate Actions
1. **Check Vercel dashboard:** https://vercel.com/dashboard
2. **Check build logs:** Project → Deployments → Latest → Details (scroll to see error)
3. **Common causes:**
   - Type errors in TypeScript
   - Missing environment variable
   - Third-party API timeout during build
   - Post-deploy checks failed

### Recovery Checklist
- [ ] Fix error (e.g., commit TypeScript fix, add missing env var)
- [ ] Re-deploy: Either git push to main or click "Redeploy" in Vercel UI
- [ ] Wait for build to complete (~2–5 min)
- [ ] Test landing page, login, and a dealership page

### If Manual Rollback Needed
1. **Vercel UI:** Project → Deployments → Previous working version → Click "Promote to Production"
2. **Notify:** Brief message to dealers: "We've rolled back a deployment. Everything should be back to normal now."

---

## Upstash Redis Outage

**Symptom:** Rate limiting stops working, caching is unavailable, or Redis commands time out.

### Immediate Actions
1. **Check Upstash status:** https://status.upstash.com
2. **Verify connection:** Check `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in `.env.production`

### If Outage Confirmed
1. **Rate limiting disabled:** Requests will not be rate-limited until Redis recovers. Monitor for abuse.
2. **Caching disabled:** Queries run without cache; database load may spike.

### Recovery Checklist
- [ ] Upstash status shows "All Systems Operational"
- [ ] Test rate limit: Make rapid requests, verify 429 response
- [ ] Monitor database query logs for anomalies (unusually high volume indicates cache miss spike)

---

## Multi-System Cascade Failure

**If multiple systems are failing simultaneously (Supabase + Twilio, etc.):**

1. **Isolate:** Determine which system went down first (check status pages for timestamps)
2. **Primary focus:** Fix the root cause system first (usually database or auth)
3. **Cascade recovery:** Dependent systems should recover automatically once primary is up
4. **Verify:** Test each system in order (auth → DB → Stripe → Twilio → Retell)
5. **Notify:** One consolidated message to dealers: "We experienced a service outage affecting [systems]. All systems are now recovered."

---

## Post-Incident

1. **Log incident:** Record timestamp, affected systems, duration, root cause, and resolution
2. **Alert owners:** Send summary email to platform@dealerwyze.com
3. **Review:** Within 24 hours, identify prevention (e.g., better monitoring, circuit breaker)
4. **Communicate:** If customer impact, follow BREACH_NOTIFICATION.md procedures for transparency

---

## OnCall Contact

- **Tim (owner-operator):** contact via Telegram, email support@dealerwyze.com
- **Escalation:** If unresolved > 1 hour, page on-call engineer (TBD)
- **Status page:** https://dealerwyze.statuspage.io (if configured)
