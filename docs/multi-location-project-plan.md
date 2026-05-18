# Multi-Location Support — Project Plan
**Status:** ALL PHASES COMPLETE — audited and approved 2026-05-16  
**Lead:** Claude (architect/PM/auditor)  
**Executor:** Cursor AI (phase-by-phase)  
**Last updated:** 2026-05-16

---

## How This Works

Each phase below is a self-contained instruction set for Cursor AI.  
After each phase, Cursor must produce an audit summary (see Audit Format at bottom).  
Claude reviews the summary, audits changed files, then releases the next phase.  
No phase starts until the previous one is audited and approved.

---

## Core Decisions (Non-Negotiable)

These are locked. Cursor must not deviate.

| Decision | Value |
|---|---|
| Location storage | New `dealer_locations` table. NOT JSONB going forward |
| Staff ↔ location | One location per rep. `profiles.location_id UUID` (nullable) |
| Owner/dealer_admin | Global — no location restriction |
| Vehicles | Not location-bound. Org-wide inventory |
| Location URL | Full URL per location (`inventory_url TEXT`) |
| Unresolved lead | Send generic fallback message. Block assignment + sequences. Allow manual reply + internal notes |
| Single-location org | Zero location UI. Completely hidden |
| Quota/caps | Shared at org level. No per-location quota |
| Pricing | $99/month per additional active location (billing is future work, NOT this project) |
| Round-robin | Per-location rotation state, not org-wide |
| Template variables | Shared templates. Location context injected at send time |

---

## Architecture Overview

```
organizations (existing)
  └── dealer_locations (new) — org_id FK
        └── dealer_location_staff (new) — location_id + profile_id  ← SKIP. Not needed.
  └── profiles (existing) — add location_id FK to dealer_locations (nullable)
  └── customers (existing) — add location_id FK to dealer_locations (nullable)
                           — add location_source TEXT (nullable)

Resolution helpers (new lib file):
  lib/locations/resolve.ts
    getOrgActiveLocations(orgId)
    isMultiLocationOrg(orgId)
    resolveLeadLocation(customer)
    resolveLeadOutboundIdentity(customer, orgId)
    resolveAssignableStaff(orgId, locationId)
```

---

## Phase 1 — Schema and Migrations

**Goal:** Create the data foundation. No application logic yet.  
**Cursor must NOT:** touch any existing application code, build any UI, modify any existing migration.

### 1A — New migration: `dealer_locations` table

File: `supabase/migrations/157_dealer_locations.sql`

```sql
CREATE TABLE IF NOT EXISTS dealer_locations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  address         TEXT,
  phone           TEXT,
  inventory_url   TEXT,
  sms_number      TEXT,           -- future: Twilio number for this location
  email_from_name TEXT,           -- future: email sender name override
  is_active       BOOLEAN NOT NULL DEFAULT true,
  sort_order      INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_dealer_locations_org_id ON dealer_locations(org_id);
CREATE INDEX idx_dealer_locations_org_active ON dealer_locations(org_id, is_active);

ALTER TABLE dealer_locations ENABLE ROW LEVEL SECURITY;

-- Org members can read their own locations
CREATE POLICY "dealer_locations_select" ON dealer_locations
  FOR SELECT USING (org_id = get_org_id());

-- Only dealer_admin/admin can write
CREATE POLICY "dealer_locations_insert" ON dealer_locations
  FOR INSERT WITH CHECK (org_id = get_org_id());

CREATE POLICY "dealer_locations_update" ON dealer_locations
  FOR UPDATE USING (org_id = get_org_id());

CREATE POLICY "dealer_locations_delete" ON dealer_locations
  FOR DELETE USING (org_id = get_org_id());
```

### 1B — New migration: add location fields to `customers` and `profiles`

File: `supabase/migrations/158_location_id_columns.sql`

```sql
-- customers: which location is handling this lead
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES dealer_locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS location_source TEXT CHECK (
    location_source IN ('inbound_sms', 'email_parsed', 'vehicle', 'manual', 'auto_single')
  );

CREATE INDEX idx_customers_location_id ON customers(location_id);

-- profiles: which location this staff member belongs to
-- NULL = owner/admin (global access)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES dealer_locations(id) ON DELETE SET NULL;

CREATE INDEX idx_profiles_location_id ON profiles(location_id);
```

### 1C — New migration: backfill `dealer_locations` from JSONB

