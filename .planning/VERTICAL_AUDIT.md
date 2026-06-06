# Vertical Isolation Audit

## Issues Found

### 1. app/(app)/settings/users/page.tsx

**Problems:**
- Line 30: RE_ROLE_DESCRIPTIONS still uses "dealer_*" prefix
- Line 28: Mentions "inventory" (dealer-specific) should be "listings" for RE
- Line 36: Mentions "clients, listings" but roles are still labeled "dealer_*"
- Line 42: INVITE_ROLES hardcoded with dealer_* roles
- Line 91: Default role set to 'dealer_rep'
- Line 181: Default role set to 'dealer_staff'
- Line 260-261: "New Lead Assignment" should be "New Client/Prospect Assignment" for RE
- Line 380: "assigned lead" should vary by vertical

**Severity:** HIGH - User-facing copy is dealer-centric for RealtyWyze

### 2. app/(app)/settings/appearance/page.tsx

**Problems:**
- Hardcoded theme preset name 'dealerwyze' should be vertical-aware

**Severity:** MEDIUM

### 3. app/(app)/vehicles/new/page.tsx  

**Problems:**
- Line: "100-vehicle limit for the free beta tier" - this is DealerWyze-specific
- Should not appear in RealtyWyze or should reference "listings" instead

**Severity:** MEDIUM (may not be reached by RE but bad if it is)

## Recommended Fixes

All marked for immediate implementation.
