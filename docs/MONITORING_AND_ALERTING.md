# Monitoring & Alerting

Production monitoring stack for DealerWyze and RealtyWyze.

---

## Error Tracking (Sentry)

### Configuration

**Server-side errors** are automatically captured and sent to Sentry via `sentry.server.config.ts`:

```typescript
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  beforeSend(event) {
    // Redact sensitive data: request body, cookies, auth headers
    // Whitelist only safe headers: content-type, x-forwarded-for, user-agent, x-pathname
  }
})
```

**Client-side errors** are captured by `sentry.edge.config.ts` (edge/middleware layer).

### Environment Variables

Required in `.env.production`:

```
NEXT_PUBLIC_SENTRY_DSN=https://[key]@sentry.io/[project-id]
```

### What Gets Captured

✅ **Captured:**
- Unhandled exceptions (server and client)
- API route errors (5xx, timeouts)
- Promise rejections
- React error boundaries
- Stripe webhook failures
- Twilio integration errors
- Database query timeouts

❌ **Redacted (security):**
- Request body (POST data, form inputs)
- Cookies (session, auth tokens)
- Authorization headers
- API keys

### Sentry Dashboard

**URL:** https://sentry.io/

**Projects:**
- `dealerwyze` — DealerWyze production errors
- `dealerwyze-staging` — Staging errors (optional)
- `realtywyze` — RealtyWyze production errors

**Access:** Tim only (owner account)

---

## Slack Integration (Alerts)

### Setup: Sentry → Slack

1. **Create Slack workspace token:**
   - Go to Slack workspace → Settings & administration → Manage apps
   - Create new app: "Sentry Alerts"
   - Scope: `chat:write`, `files:read`
   - Copy OAuth token: `xoxb-...`

2. **Configure Sentry Slack Integration:**
   - Sentry dashboard → Project → Integrations → Slack
   - Click "Install"
   - Authorize Sentry to access Slack workspace
   - Create channel: `#sentry-alerts`
   - Configure alert rules (see below)

3. **Alert Rules:**

   **Rule 1: Critical Errors (Immediate)**
   - Trigger: Error rate > 5% in 5 minutes
   - Action: Post to `#sentry-alerts` with @channel mention
   - Message: "🚨 Critical error spike detected: {error_count} errors in {time_window}"

   **Rule 2: Database Errors (High Priority)**
   - Trigger: Message contains "database" OR "query timeout"
   - Action: Post to `#sentry-alerts` with mention
   - Message: "⚠️ Database error: {message}"

   **Rule 3: Payment Failures (High Priority)**
   - Trigger: Event tags include `event_type:stripe_webhook_failure`
   - Action: Post to `#sentry-alerts`
   - Message: "💳 Stripe webhook failure: {message}"

   **Rule 4: Twilio Errors (Medium)**
   - Trigger: Event tags include `event_type:twilio_error`
   - Action: Post to `#sentry-alerts`
   - Message: "📱 Twilio error: {message}"

   **Rule 5: New Errors (Low)**
   - Trigger: First occurrence of new error
   - Action: Post to `#sentry-monitoring` (off by default during onboarding)
   - Message: "New error: {message}"

### Alert Thresholds

| Event Type | Alert Level | Slack Channel | Response Time |
|-----------|------------|---------------|----------------|
| Critical error spike (>5% rate) | P0 | #sentry-alerts | 5 min |
| Database timeout | P1 | #sentry-alerts | 15 min |
| Payment/Stripe failure | P1 | #sentry-alerts | 15 min |
| Twilio integration error | P2 | #sentry-alerts | 1 hour |
| New error type (first occurrence) | P3 | #sentry-monitoring | 4 hours |

### Manual Alert (Slack Webhook)

For critical outages not captured by Sentry:

```bash
curl -X POST -H 'Content-type: application/json' \
  --data '{"text":"🚨 CRITICAL: Payment processing down"}' \
  "$SLACK_WEBHOOK_URL"
```

Store `SLACK_WEBHOOK_URL` in `.env.production` (secret).