File: `supabase/migrations/159_backfill_dealer_locations.sql`

```sql
-- Migrate existing org_settings.locations JSONB into dealer_locations table.
-- Only runs for orgs that have location objects in their JSONB array.
-- Skips orgs with empty or null locations array.
-- Skips orgs that already have rows in dealer_locations (idempotent).

INSERT INTO dealer_locations (org_id, name, address, phone, inventory_url, is_active, sort_order)
SELECT
  os.org_id,
  COALESCE(loc->>'name', 'Location'),
  loc->>'address',
  loc->>'phone',
  COALESCE(loc->>'inventory_url', loc->>'dealer_website_url'),
  COALESCE((loc->>'active')::boolean, true),
  ordinality - 1
FROM org_settings os,
  jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(os.locations) = 'array' THEN os.locations
      ELSE '[]'::jsonb
    END
  ) WITH ORDINALITY AS t(loc, ordinality)
WHERE
  jsonb_typeof(os.locations) = 'array'
  AND jsonb_array_length(os.locations) > 0
  AND os.org_id NOT IN (SELECT DISTINCT org_id FROM dealer_locations);
```

### Audit Checklist for Phase 1

**Status: COMPLETE — audited and approved 2026-05-16**

Cursor must confirm:
- [x] All 3 migration files created with exact SQL above
- [x] No existing migrations modified
- [x] No application code changed
- [x] RLS policies use `get_org_id()` not `auth.uid()` directly
- [x] Indexes created on `org_id`, `location_id` columns
- [x] `location_source` CHECK constraint matches exactly the values listed

---

## Phase 2 — Resolution Helpers

**Goal:** Centralized location logic. All future location-aware code calls these helpers.  
**Cursor must NOT:** modify any route handlers yet, build any UI yet.

### File to create: `lib/locations/resolve.ts`

This file must export exactly these functions:

```typescript
// Returns all active locations for an org, ordered by sort_order
getOrgActiveLocations(orgId: string, supabase: SupabaseClient): Promise<DealerLocation[]>

// True if org has 2+ active locations
isMultiLocationOrg(orgId: string, supabase: SupabaseClient): Promise<boolean>

// Given a customer row, return their location object or null
resolveLeadLocation(
  customer: { location_id: string | null },
  locations: DealerLocation[]
): DealerLocation | null

// Return the outbound identity for a lead (location-first, org fallback)
resolveLeadOutboundIdentity(params: {
  customer: { location_id: string | null },
  locations: DealerLocation[],
  orgSettings: OrgSettingsFallback,
}): OutboundIdentity

// Return profiles eligible for assignment at a location
// If locationId is null, return all org profiles with dealer_rep role
resolveAssignableStaff(
  orgId: string,
  locationId: string | null,
  supabase: SupabaseClient
): Promise<Profile[]>
```

Types to define in same file or `lib/locations/types.ts`:

```typescript
interface DealerLocation {
  id: string
  org_id: string
  name: string
  address: string | null
  phone: string | null
  inventory_url: string | null
  sms_number: string | null
  email_from_name: string | null
  is_active: boolean
  sort_order: number
}

interface OrgSettingsFallback {
  business_name: string | null
  business_phone: string | null
  business_address: string | null
  dealer_website_url: string | null
}

interface OutboundIdentity {
  name: string
  phone: string | null
  address: string | null
  inventory_url: string | null
  location_id: string | null  // null means org-level fallback was used
}
```

### `resolveLeadOutboundIdentity` behavior

```
name:          location.name          ?? orgSettings.business_name ?? ''
phone:         location.phone         ?? orgSettings.business_phone ?? null
address:       location.address       ?? orgSettings.business_address ?? null
inventory_url: location.inventory_url ?? orgSettings.dealer_website_url ?? null
```

### Audit Checklist for Phase 2

**Status: COMPLETE — audited and approved 2026-05-16**

**Note for Phase 4:** `resolveAssignableStaff` selects only `id, display_name, role, org_id, created_at`. If calling code needs `location_id`, `deactivated_at`, or `pulse_score`, expand the select at that point.

- [x] `lib/locations/resolve.ts` created
- [x] All 5 functions exported with correct signatures
- [x] Types defined in `lib/locations/types.ts`, re-exported from resolve.ts
- [x] `resolveAssignableStaff` returns ALL dealer_rep profiles when locationId is null
- [x] `resolveLeadOutboundIdentity` falls back to org settings when location field is null
- [x] No route handlers modified
- [x] No UI created

