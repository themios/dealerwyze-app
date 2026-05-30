# Tier 2: Remaining Items #5-7

High-value enterprise features for complete production readiness. These items are planned, scoped, and documented for future implementation.

---

## #5: Admin Bulk Operations

**Goal:** Enable admins to perform batch operations (org status changes, bulk SMS/email, permission management) with audit logging.

### Scope

- **Bulk org status changes** (activate/suspend/deactivate multiple orgs)
- **Bulk SMS delivery** (send message to customer list)
- **Bulk email delivery** (send template to customer list)
- **Bulk permission updates** (grant role to multiple users)

### API Endpoints to Create

```typescript
// POST /api/admin/bulk/org-status
{ org_ids: string[], new_status: 'active' | 'suspended' | 'deactivated' }
// Returns: { updated: number, failed: number, details: [...] }
// Logs: action='bulk_org_status_changed'

// POST /api/admin/bulk/send-sms
{ customer_ids: string[], template_id: string, org_id?: string }
// Returns: { sent: number, failed: number, details: [...] }
// Logs: action='bulk_sms_sent'

// POST /api/admin/bulk/send-email
{ customer_ids: string[], template_id: string, org_id?: string }
// Returns: { sent: number, failed: number, details: [...] }
// Logs: action='bulk_email_sent'

// PATCH /api/admin/bulk/permissions
{ user_ids: string[], role: UserRole, org_id: string }
// Returns: { updated: number, failed: number }
// Logs: action='bulk_role_changed'
```

### Implementation Checklist

- [ ] Create `lib/admin/bulkOperations.ts` with batch processing helpers
- [ ] Implement rate limiting (10 ops/sec max per admin)
- [ ] Add comprehensive error handling (partial failures)
- [ ] Audit log each operation with user/org/count
- [ ] Create admin UI in `/admin/bulk-operations`
- [ ] Add confirmation dialogs (prevent accidental bulk actions)
- [ ] Test with 1000+ records to verify performance
- [ ] Document in API docs

### Risks & Mitigations

- **Risk:** Bulk delete accidentally wipes data
  - **Mitigation:** Require 2FA confirmation, preview results before confirm
- **Risk:** Rate limit exhaustion DoS
  - **Mitigation:** Per-admin rate limits (ops/sec), queue large jobs
- **Risk:** Partial failures hard to debug
  - **Mitigation:** Detailed error log, retry mechanism

### Timeline

**Estimated effort:** 2-3 days (API + UI)

---

## #6: Support Tooling

**Goal:** Admin tools for diagnosing customer issues and manual intervention without direct DB access.

### Scope

- **Org search** (find org by name/email/status)
- **Customer lookup** (find customer by name/email/phone across org)
- **Activity search** (find interactions by keyword, date, type)
- **Manual interventions** (force sequence enroll, reset failed payment, etc.)
- **Issue diagnostics** (why did SMS fail? when was last email sent?)

### Admin UI Pages to Create

```
/admin/tools/
├── org-search/      — Find org by name/status
├── customer-lookup/ — Find customer, view full history
├── activity-search/ — Find interactions, troubleshoot
└── manual-actions/  — Force enroll, reset payment, etc.
```

### Search Features

```typescript
// GET /api/admin/search/orgs?q=...&status=...&limit=10
// Return: { name, email, status, created_at, customers_count, ... }

// GET /api/admin/search/customers?q=...&org_id=...
// Return: { id, name, email, phone, org_id, last_activity_at }

// GET /api/admin/search/activities?org_id=...&type=...&from=...&to=...
// Return: paginated activities with metadata

// POST /api/admin/actions/force-enroll-sequence
{ customer_id, sequence_id, org_id }
// Return: { success, details, log_entry_id }

// POST /api/admin/actions/reset-payment-failure
{ org_id, customer_id, payment_id }
// Return: { success, next_status, retry_count }
```

### Implementation Checklist

- [ ] Create `lib/admin/search.ts` with optimized queries
- [ ] Add full-text search index on customer name/email
- [ ] Implement pagination (cursor-based for large result sets)
- [ ] Create React search components (org search, customer lookup)
- [ ] Add activity timeline UI (activity-search page)
- [ ] Implement manual action confirmation dialogs
- [ ] Audit log every manual intervention with actor + reason
- [ ] Test search performance (< 200ms for 100k records)

### Risks & Mitigations

- **Risk:** Slow queries lock production DB
  - **Mitigation:** Set query timeouts (5s max), use read replicas if available
- **Risk:** Admin discovers and fixes data issues (hides bugs)
  - **Mitigation:** Require detailed notes, alert engineering on patterns
- **Risk:** Manual interventions need rollback
  - **Mitigation:** Audit trail, document how to undo action

### Timeline

**Estimated effort:** 1-2 days (search UI + endpoints)

---

## #7: Rate Limit Dashboard

**Goal:** Real-time visibility into rate limit health, abuse patterns, and quota usage.

### Scope

- **Rate limit status** (current usage % by endpoint)
- **Abuse pattern detection** (sudden spike in requests, repeated failures)
- **Quota tracking** (SMS/email spent vs. plan limit)
- **Webhook health** (failed webhooks, retry counts)
- **Manual overrides** (bump limit for specific org if needed)

### Dashboard Endpoints

