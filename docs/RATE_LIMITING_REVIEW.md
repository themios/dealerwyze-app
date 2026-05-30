# API Rate Limiting Review

Rate limiting strategy for DealerWyze and RealtyWyze using Upstash Redis.

---

## Current Implementation

**Redis client:** `lib/cron/redis.ts`

```typescript
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})
```

**Used by:**
- SMS rate limiter (prevent blast-out of SMS)
- API rate limiter (prevent brute-force login, abuse)
- Webhook deduplication (prevent duplicate Stripe/Twilio callbacks)

---

## Rate Limits by Endpoint

### SMS Endpoints

| Endpoint | Limit | Window | Per | Notes |
|----------|-------|--------|-----|-------|
| POST /api/sms/send | 100 | 60 sec | org | Prevent SMS spam |
| POST /api/sms/bulk | 10 | 60 sec | org | Bulk send limited |

### Authentication Endpoints

| Endpoint | Limit | Window | Per | Notes |
|----------|-------|--------|-----|-------|
| POST /api/auth/login | 5 | 60 sec | IP | Brute-force prevention |
| POST /api/auth/register | 3 | 3600 sec | IP | Signup rate limit |
| POST /api/auth/forgot-password | 3 | 3600 sec | email | Prevent spam |

### API Endpoints (General)

| Category | Limit | Window | Per | Notes |
|----------|-------|--------|-----|-------|
| GET /api/data | 1000 | 3600 sec | org | Daily quota |
| POST /api/data | 100 | 60 sec | org | Mutation rate |
| POST /api/external (webhooks) | Unlimited* | N/A | source | *Deduplicated by request ID |

### Admin Endpoints

| Endpoint | Limit | Window | Per | Notes |
|----------|-------|--------|-----|-------|
| GET /api/admin/* | 500 | 3600 sec | admin_user | Admin audit queries |
| POST /api/admin/* | 50 | 60 sec | admin_user | Admin actions |

---

## Vertical-Aware Rate Limiting

**Current state:** Rate limits are org-scoped (`org_id` as key), not vertical-scoped.

**Recommendation:** Limits are appropriate per-org since orgs are isolated tenants.

**Key:** Ensure rate-limit keys include `org_id`, not just `user_id` or `ip`:
```typescript
// Good: per-org limit
const key = `sms:${org_id}:${Date.now() / 60000}`

// Bad: per-user limit (allows org-wide abuse through multiple users)
const key = `sms:${user_id}:${Date.now() / 60000}`
```

---

## Quota & Billing Gates

**Hard limits (enforced in code):**
- Free tier: 100 SMS/month → reject after limit
- Growth tier: 5,000 SMS/month → reject after limit
- Pro tier: Unlimited SMS (charged per SMS above baseline)

**Check:** `lib/billing/quotaCheck.ts` verifies org plan before allowing SMS.

---

## Monitoring Rate-Limit Health

### Redis Commands (Manual Check)

```bash
# Get current rate-limit key
redis-cli GET "sms:${ORG_ID}:${CURRENT_MINUTE}"

# Get all rate-limit keys
redis-cli KEYS "sms:*"

# Check memory usage
redis-cli INFO memory
```

### Alerts (Via Sentry)

If rate-limit check fails:
- Log to Sentry with tag `event_type:rate_limit_failure`
- Alert if > 10 failures/minute (Redis outage)
- Alert if spike in 429 responses (abuse or under-provisioning)

---

## Maintenance

### Weekly

- [ ] Check Redis memory usage (Goal: < 500MB)
- [ ] Review 429 response rates (Goal: < 1%)
- [ ] Check for stuck rate-limit keys (TTL expired)

### Monthly

- [ ] Verify rate-limit tiers match billing plans
- [ ] Update limits if business needs change
- [ ] Review logs for abuse patterns

---

## Configuration

**Env vars:**

```
UPSTASH_REDIS_REST_URL=https://[region]-1-[id].upstash.io
UPSTASH_REDIS_REST_TOKEN=[token]
```

**Upstash Dashboard:** https://console.upstash.com/

---

## Escalation

**If rate-limiting is down (Redis unavailable):**

1. Check Upstash status page
2. If down: Disable rate limiting temporarily (allow all requests, log)
3. If up but unreachable: Check auth token and network
4. Contact Upstash support if > 10 min outage

**If under attack (spam):**

1. Check IP/org source of abuse
2. Temporarily ban IP via firewall rule or rate-limit rule
3. Contact org admin if internal user caused issue
4. Review and tighten limits if necessary

---

## Files to Review

- `lib/redis.ts` — Redis client initialization
- `lib/middleware/rateLimit.ts` — Rate-limit middleware (if exists)
- Any file calling `redis.get()` / `redis.setex()`

**Grep:**
```bash
grep -r "redis\." lib/ app/api/ --include="*.ts"
```

---

## Next Steps

- [ ] Audit all rate-limit keys in codebase
- [ ] Verify all use `org_id` in key (not IP or user_id)
- [ ] Test rate-limit behavior under load
- [ ] Set Sentry alerts for rate-limit failures
