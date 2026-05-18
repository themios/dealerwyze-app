# Multi-Location Lead Routing Plan

## Summary

This plan adds true multi-location support for dealers who operate more than one store under the same org. The core model is:

- one org
- one owner/global admin surface
- staff can belong to multiple locations
- each lead must have a location when the org has multiple active locations
- outbound identity and assignment resolve from the lead's selected location

Single-location dealers should see effectively no added complexity.

## Goals

- Support dealers with multiple stores under one org
- Ensure each lead is tied to the correct location before sales work proceeds
- Use location to drive staff assignment, outbound identity, and inventory links
- Keep the current simple experience for single-location dealers
- Reduce manual work through inference, but require explicit human choice when inference is unclear

## Product Decisions

- Vehicles are not required to belong to exactly one location
- Staff can belong to multiple locations
- Location-specific inventory links should be supported
- If a multi-location lead has no resolved location, the lead must be assigned a location before normal handling continues
- If the org has only one active location, location UI should stay hidden

## Current-State Constraints

Today the app still assumes mostly org-wide identity:

- `org_settings.business_name`
- `org_settings.business_phone`
- `org_settings.dealer_cell_number`
- `org_settings.dealer_website_url`

There is also an `org_settings.locations` JSON field, but it is currently lightweight reference data rather than a true operational model.

Lead assignment is currently org-wide and driven by:

- `org_settings.lead_assignment_mode`
- `org_settings.lead_assignment_rep_index`

That means the plan should migrate from:

- org-level defaults

to:

- lead-level location context
- location-aware staff pools
- location-aware outbound identity

## Target Architecture

The target model should be:

- `organization` remains the legal/account container
- `dealer_locations` becomes the operational store model
- `dealer_location_staff` maps users to one or more locations
- `customers.location_id` becomes the active servicing location for a lead
- lead assignment resolves within the selected location
- outbound name/phone/address/inventory link resolve from the selected location

## Phase 1: Data Model

Goal: introduce operational locations without breaking current behavior.

### New Table: `dealer_locations`

Recommended fields:

- `id`
- `org_id`
- `name`
- `address`
- `phone`
- `inventory_url`
- `is_active`
- `created_at`
- `updated_at`

Optional later:

- `email_from_name`
- `sms_number`
- `public_display_name`
- `sort_order`

### New Join Table: `dealer_location_staff`

Recommended fields:

- `location_id`
- `profile_id`
- `created_at`

This supports staff belonging to multiple locations.

### Lead-Level Location Fields

Add to `customers`:

- `location_id` nullable initially
- `location_source` text or enum
  - `parsed`
  - `vehicle`
  - `inbound`
  - `manual`
- optional `location_inference_meta` JSONB later if debugging is useful

### Backward Compatibility

Keep `org_settings.locations` temporarily during migration and rollout, but stop treating it as the long-term operational source of truth.

## Phase 2: Migration

Goal: move existing JSON location data into real location records.

### Backfill Strategy

- Create a one-time migration from `org_settings.locations` into `dealer_locations`
- For orgs with no locations in JSON, create no location rows and preserve current single-store behavior
- For orgs with one location, keep location UI hidden
- For orgs with two or more active locations, mark them as multi-location capable through derived behavior

### Fallback Identity

Keep these org-level settings as fallback defaults:

- `business_name`
- `business_phone`
- `dealer_cell_number`
- `dealer_website_url`

## Phase 3: Shared Backend Resolution Helpers

Goal: centralize location-aware logic.

Recommended helpers:

- `getOrgActiveLocations(orgId)`
- `isMultiLocationOrg(orgId)`
- `resolveLeadLocation(lead)`
- `resolveLeadOutboundIdentity(lead)`
- `resolveAssignableStaffForLocation(orgId, locationId)`

`resolveLeadOutboundIdentity(lead)` should return:

- store name
- phone
- address
- inventory URL

These helpers should be reused across SMS, email, booking, assignment, and any customer-facing output.

## Phase 4: Lead Assignment Logic

Goal: make assignment location-aware.

Today assignment is org-wide. The new model should be:

1. determine location if possible
2. assign from that location's eligible staff pool

### Rules

For single-location orgs:

- preserve current behavior

For multi-location orgs:

- if location is inferred confidently, assign immediately
- if location is unresolved, leave unassigned and block normal lead handling until location is selected

### Assignment Modes

Current modes should become location-aware:

- `owner`
- `round_robin`
- `manual`

For `round_robin`:

- rotate only within the staff pool eligible for the selected location
- do not rotate across the whole org

### Rotation State

Do not rely on one org-wide `lead_assignment_rep_index` across all stores.

Recommended options:

- per-location round-robin index on `dealer_locations`
- or a dedicated assignment state table keyed by `location_id`

## Phase 5: Location Inference

Goal: reduce manual work without forcing bad guesses.

Recommended inference order:

1. parsed email/body/store clue
2. VIN or matched vehicle clue
3. inbound source metadata later if available
4. otherwise unresolved

### Rule

- Only set a location automatically when confidence is strong
- Otherwise leave the lead unresolved and require a human choice

Store provenance in `location_source`.

## Phase 6: Lead UI

Goal: require location at the right moment without cluttering single-store dealers.

### Visibility Rules

If the org has zero or one active location:

- hide location UI entirely

If the org has two or more active locations:

- show a compact `Location` field in the lead header

### Required State

If location is unresolved:

- block normal lead workflow immediately when the lead is opened
- require the user to choose a location before continuing

This should block:

- sales assignment
- first response workflow
- outbound SMS/email/call actions
- automations that depend on assignee or store identity

This should still allow:

- viewing the lead
- reading parsed content
- internal notes
- selecting the location

### Suggested UX Copy

- `Choose location to continue`
- `This lead must be assigned to a store before assignment and response can continue.`
- `Used for phone, store details, inventory links, and assignment.`

## Phase 7: Settings UI

Goal: turn locations from passive data into operational configuration.

### Organization Settings

Replace the current JSON-style location editor with a real location manager.

Each location should support:

- name
- address
- phone
- inventory URL
- active toggle
- assigned staff

### Team Settings

Add staff-to-location mapping controls.

Rules:

- roles remain org-wide
- owner/global admin remains global
- staff may belong to multiple locations

## Phase 8: Outbound Identity

Goal: ensure customer-facing messages use the selected store context.

Outbound systems should resolve identity from lead location first:

- SMS templates
- email signatures
- inventory links
- booking/contact details
- store-specific business identity

### Behavior

- response templates stay shared across stores
- store variables resolve from the selected location

Examples:

- `{business_name}` -> location name first, org fallback second
- phone -> location phone first, org fallback second
- inventory link -> location inventory URL first, org fallback second

## Phase 9: API Surface

Goal: use explicit endpoints rather than overloading the settings blob.

Recommended endpoints:

- `GET /api/settings/locations`
- `POST /api/settings/locations`
- `PATCH /api/settings/locations/:id`
- `PATCH /api/settings/locations/:id/staff`
- `PATCH /api/leads/:id/location`
- optional `GET /api/leads/:id/location-context`

Avoid continuing to use `org_settings.locations` as the operational source once the new tables exist.

## Phase 10: Rollout Strategy

Goal: ship safely without destabilizing the current CRM flow.

Recommended order:

1. schema and backfill
2. shared location resolution helpers
3. settings endpoints and settings UI
4. lead header location UI with manual selection
5. unresolved-location blocking for multi-location orgs
6. location-aware assignment
7. location-aware outbound identity
8. smarter inference

### Gating

- gate new behavior by `active location count > 1`
- optionally add an internal feature flag for rollout safety

## Phase 11: Testing

Must cover:

- single-location org sees no added UI
- multi-location org with resolved lead opens normally
- multi-location org with unresolved lead is blocked on open
- manual location selection enables assignment and outbound
- staff mapped to multiple locations remain assignable
- round robin rotates only within the location pool
- outbound name/phone/link resolve from lead location
- org-level fallback works when location fields are blank
- JSON location migration creates usable location rows

## Risks

- letting old `org_settings.locations` JSON and new tables drift for too long
- breaking assignment before location staff pools are ready
- allowing unresolved leads into automations or outbound flows
- hard-coding vehicle-to-location ownership when shared inventory is allowed

## Recommended Release Strategy

### Release 1

- `dealer_locations`
- `dealer_location_staff`
- lead `location_id`
- settings UI for real locations
- manual location selection UI on leads
- unresolved-location blocking for multi-location orgs

### Release 2

- location-aware assignment
- location-aware outbound identity
- better inference from parsed content, VIN, and source metadata

This lets the first release solve the operational problem before waiting on more automation.

## Recommendation

Build this as a lead-centric operational model, not a cosmetic settings enhancement.

The most important principle is:

- for multi-location dealers, every lead must have a location before normal lead handling continues

That is what prevents assignment confusion, outbound identity mistakes, and staff friction.
