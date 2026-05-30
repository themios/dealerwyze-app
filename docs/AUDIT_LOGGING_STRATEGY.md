# Audit Logging Strategy

Comprehensive audit trail for DealerWyze and RealtyWyze — tracks all mutations, admin actions, and security events.

---

## Goals

1. **Compliance**: GDPR, CCPA, SOC 2 audit trails
2. **Security**: Detect and investigate suspicious activity
3. **Accountability**: Track who changed what, when, and why
4. **Troubleshooting**: Diagnose data inconsistencies and user issues

---

## Scope

### Tier 1: Critical (Must Log)

**User & Permission Changes:**
- User created, invited, deactivated
- Role changed (agent → admin, etc.)
- Permission/scope changed

**Payment & Financial:**
- Payment recorded (BHPH, invoices)
- Payment failed
- Commission calculated
- Billing plan changed
- Refund issued

**Organization Settings:**
- Organization name/details updated
- Security settings changed (password policy, MFA)
- Integration credentials changed
- Feature flags toggled
- Org deactivated/suspended

**Data Access & Export:**
- Data exported (GDPR right to data)
- Data deleted (purge, right to be forgotten)
- Admin impersonation started/ended
- Sensitive data accessed (payment history, notes)

**High-Risk Mutations:**
- Customer created/deleted (especially with payment method)
- Vehicle marked as sold
- Task deadline extended
- Email template updated

**Webhook & Integration:**
- Webhook auth failure (signature mismatch, rate limit, etc.)
- Stripe event failed
- Twilio delivery failed
- Email sent failure

**Admin Actions:**
- Admin staff action (e.g., org approval, tier adjustment)
- Bulk operations (bulk email, bulk SMS)
- Manual intervention (force sync, clear cache)

### Tier 2: Important (Should Log)

- Customer contact info updated
- Vehicle photo added/removed
- Task status changed
- Message template created/updated
- Sequence enrolled/unenrolled
- Support ticket created/resolved
- Phone line provisioned/deprovisioned

### Tier 3: Verbose (Nice to Have)

- Customer activity logged (call, SMS, email)
- Login/logout events
- Permission check (on every API call)

---

## Audit Log Schema

**Table: `audit_log`** (append-only, service-role only)

```sql
id                BIGSERIAL PRIMARY KEY
created_at        TIMESTAMP WITH TIME ZONE DEFAULT now()
org_id            UUID  -- null for platform-level actions
actor_id          UUID  -- user who initiated action; null for webhooks
actor_type        TEXT  -- 'user', 'staff', 'webhook', 'cron'
action            TEXT  -- action key (e.g., 'payment_confirmed')
entity_type       TEXT  -- table/resource (e.g., 'bhph_payment', 'profile', 'organization')
entity_id         UUID  -- record ID that was mutated
metadata          JSONB -- details (old value, new value, error, reason, etc.)
ip_address        INET  -- client IP for user actions; null for webhooks
```

---

## Implementation

### Helper Functions

**`writeAuditLog(entry: AuditEntry)`** — Platform audit logger (lib/audit/log.ts)
```typescript
await writeAuditLog({
  orgId: org_id,
  actorId: user_id,
  actorType: 'user',
  action: 'payment_confirmed',
  entityType: 'bhph_payment',
  entityId: payment_id,
  metadata: { amount, method, success: true },
  ipAddress: ip,
})
```

**`logOrgAudit(entry)`** — Organization audit logger (lib/audit/orgAudit.ts)
```typescript
await logOrgAudit({
  org_id: org_id,
  actor_id: user_id,
  actor_type: 'user',
  action: 'settings_updated',
  details: { changed_keys: ['sms_phone_number'] },
  ip: ip,
})
```

### Pattern: Mutation with Audit

```typescript
// Example: POST /api/customers/create
export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const body = await req.json()

  const supabase = createClient(req)
  const { data, error } = await supabase
    .from('customers')
    .insert({ ...body, user_id: profile.org_id })
    .select()

  if (error) {
    await writeAuditLog({
      orgId: profile.org_id,
      actorId: profile.id,
      actorType: 'user',
      action: 'customer_created',
      entityType: 'customer',
      metadata: { success: false, error: error.message },
      ipAddress: getIP(req),
    })
    return error_response()
  }

  // Log successful mutation
  await writeAuditLog({
    orgId: profile.org_id,
    actorId: profile.id,
    actorType: 'user',
    action: 'customer_created',
    entityType: 'customer',
    entityId: data[0].id,
    metadata: { name: body.name, email: body.email },
    ipAddress: getIP(req),
  })

  return success_response(data)
}
```

### Pattern: Webhook Auth Failure

```typescript
// Example: POST /api/twilio/inbound
export async function POST(req: NextRequest) {
  const isValid = await validateTwilioSignature(req)
  if (!isValid) {
    await writeAuditLog({
      orgId: null,
      actorId: null,
      actorType: 'webhook',
      action: 'webhook_auth_failure',
      metadata: { service: 'twilio', path: '/api/twilio/inbound' },
      ipAddress: getIP(req),
    })
    return forbidden()
  }
  // ... handle webhook
}
```

