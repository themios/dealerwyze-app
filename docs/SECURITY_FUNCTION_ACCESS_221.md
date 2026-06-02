# Sprint 5 — Function Access Control Audit (Migration 221)

**Date:** 2026-06-02  
**Migration:** `supabase/migrations/221_revoke_anon_function_execute.sql`

---

## Scope

Supabase Security Advisor flag: `anon_security_definer_function_executable` — SECURITY DEFINER functions callable via PostgREST with the anon key bypass RLS and run as owner.

**Live DB audit (before migration):**

| Category | Count |
|----------|------:|
| `public` SECURITY DEFINER + anon EXECUTE | 38 |
| Other `public` + anon EXECUTE (non-secdef) | 6 |
| **Total anon-executable `public` functions** | **44** |

The “87 warnings” figure likely includes other advisor categories (RLS, search_path, extensions) or duplicate overload reporting. This migration addresses all **44** anon-executable public functions.

**After migration:** 1 anon-executable function remains (`increment_vehicle_views`).

---

## Classification

### Public — anon EXECUTE retained

| Function | Why |
|----------|-----|
| `increment_vehicle_views(uuid)` | Intentional public VDP counter; body restricts to `published = true` listings only |

### Authenticated + service_role — anon revoked

RLS helpers, free-tier triggers, staff RPCs, and user-trigger functions. Called from logged-in app sessions or triggers on user mutations — never from anon PostgREST.

Includes: `get_org_id`, `get_my_role`, `is_org_admin`, `is_platform_superuser`, `get_org_subscription_status`, `enforce_free_tier_*`, `advance_lead_state`, `record_bhph_manual_payment`, all archive/trigger helpers, `normalize_phone`, etc.

### service_role only — anon + authenticated revoked

Cron, webhooks, quota counters, BHPH finalization, Twilio idempotency, internal allocation math.

Includes: `add_overage_buffer`, `deduct_overage_buffer`, `claim_twilio_message_sid`, `increment_sms_usage`, `increment_voice_usage`, `increment_*_overage`, `increment_fax_pages`, `reset_overage_counters`, `increment_org_scan_counter`, `increment_engagement_score`, `append_lifecycle_warning`, `bhph_payment_allocation`, `close_re_transaction`, all `finalize_bhph_*` overloads.

**Note on BHPH payment:** `finalize_bhph_payment` validates token/amount internally but is invoked from `/api/pay/[token]` using the **service client**, not anon PostgREST. Keeping anon EXECUTE would allow direct RPC abuse with guessed UUIDs. Payment flow unchanged.

---

## Questionable / follow-up

| Item | Notes |
|------|-------|
| `is_org_admin(uuid)` | Present in live DB but **not defined in repo migrations** — may have been applied manually. Included in 221 revoke/grant. Consider adding source migration. |
| `finalize_bhph_payment` 3-arg overload | Legacy signature still in DB alongside 4-arg and 5-arg versions. All revoked from anon; consider dropping obsolete overload in a future migration. |
| `increment_vehicle_views` | Only public anon RPC. Confirm frontend/VDP actually calls it via anon client; if only server-side, could move to service_role-only later. |
| `get_org_id()` pre-fix | Anon could RPC it (returned `null` without session) — unnecessary exposure; now blocked. |

---

## Test results

```bash
node scripts/test-function-access-control.mjs
```

| Check | Result |
|-------|--------|
| Anon → `get_org_id` | 401 `42501` (blocked) |
| Anon → `add_overage_buffer` | 401 `42501` (blocked) |
| Anon → `claim_twilio_message_sid` | 401 `42501` (blocked) |
| Anon → `finalize_bhph_payment` (5-arg) | 401 `42501` (blocked) |
| Anon → `close_re_transaction` | 401 `42501` (blocked) |
| Anon → `increment_vehicle_views` | 204 (allowed) |
| service_role → `claim_twilio_message_sid` | 200 OK |
| service_role → `add_overage_buffer` | 200 OK |

Post-migration DB check: **1** SECURITY DEFINER function with anon EXECUTE (`increment_vehicle_views`).

---

## Apply

```bash
# Local / linked project
psql "$SUPABASE_DB_URL" -f supabase/migrations/221_revoke_anon_function_execute.sql

# Verify
node scripts/test-function-access-control.mjs
```

Re-run Supabase Security Advisor after deploy to confirm `anon_security_definer_function_executable` warnings cleared.
