# MLS Bridge API Integration Guide

## Overview

RealtyWyze agents can automatically sync their MLS listings from Bridge Interactive. This guide covers the architecture, setup, testing, and deployment.

## Architecture

### Data Flow

```
Agent Profile (MLS Config)
  ↓
Daily Cron Job (6 AM) / Manual Sync Trigger
  ↓
Bridge API (getListings)
  ↓
RealtyWyze Sync Endpoint (/api/integrations/mls/sync)
  ↓
Vehicles Table (INSERT/UPDATE)
  ↓
Async Photo Download (background job)
  ↓
Public IDX Feed (listings page)
```

### Key Tables

- **profiles**: MLS configuration per agent (mls_board_id, bridge_agent_id, bridge_api_key, mls_license_number)
- **vehicles**: Listings with MLS fields (mls_number, mls_board_id, mls_synced_at, mls_source, price_history, dom, listing_status)
- **mls_sync_log**: Audit trail of sync operations (success/failure, count, errors)
- **webhook_idempotency**: Prevents duplicate webhook processing

### API Endpoints

#### POST /api/integrations/mls/sync
Trigger MLS listing sync for an agent.

**Authenticated**: YES (requireProfile)

**Request Body** (all optional if configured in profile):
```json
{
  "agentId": "agent@example.com",
  "boardId": "socal_mls",
  "apiKey": "bridge_api_key_..."
}
```

**Response**:
```json
{
  "success": true,
  "listings_fetched": 150,
  "listings_created": 45,
  "listings_updated": 105,
  "errors": [],
  "timestamp": "2026-05-31T14:30:00Z"
}
```

#### POST /api/webhooks/bridge
Receive real-time updates from Bridge when listings change.

**Authentication**: Signature header validation (x-bridge-signature)

**Webhook Events**:
- `listing.created` — new listing added
- `listing.updated` — listing data changed
- `price.changed` — price updated
- `status.changed` — listing status changed (active → pending → sold)
- `photos.added` — new photos uploaded

**Deduplication**: Webhook payloads hashed and stored in webhook_idempotency table. Retries are ignored.

#### GET /api/integrations/mls/comps (STUB)
Comparable listings lookup (post-GA).

Currently returns 501 Not Implemented. Will be implemented after GA when Bridge Comps API access is confirmed.

## Setup Steps

### 1. Agent Creates Bridge Developer Account

1. Go to https://developer.bridge.realogy.com/
2. Sign up for free account
3. Create sandbox app (for testing)
4. Get sandbox API key
5. Note: Production API key obtained after MLS board approval

### 2. Agent Configures MLS in Profile

Fields to set on agent's profile:
- **mls_board_id**: MLS board identifier (e.g., "socal_mls", "bay_area_mls")
- **bridge_agent_id**: Agent's ID on Bridge (usually email)
- **bridge_api_key**: Bridge API key (will be encrypted in Supabase Vault once implemented)
- **mls_license_number**: Agent's MLS license (for compliance)

### 3. Trigger First Sync

Either:
- Call POST /api/integrations/mls/sync (authenticated)
- Or wait for daily cron job (6 AM UTC)

### 4. Verify Listings Created

Check vehicles table:
```sql
SELECT id, mls_number, address_line1, price, mls_synced_at
FROM vehicles
WHERE org_id = {agent_org_id} AND mls_number IS NOT NULL
ORDER BY mls_synced_at DESC;
```

### 5. Check Public IDX Feed

Visit public site: `https://realtywyze.us/{agent_slug}/listings`

MLS listings should appear first, sorted by mls_synced_at DESC.

## Testing

### Sandbox Testing

Use Bridge sandbox credentials:
- Base URL: https://api.bridgeinteractive.dev/
- API key: Provided in sandbox app settings
- Test MLS board: "sandbox_mls" or similar
- Test agent ID: Your sandbox account email

### Manual Test Workflow

1. **Create test org**:
   ```sql
   INSERT INTO organizations (name, vertical, slug) 
   VALUES ('Test RE Agency', 'real_estate', 'test-agency')
   RETURNING id;
   ```

2. **Set up test agent profile**:
   ```sql
   UPDATE profiles 
   SET mls_board_id = 'sandbox_mls',
       bridge_agent_id = 'test@example.com',
       bridge_api_key = 'sk_test_...'
   WHERE id = {agent_id};
   ```

3. **Call sync endpoint**:
   ```bash
   curl -X POST https://staging.realtywyze.us/api/integrations/mls/sync \
     -H "Authorization: Bearer {auth_token}" \
     -H "Content-Type: application/json" \
     -d '{}'
   ```

4. **Verify listings created**:
   ```bash
   curl https://staging.realtywyze.us/api/integrations/mls/sync \
     -H "Authorization: Bearer {auth_token}" | jq .
   ```