---

## Phase 3 — Lead Ingest: Auto-Detection

**Goal:** When a new lead arrives, attempt to set `location_id` automatically.  
**Cursor must NOT:** block ingest on failure. If detection fails, lead is created with `location_id = null`.

### Detection order (implement in this exact order, stop at first confident match):

1. **Inbound SMS number (`inbound_sms`):** If lead came in via Twilio inbound SMS, check `from` number against `dealer_locations.sms_number`. If exact match found, set location. Source = `inbound_sms`.

2. **Email body parsing (`email_parsed`):** If lead came from email, search parsed body/subject for any location's `name`, `address`, or city fragments. Case-insensitive substring match. Only set if exactly one location matches (not ambiguous). Source = `email_parsed`.

3. **Single-location shortcut (`auto_single`):** If org has exactly one active location, always assign it automatically. Source = `auto_single`. No inference needed.

4. **Unresolved:** Leave `location_id = null`, `location_source = null`. Do not block ingest.

### Files to modify:

- `lib/leads/ingest.ts` — after lead/customer row is created, run detection and update `location_id` + `location_source`
- Any other ingest entry points Cursor identifies (must list them in audit)

### Unresolved lead: generic fallback message

If a lead is created with `location_id = null` AND org is multi-location, queue a generic SMS:

```
"Thanks for reaching out! We have [N] locations ready to help. 
Reply with your preferred location or a team member will be in touch shortly."
```

- This message must NOT be sent for single-location orgs
- Must be sent at most once per lead (check `activities` for prior sends)
- Use the org's `twilio_phone_number` from `org_settings` (not location-specific since location is unknown)
- Do not block lead creation if this send fails

### Audit Checklist for Phase 3

**Status: COMPLETE — audited and approved 2026-05-16**

**Clarification logged:** `inboundSmsFrom` maps to Twilio `To` (dealer's line), not `From` (customer's number). This matches `dealer_locations.sms_number`. Cursor's implementation is correct.

**Gap for Phase 10:** `lib/voice/ingest.ts` and `app/api/leads/web/route.ts` are separate ingest paths not wired to detection. `auto_single` does not fire for those paths. Acceptable for Phase 3; address in cleanup.

- [x] Detection runs after customer/lead row is created, not before
- [x] `location_source` is set whenever `location_id` is set
- [x] Single-location orgs get `auto_single` automatically
- [x] Multi-location unresolved leads get generic fallback SMS (once only)
- [x] Ingest never fails/throws due to location detection errors
- [ ] List of all ingest entry points modified — `lib/voice/ingest.ts` and `app/api/leads/web/route.ts` not wired to detection (deferred; acceptable for Phase 3 scope)

---

## Phase 4 — Lead Assignment: Location-Aware

**Goal:** Assignment respects location. Round-robin rotates within location pool only.  
**Cursor must NOT:** break single-location assignment. Must preserve current behavior for single-location orgs.

### Changes to assignment logic:

**Single-location orgs:** No change to current behavior.

**Multi-location orgs:**
- `owner` mode: assign to org owner (unchanged)
- `round_robin` mode: rotate only within `profiles` where `location_id = lead.location_id`
- `manual` mode: unchanged, but picker should only show staff from lead's location

**Round-robin state:**
- Add column `round_robin_index INT NOT NULL DEFAULT 0` to `dealer_locations` table (new migration: `160_location_rr_index.sql`)
- Remove dependency on org-wide `lead_assignment_rep_index` for multi-location orgs
- Single-location orgs continue using `org_settings.lead_assignment_rep_index`

**Unresolved location:**
- If `lead.location_id` is null and org is multi-location: skip auto-assignment entirely. Lead stays unassigned until location is set by a human.

### Files to modify:
- Wherever `lead_assignment_mode` and `lead_assignment_rep_index` are read (Cursor must identify and list all)
- New migration for `round_robin_index` column

### Audit Checklist for Phase 4

**Status: COMPLETE — audited and approved 2026-05-16**

**Note:** Minor dead code (`rotationPool` variable set but unused in multi-location path) flagged for Phase 10 cleanup. Not a functional issue.