---

## Critical Audit Checkpoints

### Routes Requiring Tier 1 Logging

**Authentication & Users:**
- POST `/api/auth/register` → `user_created`
- POST `/api/users/invite` → `user_invited`
- POST `/api/users/[id]/deactivate` → `user_deactivated`
- PATCH `/api/users/[id]/role` → `role_changed`

**Payments & Billing:**
- POST `/api/bhph/confirm-payment` → `bhph_payment_confirmed`
- POST `/api/stripe/webhook` → `payment_confirmed` (via webhook, actor_type: 'webhook')
- PATCH `/api/billing/plan` → `billing_plan_changed`

**Organization Settings:**
- PATCH `/api/organization/settings` → `org_settings_updated`
- PATCH `/api/security/mfa` → `mfa_enabled` | `mfa_disabled`
- POST `/api/integrations/[name]/authorize` → `integration_connected`

**Data Access & Deletion:**
- GET `/api/settings/data-export` → `data_export` (already added)
- DELETE `/api/customers/[id]` → `customer_deleted`
- POST `/api/data/purge` → `data_purged`

**Admin Actions:**
- POST `/api/admin/impersonate/[org-id]` → `impersonation_start`
- DELETE `/api/admin/impersonate` → `impersonation_end`
- PATCH `/api/admin/approve-org` → `org_approved`
- POST `/api/admin/bulk-email` → `bulk_email_sent`

**Integration Webhooks:**
- POST `/api/stripe/webhook` → auth failure logs + event processing
- POST `/api/twilio/inbound` → auth failure logs
- Any webhook with auth failure

---

## Querying Audit Logs

### Find recent actions by user

```sql
SELECT * FROM audit_log
WHERE actor_id = 'user-uuid' AND created_at > now() - interval '7 days'
ORDER BY created_at DESC;
```

### Find failed actions

```sql
SELECT * FROM audit_log
WHERE action LIKE 'webhook_auth_failure' OR (metadata->>'error') IS NOT NULL
ORDER BY created_at DESC LIMIT 100;
```

### Find sensitive operations

```sql
SELECT * FROM audit_log
WHERE action IN ('impersonation_start', 'data_export', 'data_purged', 'role_changed')
ORDER BY created_at DESC LIMIT 100;
```

### Compliance: GDPR right to deletion audit

```sql
SELECT * FROM audit_log
WHERE org_id = 'org-uuid' AND action = 'data_purged'
ORDER BY created_at DESC;
```

---

## Maintenance

### Retention Policy

- **Production audit_log**: Retain for 2 years (configurable)
- **Sensitive actions** (impersonation, admin, data deletion): 5 years
- **Failed auth attempts**: 90 days
- **Regular activity** (logins, routine updates): 90 days

### Archival

Use Supabase scheduled SQL to archive old logs to separate `audit_log_archive` table:

```sql
INSERT INTO audit_log_archive (SELECT * FROM audit_log WHERE created_at < now() - interval '2 years');
DELETE FROM audit_log WHERE created_at < now() - interval '2 years';
```

---

## Security & Privacy

### Redaction Rules

**Do NOT log:**
- Plaintext passwords or API keys
- Full credit card numbers (log last 4 digits only)
- SSNs or tax IDs (log last 4 digits only)
- Authentication tokens or session IDs

**Safe to log:**
- User names, emails
- Org names, settings keys
- Action types, timestamps
- Outcome (success/failure/reason)
- IP addresses (for security analysis)

### Access Control

**Who can read audit logs:**
- Platform owner (all orgs, all actions)
- Org admin (their org only)
- Not available to regular users

**Future:** Implement audit log viewer UI in admin panel.

---

## Compliance Mapping

| Regulation | Requirement | Implementation |
|-----------|-------------|-----------------|
| GDPR | Data access logs | `data_export` action + 6-month retention |
| GDPR | Deletion audit | `data_purged` action + 2-year retention |
| CCPA | Access logs | `data_export` action |
| SOC 2 | Change logs | `*_updated` actions on settings/config |
| SOC 2 | Auth failure logs | `webhook_auth_failure`, `impersonation_*` |
| HIPAA (future) | Access logs | All reads + mutations with actor tracking |

---

## Timeline

- **Phase 1** (Done): Core `audit_log` table and `writeAuditLog()` function
- **Phase 2** (In Progress): Add Tier 1 logging to all critical routes
- **Phase 3** (Planned): Tier 2 logging, UI viewer, automated alerts
- **Phase 4** (Future): Archival policy, compliance reports, PII redaction

---

## References

- [lib/audit/log.ts](../lib/audit/log.ts) — Core audit logger
- [lib/audit/orgAudit.ts](../lib/audit/orgAudit.ts) — Org audit logger
- [CLAUDE.md](./CLAUDE.md) — Audit logging required for 5 specific areas
- [Migration 141+](../supabase/migrations/) — `audit_log` table DDL