5. **Visit public IDX**:
   ```
   https://staging.realtywyze.us/test-agency/listings
   ```

### Webhook Testing

Bridge sandbox supports webhook registration. To test:

1. Go to Bridge developer dashboard
2. Register webhook URL: `https://realtywyze.us/api/webhooks/bridge`
3. Set webhook secret (match BRIDGE_WEBHOOK_SECRET env var)
4. Manually update a listing in Bridge sandbox
5. Verify webhook is received:
   ```sql
   SELECT * FROM mls_sync_log 
   ORDER BY synced_at DESC LIMIT 5;
   ```

## Environment Variables

```bash
# Bridge API base URL (defaults to sandbox)
BRIDGE_API_BASE=https://api.bridgeinteractive.dev/

# Webhook signature secret
BRIDGE_WEBHOOK_SECRET=whsec_...

# Optional: Service account for async photo downloads
SUPABASE_STORAGE_KEY=...
```

## Cron Job

**Schedule**: 0 6 * * * (6 AM UTC, every day)

**Behavior**:
- Fetch all agents with mls_board_id and bridge_api_key configured
- For each agent, call Bridge API to fetch listings
- Upsert listings to vehicles table
- Log results to mls_sync_log

**Monitoring**:
- Check `mls_sync_log` table for failures
- Monitor API error rate (excessive 401 = API key expired)
- Alert on unusually low or high listing counts (possible API issue)

## Photo Handling

**Current (MVP)**:
- Bridge listing URLs stored in vehicles.photos as JSON objects
- Photos not automatically downloaded (to avoid blocking)
- Photos queued for async download (job stubs in queue)

**Future (Post-GA)**:
- Implement async photo downloader (Bull queue, Cloudflare Durable Objects, etc.)
- Store photos in Supabase Storage
- Update vehicles.photos with signed URLs
- Implement photo gallery on public IDX page

## MLS Board Approval (Deferred to Customer)

**Timeline**: When first paying agent signs up

**Process**:
1. Agent provides: MLS board name, license number, broker info
2. You (or agent) file Bridge API access request with MLS board
3. MLS board reviews and approves (1–2 weeks typically)
4. Bridge issues production API key
5. Agent updates profile with production API key
6. Sync activates on production data

**For GA**: Full code ready. Approval filing deferred until paying customer needs it.

## Security Considerations

### Data Isolation

- MLS listings stored in vehicles table (multi-tenant)
- RLS policies enforce agent ownership (agent can only see their own org's listings)
- Service role used only for cron jobs and webhook processing

### API Key Management

- API keys stored in profiles (future: encrypt in Supabase Vault)
- Never logged or exposed in error responses
- Rotate keys annually or if compromised

### Webhook Signature Validation

- All Bridge webhooks must include x-bridge-signature header
- Computed using HMAC-SHA256 with BRIDGE_WEBHOOK_SECRET
- Timing-safe comparison to prevent timing attacks

### Rate Limiting

- Bridge API typically allows 1000 requests/minute
- No additional rate limiting needed for MVP (cron job 1x/day per agent)
- Future: Add Upstash Redis rate limiting if webhook traffic grows

## Troubleshooting

### "Bridge API error: 401 Unauthorized"
- API key expired or invalid
- Check BRIDGE_WEBHOOK_SECRET matches Bridge dashboard
- Verify mls_board_id is correct

### "Failed to create listing: duplicate MLS number"
- MLS number already exists for same agent/board
- Update query should handle this (ON CONFLICT mls_number)
- Check mls_board_id matches

### "Webhooks not firing"
- Verify webhook URL registered in Bridge dashboard
- Check webhook secret matches BRIDGE_WEBHOOK_SECRET
- Test with curl: Bridge logs should show POST attempts

### Photos not downloading
- Photo download queued but job not running
- Check queue implementation (stub in sync endpoint)
- Manual trigger: Call /api/integrations/mls/sync with agent's credentials

## Future Enhancements

### Phase 2 (Post-GA)
- Async photo downloader with Supabase Storage integration
- Comps lookup endpoint (similar listings by price/beds/baths/location)
- Price history chart on public IDX page
- Agent matching (which agents are showing similar listings)

### Phase 3 (Post-Q2)
- Multi-MLS board support per agent
- Bulk MLS board setup (team/broker level)
- Custom field mapping (agent-specific field preferences)
- Listing template customization (branding, copy, photos)

## References

- [Bridge Interactive API Docs](https://bridge.realogy.com/api)
- [Bridge Developer Portal](https://developer.bridge.realogy.com/)
- [Schema.org RealEstateItem](https://schema.org/RealEstateProperty)
- [Next.js Dynamic Routes](https://nextjs.org/docs/app/building-your-application/routing/dynamic-routes)