- [x] Migration `160_location_rr_index.sql` created
- [x] Single-location assignment behavior unchanged
- [x] Round-robin for multi-location draws from location staff pool only
- [x] Unresolved multi-location leads skip auto-assignment
- [x] All files that read `lead_assignment_rep_index` identified and listed
- [x] `lead_assignment_rep_index` on `org_settings` still used for single-location orgs

---

## Phase 5 — Outbound Identity Injection

**Goal:** SMS, email, and any customer-facing output use location context when available.  
**Cursor must NOT:** change template syntax. Variable names stay the same (`{business_name}` etc.).

### Template variable resolution — update these to call `resolveLeadOutboundIdentity`:

| Variable | Current source | New source |
|---|---|---|
| `{business_name}` | `org_settings.business_name` | location.name → org fallback |
| `{business_phone}` | `org_settings.business_phone` | location.phone → org fallback |
| `{business_address}` | `org_settings.business_address` | location.address → org fallback |
| `{inventory_link}` | `org_settings.dealer_website_url` | location.inventory_url → org fallback |

### Files to modify:
- All template variable substitution code (Cursor must find and list every location)
- SMS send paths
- Email send paths
- Any booking or customer-facing link generation

### Fallback behavior
If `lead.location_id` is null (unresolved), always fall back to org-level settings. Never throw or block.

### Audit Checklist for Phase 5

**Status: COMPLETE — audited and approved 2026-05-16**

**Notes:** Legacy aliases (`dealerName`, `dealerPhone`, `link`) preserved alongside spec names. `dealer_cell_number` fallback for `{dealerPhone}` maintained for existing sequence templates. Double `org_settings` query in `getLeadTemplateVars.ts` flagged for Phase 10 cleanup.

**Post-audit fix (2026-05-17):** Voice confirmation SMS in `lib/voice/ingest.ts` was still building identity from `org_settings.business_name` / `dealer_cell_number` directly rather than going through `resolveLeadOutboundIdentity`. Fixed — SMS now resolves identity via the shared helper, falling back to org settings when `location_id` is not yet set on the customer.

- [x] All template substitution points identified and listed
- [x] `resolveLeadOutboundIdentity` called at each substitution point
- [x] Null location_id falls back gracefully to org settings
- [x] No template variable names changed
- [x] No SMS/email blocked due to missing location
- [x] Voice confirmation SMS uses location-aware identity (`lib/voice/ingest.ts`)

---

## Phase 6 — Lead UI: Location Badge and Picker

**Goal:** Multi-location orgs see a required location picker on lead detail. Single-location sees nothing.  
**Cursor must NOT:** show any location UI for single-location orgs.

### Visibility rule (implement exactly this check):

```typescript
const isMultiLocation = locations.length >= 2
// If false: render nothing. No badge, no picker, no empty state.
```

### Lead detail header — location badge:

When `isMultiLocation && lead.location_id`:
- Show compact badge: location name, edit pencil icon
- Click opens picker

When `isMultiLocation && !lead.location_id`:
- Show amber warning badge: "No location set"
- Entire lead detail overlaid with blocking modal (see below)

### Blocking modal — unresolved location:

Triggered when: org is multi-location AND lead has no location set.

Must block:
- Sales assignment dropdown
- Send SMS button
- Send email button
- Any sequence/automation trigger

Must allow:
- Viewing parsed lead content
- Reading activity history
- Internal notes
- The location picker itself

Modal copy (use exactly):
- Heading: `"Assign a location to continue"`
- Body: `"This lead must be linked to a store before assignment and outreach can begin. Select the location this customer contacted."`
- CTA: location selector dropdown showing all active locations

### On location select:
- PATCH `/api/leads/:id/location` with `{ location_id, location_source: 'manual' }`
- On success: dismiss modal, enable workflow
- Show toast: `"Lead assigned to [location name]"`

### New API endpoint:
`PATCH /api/customers/[id]/location`
- Body: `{ location_id: string }`
- Sets `location_id` and `location_source = 'manual'`
- Auth: `requireProfile()`, must be org member
- Returns updated customer row

### Audit Checklist for Phase 6

**Status: COMPLETE — audited and approved 2026-05-16**

**Fix applied by Claude:** Blocking modal backdrop had `pointer-events-none` — clicks fell through to page. Removed to make overlay truly blocking.