```typescript
// GET /api/admin/dashboard/rate-limits
// Return:
{
  sms: { used: 5234, limit: 10000, percent: 52 },
  api: { used: 48234, limit: 100000, percent: 48 },
  auth: { used: 1232, limit: 5000, percent: 25 },
  trends: {
    sms_24h: { peak: 800, avg: 300 },
    failed_auth_24h: 12,
  }
}

// GET /api/admin/dashboard/abuse-patterns
// Return: [ { org_id, endpoint, spike_start, spike_end, request_count } ]

// GET /api/admin/dashboard/quota-status
// Return:
[
  { org_id, plan: 'pro', sms_spent: 234, sms_limit: 10000, percent: 2 },
  { org_id, plan: 'growth', sms_spent: 4950, sms_limit: 5000, percent: 99 },
]

// POST /api/admin/rate-limits/override
{ org_id, limit_type: 'sms', new_limit: 50000 }
// Return: { success, previous_limit, new_limit, expires_at }
```

### Implementation Checklist

- [ ] Add Upstash Redis metrics collection (`lib/rateLimit/metrics.ts`)
- [ ] Create `/admin/dashboard/rate-limits` page
- [ ] Implement Redis queries to extract limit stats
- [ ] Add spike detection algorithm (compare 24h avg vs. current)
- [ ] Create Sentry/Slack alerts for abuse patterns
- [ ] UI: line chart of 24h rate limit usage
- [ ] Implement manual override with expiry (24 hours default)
- [ ] Test with production Redis metrics

### Visualization Ideas

```
Rate Limit Dashboard
┌─────────────────────────────────────────┐
│ SMS                   52% (5234/10000)  │ [████░░░░░] Used today
│ API Calls             48% (48k/100k)    │ [████░░░░░] Used today
│ Auth Attempts         25% (1232/5000)   │ [██░░░░░░░] Used today
└─────────────────────────────────────────┘

Abuse Alerts (Last 24h)
│ Org: apollo-auto      │ SMS: +800 req spike at 2:30 PM
│ Org: dealerx-test     │ Auth: 12 failed attempts (2:45 PM)
│ Org: premier-dealers  │ API: 10k req in 60s (rate limit reached)

Quota Status
│ Plan      │ SMS Used  │ Limit │ %   │ Action
├───────────┼───────────┼───────┼─────┼────────
│ Growth    │ 4950/5000 │ 99%   │ ⚠️  │ Upsell to Pro
│ Pro       │ 234/10k   │ 2%    │ ✅  │ Healthy
└───────────┴───────────┴───────┴─────┴────────
```

### Risks & Mitigations

- **Risk:** Real-time metrics cause performance issues
  - **Mitigation:** Cache metrics in Redis (update every 5 min)
- **Risk:** False positives in abuse detection
  - **Mitigation:** Whitelist known large customers, manual confirmation before alerts
- **Risk:** Manual overrides create audit liability
  - **Mitigation:** Log every override with actor + reason, 24-hour expiry

### Timeline

**Estimated effort:** 1-2 days (dashboard UI + metrics collection)

---

## Summary: Tier 2 Completion Status

| Item | Status | Effort | Impact | Notes |
|------|--------|--------|--------|-------|
| #1 Data Export | ✅ Complete | 2h | High | 11 tables, audit logging, UI |
| #2 Audit Logging | ✅ Strategy | 1h | High | 42 critical routes documented, pattern established |
| #3 Backups | ✅ Strategy | 30m | High | Supabase auto-backups documented, PITR procedures |
| #4 API Security | ✅ Strategy | 1h | High | CORS, CSRF, webhook signing, rate limits documented |
| #5 Bulk Operations | 📋 Planned | 2-3d | Medium | 4 endpoints designed, implementation guide |
| #6 Support Tooling | 📋 Planned | 1-2d | Medium | Search + manual actions designed |
| #7 Rate Limit Dashboard | 📋 Planned | 1-2d | Medium | Metrics + UI designed |

**Total Tier 2:**
- **Implemented:** #1-4 (data export, audit strategy, backup docs, API security)
- **Documented & Planned:** #5-7 (bulk ops, support tools, rate dashboard)
- **Implementation ready for:** Engineering team to execute in next sprint

---

## Next Steps (Post-Tier 2)

### Tier 2 Implementation (Engineering Sprint)

1. Implement audit logging on 42 critical routes (ref: AUDIT_LOGGING_CHECKLIST.md)
2. Create backup verification cron job (daily 10 AM UTC)
3. Implement bulk operations endpoints (#5)
4. Build support tooling admin pages (#6)
5. Create rate limit dashboard (#7)

### Tier 3: Advanced Features (Future)

- [ ] Single sign-on (SSO) / SAML
- [ ] Advanced reporting & analytics
- [ ] Custom fields & metadata
- [ ] Workflow automation rules
- [ ] API rate limit tuning per vertical
- [ ] PII data masking
- [ ] Encryption at rest
- [ ] Hardware security keys

---

## References

- [AUDIT_LOGGING_CHECKLIST.md](./AUDIT_LOGGING_CHECKLIST.md) — 42 critical routes to log
- [BACKUP_STRATEGY.md](./BACKUP_STRATEGY.md) — Backup procedures
- [API_SECURITY_HARDENING.md](./API_SECURITY_HARDENING.md) — Security controls
- [PROJECT.md](./PROJECT.md) — Product roadmap