---

## Performance Monitoring

### Core Web Vitals (CWV)

Monitored via Sentry + built-in Next.js Web Vitals integration.

**Metrics:**
- **LCP (Largest Contentful Paint):** < 2.5 seconds
- **FID (First Input Delay):** < 100 milliseconds
- **CLS (Cumulative Layout Shift):** < 0.1

**Tracking:**
1. Sentry captures Web Vitals automatically via `@sentry/nextjs`
2. Dashboard shows trends: Sentry → Performance → Web Vitals
3. Alerts trigger if LCP > 4s or CLS > 0.25

### Checking Performance

**Sentry Dashboard:**
- Project → Performance → Web Vitals tab
- Filter by environment (production, staging)
- View p75, p95, p99 latencies

**Lighthouse (manual):**
```bash
npm run build
npx lighthouse https://dealerwyze.com --output-path=./lighthouse-report.html
```

---

## Transaction Tracing

Sentry traces request flow through:
- API route → Database query → Stripe API → Response

**Sample Rate:**
- Production: 10% (1 in 10 requests) — reduces noise, captures patterns
- Staging: 100% (all requests) — catch issues before production

**Viewing Traces:**
- Sentry → Performance → Transactions
- Click a transaction to see waterfall (API call → DB → external service)

---

## Monitoring Checklist (Daily)

- [ ] **Sentry dashboard:** Check for any new error types or spikes
- [ ] **Slack alerts:** Review #sentry-alerts for critical issues
- [ ] **Performance:** Check if LCP or CLS degraded overnight
- [ ] **Uptime:** Verify dealerwyze.com and realtywyze.us are responding

**Weekly:**
- [ ] Review error trends and spike events
- [ ] Check for patterns (e.g., errors tied to specific API endpoint)
- [ ] Verify no auth tokens or secrets leaked in error messages

---

## Escalation

**If critical error spike detected:**

1. **Immediate (0–5 min):**
   - Check Sentry dashboard for error message and affected endpoint
   - Check Slack #sentry-alerts for automatic notification
   - Note the timestamp and error rate

2. **Investigation (5–15 min):**
   - Check affected system status (Stripe, Twilio, Supabase)
   - Check recent deployments (did something ship in last hour?)
   - Search error logs for correlation (same user, same endpoint?)

3. **Mitigation (15–30 min):**
   - If recent deploy: consider rollback
   - If external service down: route traffic or disable feature temporarily
   - Post status update to #sentry-alerts

4. **Resolution:**
   - Once fixed, verify error rate returns to baseline
   - Document root cause in INCIDENT_LOG.md

---

## Dashboards & Reports

### Sentry Public Dashboards

None currently configured. Private dashboards available to Tim via Sentry login.

### Metrics to Track

- **Error volume:** Total errors/hour, errors/day
- **Error types:** Top 10 error signatures
- **Affected users:** How many unique sessions/users hit errors
- **Performance percentiles:** p50, p75, p95 response times
- **Uptime:** % of requests returning 2xx (target: 99.9%)

---

## Maintenance

### Quarterly Tasks

- [ ] Review Sentry alert rules (are they still relevant?)
- [ ] Update error redaction rules (add new sensitive fields)
- [ ] Archive old projects or increase retention if needed
- [ ] Update team access (add/remove users)
- [ ] Review performance baselines (have targets changed?)

### Sentry Configuration Files

- `sentry.server.config.ts` — Server-side initialization, error handling, data redaction
- `sentry.edge.config.ts` — Edge/middleware initialization
- `next.config.ts` — Sentry integration with Next.js build
- `instrumentation.ts` — Server instrumentation hooks

---

## Contacts

- **Sentry support:** https://sentry.io/support/
- **Slack integration:** Manage in Sentry → Integrations → Slack
- **Tim (on-call):** Telegram, email support@dealerwyze.com

---

## References

- [Sentry Next.js Docs](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- [Core Web Vitals](https://web.dev/vitals/)
- [Sentry Slack Integration](https://docs.sentry.io/product/integrations/slack/)
