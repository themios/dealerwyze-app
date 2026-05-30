# Audit Logging Implementation Checklist

Critical routes requiring Tier 1 audit logging (must log all mutations).

**Current status:** 34 of 340 API routes (10%) have audit logging. Target: 100% Tier 1 + 50% Tier 2.

---

## Tier 1: Critical Routes (MUST LOG)

### Authentication & Users (7 routes)

- [x] POST `/api/auth/register` — `user_created`
- [x] POST `/api/users/invite` — `user_invited`
- [ ] POST `/api/users/[id]/deactivate` — `user_deactivated`
- [ ] PATCH `/api/users/[id]/role` — `role_changed`
- [ ] GET `/api/auth/me` — implicit access log (optional)
- [ ] POST `/api/auth/logout` — `user_session_ended` (optional)
- [ ] POST `/api/auth/delete-account` — `account_deleted` (critical)

### Payments & Billing (8 routes)

- [ ] POST `/api/bhph/[id]/confirm-manual-payment` — `bhph_payment_confirmed`
- [ ] POST `/api/bhph/confirm-ach` — `bhph_payment_confirmed`
- [ ] POST `/api/stripe/webhook` — `payment_confirmed` (actor_type: 'webhook')
- [ ] PATCH `/api/billing/plan` — `billing_plan_changed`
- [ ] POST `/api/billing/invoice` — `invoice_created`
- [ ] POST `/api/billing/cancel-subscription` — `subscription_cancelled`
- [ ] POST `/api/receipts/record` — `receipt_recorded`
- [ ] DELETE `/api/receipts/[id]` — `receipt_deleted`

### Organization Settings (10 routes)

- [x] PATCH `/api/organization/settings` — `org_settings_updated`
- [ ] POST `/api/organization/create` — `org_created`
- [ ] PATCH `/api/organization/[id]/status` — `org_status_changed`
- [ ] PATCH `/api/security/[type]` — `security_setting_updated`
- [ ] POST `/api/integrations/[name]/authorize` — `integration_connected`
- [ ] DELETE `/api/integrations/[name]` — `integration_disconnected`
- [ ] PATCH `/api/billing/plan` — `billing_plan_changed` (already counted above)
- [ ] POST `/api/organization/invite-user` — `user_invited` (already counted above)
- [ ] PATCH `/api/org-settings/[key]` — `org_setting_updated`
- [ ] POST `/api/organization/verify-email` — `org_email_verified`

### Data Access & Deletion (3 routes)

- [x] GET `/api/settings/data-export` — `data_export`
- [ ] POST `/api/data/purge` — `data_purged`
- [ ] POST `/api/data/gdpr-deletion` — `gdpr_deletion_requested`

### Admin Actions (6 routes)

- [x] POST `/api/admin/impersonate/[org-id]` — `impersonation_start`
- [x] DELETE `/api/admin/impersonate` — `impersonation_end`
- [ ] PATCH `/api/admin/approve-org` — `org_approved`
- [ ] PATCH `/api/admin/reject-org` — `org_rejected`
- [ ] POST `/api/admin/bulk-email` — `bulk_email_sent`
- [ ] POST `/api/admin/bulk-sms` — `bulk_sms_sent`

### Webhook Auth Failures (5 routes)

- [x] POST `/api/stripe/webhook` — `webhook_auth_failure`
- [x] POST `/api/twilio/inbound` — `webhook_auth_failure`
- [ ] POST `/api/twilio/status-callback` — `webhook_auth_failure`
- [ ] POST `/api/retell/webhook` — `webhook_auth_failure`
- [ ] POST `/api/gmail/webhook` — `webhook_auth_failure`

### Phone/Voice (3 routes)

- [ ] POST `/api/phone/provision` — `phone_provisioned`
- [ ] DELETE `/api/phone/[id]` — `phone_deprovisioned`
- [ ] POST `/api/admin/provision-voice` — `voice_agent_provisioned`

**Tier 1 Total:** ~42 critical routes

---

## Tier 2: Important Routes (SHOULD LOG)

### Customers (4 routes)

- [ ] POST `/api/customers/create` — `customer_created`
- [ ] PATCH `/api/customers/[id]` — `customer_updated`
- [ ] DELETE `/api/customers/[id]` — `customer_deleted`
- [ ] POST `/api/customers/[id]/merge` — `customer_merged`

### Vehicles/Inventory (4 routes)

- [ ] POST `/api/vehicles/create` — `vehicle_created`
- [ ] PATCH `/api/vehicles/[id]` — `vehicle_updated`
- [ ] DELETE `/api/vehicles/[id]` — `vehicle_deleted`
- [ ] PATCH `/api/vehicles/[id]/sold` — `vehicle_sold`

### Tasks (3 routes)

- [ ] POST `/api/tasks/create` — `task_created`
- [ ] PATCH `/api/tasks/[id]` — `task_updated`
- [ ] DELETE `/api/tasks/[id]` — `task_deleted`

### Messages & Communication (5 routes)

