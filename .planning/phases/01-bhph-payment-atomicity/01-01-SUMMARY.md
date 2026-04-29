---
phase: 01
plan: 01
subsystem: bhph-payments
tags: [postgres, rpc, plpgsql, atomicity, migration]

dependency-graph:
  requires: []
  provides: [finalize_bhph_payment RPC, bhph_payment_tokens_pi_id_unique index]
  affects: [plan-01-02, plan-01-03]

tech-stack:
  added: []
  patterns: [SECURITY DEFINER RPC, optimistic-lock UPDATE, COALESCE increment, INTERVAL date arithmetic]

key-files:
  created:
    - supabase/migrations/107_finalize_bhph_payment_rpc.sql
  modified: []

decisions:
  - id: security-definer
    choice: SECURITY DEFINER + SET search_path = ''
    rationale: >
      The calling route has no user session (public token route using service client).
      Activities table uses auth.uid()-based RLS. SECURITY DEFINER lets the function
      run with owner privileges. search_path = '' per migration 097 pattern (Security Advisor req).
  - id: optimistic-lock
    choice: UPDATE WHERE status = 'pending' as concurrency guard
    rationale: >
      The UPDATE acts as an optimistic lock — only one concurrent confirm succeeds.
      GET DIAGNOSTICS v_updated = ROW_COUNT lets us distinguish "already paid (idempotent)"
      from "conflict (different PI)" without a FOR UPDATE row lock, keeping the
      transaction short and avoiding deadlock risk.
  - id: coalesce-increment
    choice: total_paid = COALESCE(total_paid, 0) + v_token.amount
    rationale: >
      Eliminates the read-then-write race in the original route code. Two concurrent
      confirms would both read the same total_paid baseline and both write the same
      incremented value — losing one payment. SQL arithmetic is atomic within the UPDATE.
  - id: no-org-id-activities
    choice: activities INSERT uses user_id = org_id, no org_id column
    rationale: >
      activities table has no org_id column. Inserting org_id breaks writes.
      BHPH convention: user_id carries the org UUID. Confirmed in research + migration 001.
  - id: partial-unique-index
    choice: Partial UNIQUE index on stripe_payment_intent_id WHERE NOT NULL
    rationale: >
      Belt-and-suspenders beyond the optimistic lock. Stripe never reuses PI IDs,
      but a DB-level constraint catches any bug where the same PI gets recorded twice.
      Partial (WHERE NOT NULL) because the column is nullable pre-payment.

metrics:
  duration: ~5 minutes
  completed: 2026-04-29
---

# Phase 1 Plan 01: finalize_bhph_payment Migration Summary

**One-liner:** PL/pgSQL atomic RPC wrapping token-mark-paid + activity-insert + contract-advance in a single transaction with optimistic-lock concurrency guard.

## What Was Built

`supabase/migrations/107_finalize_bhph_payment_rpc.sql` — a self-contained Supabase migration containing:

1. `CREATE UNIQUE INDEX IF NOT EXISTS bhph_payment_tokens_pi_id_unique` — partial unique index on `stripe_payment_intent_id WHERE NOT NULL`
2. `CREATE OR REPLACE FUNCTION public.finalize_bhph_payment(p_token_id UUID, p_stripe_payment_intent TEXT, p_paid_at TIMESTAMPTZ)` — SECURITY DEFINER, SET search_path = '', RETURNS JSONB

### Function behavior

| Scenario | Return value |
|----------|--------------|
| Token status = 'pending', update succeeds | `{"ok": true}` |
| Token already paid by same PI (idempotent replay) | `{"already_processed": true}` |
| Token in unexpected state or paid by different PI | `{"conflict": true}` |
| Any exception | Re-raised (Postgres rolls back transaction) |

### Function signature (for Plan 02 to reference)
```sql
public.finalize_bhph_payment(
  p_token_id              UUID,
  p_stripe_payment_intent TEXT,
  p_paid_at               TIMESTAMPTZ DEFAULT now()
) RETURNS JSONB
```

## Deviations from Plan

None — plan executed exactly as written.