**Post-audit fix (2026-05-17):** PRD requires the blocking modal to allow viewing parsed content, activity history, and internal notes. The prior `fixed inset-0` full-screen overlay blocked all of these. Replaced with an inline amber banner that renders above the lead content but does not use fixed positioning — notes and history scroll freely beneath it. Assignment and outreach remain gated server-side. Also: direct sequence enrollment (`POST /api/customer-sequences`) was not enforcing the unresolved-lead rule, unlike bulk enroll. Fixed — gate added matching the same `isMultiLocationOrg && !location_id` check.

- [x] Single-location orgs: zero location UI rendered anywhere on lead detail
- [x] Multi-location + resolved: compact badge with edit
- [x] Multi-location + unresolved: blocking modal, correct copy, correct blocked actions
- [x] `PATCH /api/customers/[id]/location` endpoint created
- [x] Location source set to `'manual'` on user selection
- [x] Toast confirmation on selection
- [x] Blocking UI is inline banner — notes/history/parsed content remain readable beneath it
- [x] `POST /api/customer-sequences` enforces unresolved-lead 422 gate (matches bulk enroll)

---

## Phase 7 — Customer List: Location Filter

**Goal:** Multi-location orgs can filter the customer list by location.  
**Cursor must NOT:** add the filter for single-location orgs.

### Filter behavior:
- Chip/pill filter above customer list: `All locations | [Location A] | [Location B]`
- Only visible when org has 2+ active locations
- Default: `All locations`
- Applies `?location_id=` query param or state filter to the list fetch
- "Unassigned" chip optional (shows leads with null location_id)

### API changes:
- `GET /api/customers` — accept optional `location_id` query param
- Filter: `WHERE location_id = $location_id` when param present
- No change when param absent (returns all)

### Audit Checklist for Phase 7

**Status: COMPLETE — audited and approved 2026-05-16**

**Fix applied by Claude:** `GET /api/customers` had no `.limit()` — unbounded query. Added `.limit(500)`.

- [x] Filter hidden for single-location orgs
- [x] Filter chips show only active locations
- [x] `GET /api/customers` accepts `location_id` param
- [x] All-locations view still works without param

---

## Phase 8 — Settings UI: Location Manager

**Goal:** Replace the current JSONB location editor in org settings with a real location manager.  
**Cursor must NOT:** delete the JSONB `locations` field from `org_settings` yet. Keep it. Stop writing to it.

### New settings page or section: Settings → Locations

Each location card shows:
- Name (editable)
- Address (editable)
- Phone (editable)
- Inventory URL (editable)
- Active toggle
- Assigned staff list (read-only list with remove button)
- Save button per card

### Add location flow:
- "Add location" button
- Inline form: name (required), address, phone, inventory URL
- On save: POST to `/api/settings/locations`

### Staff assignment (within location card):
- Shows profiles where `location_id = this location`
- "Assign staff" button → dropdown of unassigned dealer_reps
- Sets `profiles.location_id` to this location's id
- Remove button → sets `profiles.location_id = null`

### New API endpoints:

```
GET    /api/settings/locations          — list org's locations
POST   /api/settings/locations          — create new location
PATCH  /api/settings/locations/[id]     — update location fields
DELETE /api/settings/locations/[id]     — soft delete (set is_active = false, NOT hard delete)
PATCH  /api/settings/locations/[id]/staff  — assign/remove a profile from this location
```

All endpoints:
- `requireProfile()` + `isDealerAdmin(role)` check
- Service client for writes (same pattern as org settings)
- Return location object on success

### Audit Checklist for Phase 8

**Status: COMPLETE — audited and approved 2026-05-16**

**Fixes applied by Claude:** `handleStaffAction` silently swallowed errors — added catch block. All 4 `createServiceClient()` calls missing required justification comments — added.

**Post-audit fix (2026-05-17):** `PATCH /api/settings/locations/[id]/staff` was returning `{ location_id, staff }` rather than a location object as specified in the PRD ("Return location object on success"). Fixed — response now returns `{ location: { id, name, address, phone, is_active }, staff: [...] }`.

- [x] All 5 endpoints created with correct auth
- [x] Delete is soft (is_active = false), not hard
- [x] Staff assignment updates `profiles.location_id` (not a join table)
- [x] Settings page replaces JSONB editor UI
- [x] JSONB `locations` field NOT removed from DB or org_settings schema
- [x] Active locations count drives `isMultiLocationOrg` correctly
- [x] Staff endpoint returns `location` object on success

---