- [ ] POST `/api/sms/send` — `sms_sent` (high volume, optional verbose logging)
- [ ] POST `/api/email/send` — `email_sent` (high volume, optional)
- [ ] POST `/api/sms/bulk` — `bulk_sms_sent`
- [ ] POST `/api/email/bulk` — `bulk_email_sent`
- [ ] PATCH `/api/templates/[id]` — `template_updated`

### Sequences & Automation (3 routes)

- [ ] POST `/api/sequences/create` — `sequence_created`
- [ ] PATCH `/api/sequences/[id]` — `sequence_updated`
- [ ] DELETE `/api/sequences/[id]` — `sequence_deleted`

### Support Tickets (3 routes)

- [ ] POST `/api/support-tickets/create` — `support_ticket_created`
- [ ] PATCH `/api/support-tickets/[id]` — `support_ticket_updated`
- [ ] PATCH `/api/support-tickets/[id]/resolve` — `support_ticket_resolved`

**Tier 2 Total:** ~22 important routes

---

## Implementation Pattern

Add this pattern to every Tier 1 route (all POST/PATCH/DELETE):

```typescript
import { writeAuditLog } from '@/lib/audit/log'

export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null

  try {
    const body = await req.json()
    // Validate input...

    const supabase = createClient(req)
    const { data, error } = await supabase
      .from('table')
      .insert({ ...body, org_id: profile.org_id })
      .select()

    if (error) {
      // Log failure
      await writeAuditLog({
        orgId: profile.org_id,
        actorId: profile.id,
        actorType: 'user',
        action: 'resource_created',
        entityType: 'resource',
        metadata: { success: false, error: error.message },
        ipAddress: ip,
      })
      return error_response()
    }

    // Log success
    await writeAuditLog({
      orgId: profile.org_id,
      actorId: profile.id,
      actorType: 'user',
      action: 'resource_created',
      entityType: 'resource',
      entityId: data[0].id,
      metadata: { details: data[0] },
      ipAddress: ip,
    })

    return success_response(data)
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    await writeAuditLog({
      orgId: profile.org_id,
      actorId: profile.id,
      actorType: 'user',
      action: 'resource_created',
      entityType: 'resource',
      metadata: { success: false, error: error.slice(0, 200) },
      ipAddress: ip,
    })
    return error_response()
  }
}
```

---

## Webhook Pattern

For webhook auth failures (all external endpoints):

```typescript
import { writeAuditLog } from '@/lib/audit/log'

export async function POST(req: NextRequest) {
  const signature = req.headers.get('x-signature')
  const isValid = validateSignature(signature, req)

  if (!isValid) {
    await writeAuditLog({
      orgId: null,
      actorId: null,
      actorType: 'webhook',
      action: 'webhook_auth_failure',
      metadata: {
        service: 'stripe',
        path: '/api/stripe/webhook',
        reason: 'invalid_signature',
      },
      ipAddress: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    })
    return forbidden()
  }
  // ... handle webhook
}
```

---

## Priority Order

Implement in this order (highest risk first):

1. **User roles & permissions** (impersonation, deactivation, role changes)
2. **Payments** (BHPH confirm, billing plan changes, invoices)
3. **Data deletion** (purge, GDPR right to be forgotten)
4. **Organization settings** (security, integrations, email)
5. **Webhook auth failures** (all 5 external endpoints)
6. **Customer mutations** (create, update, delete)
7. **Vehicle mutations** (create, update, sold)
8. **Admin bulk operations** (bulk email, bulk SMS)
9. **Sequence enrollment** (add, remove, pause)
10. **Message templates** (create, update, delete)

---

## Testing

For each route, verify:
1. Successful mutation logs with entity_id
2. Failed mutation logs with error reason
3. User/IP is captured correctly
4. Sensitive data (passwords, keys) NOT logged

```typescript
// Test: user creates customer
POST /api/customers/create { name: "Test Customer" }

// Verify audit_log:
SELECT * FROM audit_log
WHERE action = 'customer_created' AND actor_id = ? AND created_at > now() - interval '1 min';
// Should return 1 row with entity_id = created customer id
```

---

## Maintenance

- [ ] Add `writeAuditLog` helper import to each route
- [ ] Extract IP address helper (`getIP(req)`) to `lib/auth/ip.ts`
- [ ] Test with Sentry alerts for audit log failures
- [ ] Add quarterly review of audit logs for gaps
- [ ] Archive logs to cold storage after 6 months

---

## Expected Impact

- **Compliance:** SOC 2 audit trail, GDPR consent, CCPA access logs
- **Security:** Detect unauthorized access, suspicious bulk operations
- **Troubleshooting:** Diagnose data inconsistencies
- **Accountability:** Track all changes to sensitive data

---

## References

- [AUDIT_LOGGING_STRATEGY.md](./AUDIT_LOGGING_STRATEGY.md) — Full strategy
- [lib/audit/log.ts](../lib/audit/log.ts) — Audit logger implementation
- [CLAUDE.md](./CLAUDE.md) — Audit logging requirements