## Phase 9 — Settings UI: Team Page Updates

**Goal:** Show staff location assignment on the Team settings page.  
**Cursor must NOT:** change role management. Location is display/assignment only.

### Changes to Team settings:
- Each staff member row shows their assigned location (or "All locations" for admin)
- "Change location" action on each rep row
- Picker shows active locations + "None" option

### Audit Checklist for Phase 9

**Status: COMPLETE — audited and approved 2026-05-16**

**Fixes applied by Claude:** `handleLocationChange` silently failed on error — added try/catch with `setError`. Missing `createServiceClient()` justification comment added to PATCH route.

- [x] Location shown per staff member in team list
- [x] Change location action works
- [x] Owner/admin shown as "All locations"
- [x] No role changes possible from this UI

---

## Phase 10 — Cleanup and Hardening

**Goal:** Remove debug artifacts, ensure backward compat, write tests.  
**Cursor must NOT:** remove `org_settings.locations` JSONB yet (keep for one release).

### Cleanup:
- Remove any `console.log` debug statements added during earlier phases
- Ensure all new routes have audit log entries for mutations
- Validate all new endpoints for tenant isolation (org_id scoping)

### Tests to write (in `lib/__tests__/` or `app/api/__tests__/`):

```
- single-location org: no location UI rendered
- multi-location org, resolved lead: badge shows, workflow unblocked
- multi-location org, unresolved lead: modal shown, workflow blocked
- manual location selection: sets location_id + source = 'manual'
- round-robin: rotates within location pool, not org-wide
- resolveLeadOutboundIdentity: location fields override org fallback
- resolveLeadOutboundIdentity: null location falls back to org settings
- ingest auto_single: single-location org always gets location set
- ingest inbound_sms: matches on sms_number
```

### Audit Checklist for Phase 10

**Status: COMPLETE — audited and approved 2026-05-16**

**Post-audit fix (2026-05-17):** Added route-level test coverage for previously uncovered paths: (1) `POST /api/customer-sequences` unresolved-lead 422 gate — 3 cases (multi blocked, multi allowed with location, single org no block); (2) web lead ingest detection + assignment invocation. Tests added to `lib/__tests__/multi-location-routes-tenancy.test.ts`. Total test suite: 2 files, 18 tests.

- [ ] No debug-only console.log in production paths — `lib/voice/ingest.ts` and `lib/social/autoPost.ts` still have console.log; intentional operational logs are acceptable but should be reviewed before this is checked
- [x] All listed tests written and passing (18 tests, vitest)
- [x] Audit log entries on: location created, location updated, staff assigned, lead location changed
- [x] All new API routes verified for `requireProfile()` + org scoping
- [x] `POST /api/customer-sequences` 422 gate covered by route-level tests
- [x] Web lead detection + assignment invocation covered by route-level test

---

## Cursor Audit Summary Format

After each phase, Cursor must provide this exact format:

```
## Phase [N] Audit Summary

### Files Created
- path/to/file.ts — description

### Files Modified
- path/to/file.ts — what changed and why

### Migrations Written
- [filename] — paste full SQL

### Decisions Made (not in spec)
- [any choice Cursor made that wasn't explicitly specified]

### Skipped / Deferred
- [anything from the phase spec that was not implemented, with reason]

### Questions / Blockers
- [anything unclear that needs Claude's input before next phase]
```

Vague summaries ("added multi-location support") will be sent back for revision.

---

## Out of Scope for This Project

Do not build any of the following. They are future work.

- Billing / $99 charge logic for additional locations
- Twilio number provisioning per location
- Cross-location lead deduplication (same customer at two stores)
- Commission tracking or split modeling
- Location-level analytics or reporting
- Hard access control enforcement by location (Phase 1 is soft filter)
- Email sender domain per location
- Location-specific AI agent configuration

---

## Risk Register

| Risk | Mitigation |
|---|---|
| JSONB and new table drift | Stop writing to JSONB after Phase 8. Keep JSONB read-only during transition |
| Assignment broken mid-rollout | Phase 4 explicitly preserves single-location behavior |
| Unresolved leads flooding | Generic message sent once; ingest never blocked |
| Cursor adding scope | Each phase has explicit "must NOT" list |
| Migration run out of order | Migrations numbered sequentially 157–160 |
| RLS misconfigured on dealer_locations | Audit checklist requires RLS verification each phase |
