# API Security Hardening

Comprehensive security controls for DealerWyze and RealtyWyze APIs covering CORS validation, CSRF protection, request signing, and rate limiting.

---

## Overview

**Security Layers (Defense in Depth):**
1. **CORS Validation** — Prevent cross-origin requests from unauthorized domains
2. **CSRF Protection** — Verify Origin/Referer headers for state-mutating requests
3. **Request Signing** — Sign webhook callbacks to verify authenticity
4. **Rate Limiting** — Prevent brute-force and DoS attacks
5. **Input Validation** — Zod schemas at API boundaries
6. **Authentication** — `requireProfile()` + role-based access control

---

## CORS Validation

### Current Implementation

**Location:** `proxy.ts` (Edge Middleware)

```typescript
// POLICY 4: CSRF Protection
// For state-mutating requests to /api/*, verify Origin header matches request host.
const csrfExemptPrefixes = [
  '/api/stripe/webhook',
  '/api/twilio/inbound',
  '/api/voice/retell-callback',
  '/api/fax/webhook',
  '/api/telegram/webhook'
]
const isExempt = csrfExemptPrefixes.some(p => pathname.startsWith(p))

if (!isExempt && ['POST', 'PATCH', 'DELETE'].includes(method)) {
  const origin = req.headers.get('origin')
  const referer = req.headers.get('referer')
  const secFetchSite = req.headers.get('sec-fetch-site')

  // Reject if Origin/Referer does not match host
  const hostFromOrigin = origin ? new URL(origin).host : null
  const hostFromReferer = referer ? new URL(referer).host : null
  const currentHost = req.headers.get('host')

  if (secFetchSite === 'cross-site' && !origin?.includes(currentHost)) {
    return new NextResponse('CSRF validation failed', { status: 403 })
  }
}
```

**Protected Endpoints:**
- All POST, PATCH, DELETE `/api/*` routes (except webhooks)
- GET requests with side effects (data export)

**Exempt Endpoints:** (public/webhook routes)
- `/api/stripe/webhook` — Stripe signature verification
- `/api/twilio/inbound` — Twilio signature verification
- `/api/voice/retell-callback` — Retell webhook
- `/api/fax/webhook` — Fax webhook
- `/api/telegram/webhook` — Telegram webhook

---

## CSRF Token Strategy

### OAuth Flows (Gmail, Google Calendar)

**CSRF token** stored in `org_settings.gmail_oauth_csrf`:

```typescript
// Step 1: User initiates Gmail connection
POST /api/integrations/gmail/connect
  → Generate CSRF token
  → Store in org_settings (with 10-min expiry)
  → Return OAuth redirect URL

// Step 2: Google redirects back with authorization code
GET /api/integrations/gmail/callback?code=...&state=...
  → Verify CSRF token from state matches org_settings value
  → Exchange code for access token
  → Clear CSRF token from org_settings
```

**Pattern:** `org_settings.{service}_oauth_csrf` + `{service}_oauth_csrf_expires_at`

---

## Request Signing (Webhooks)

### Webhook Verification Pattern

Each inbound webhook **must** verify the sender's signature:

| Service | Header | Validation |
|---------|--------|------------|
| **Stripe** | `stripe-signature` | HMAC-SHA256(timestamp + payload, endpoint_secret) |
| **Twilio** | `x-twilio-signature` | HMAC-SHA1(base_url + body, auth_token) |
| **Retell** | `X-Retell-Signature` | HMAC-SHA256(request_body, api_key) |
| **Fax (Telnyx)** | `x-telnyx-signature` | HMAC-SHA256(body, api_key) |
| **Telegram** | Message hash | HMAC-SHA256(hash_func, api_key) |

### Example: Twilio Inbound

```typescript
// POST /api/twilio/inbound
import { validateTwilioSignature } from '@/lib/twilio/webhooks'

export async function POST(req: NextRequest) {
  const signature = req.headers.get('x-twilio-signature')
  const text = await req.text()

  const isValid = validateTwilioSignature(signature, text, {
    url: `${getBaseUrl()}/api/twilio/inbound`,
    token: process.env.TWILIO_AUTH_TOKEN!
  })

  if (!isValid) {
    await writeAuditLog({
      action: 'webhook_auth_failure',
      metadata: { service: 'twilio', reason: 'invalid_signature' }
    })
    return forbidden()
  }

  // Safe to process webhook
  return handleTwilioInbound(text)
}
```

### Adding New Webhooks

**Checklist:**
- [ ] Get signature secret from service provider
- [ ] Store secret in `.env.production` (never in code)
- [ ] Implement validation function in `lib/{service}/webhooks.ts`
- [ ] Validate signature before processing payload
- [ ] Log auth failures via `writeAuditLog(action: 'webhook_auth_failure')`
- [ ] Test with curl + known-good payload

---

## Rate Limiting

### Current Implementation

**Location:** `lib/rateLimit/upstash.ts` (Upstash Redis)

**Rate Limits by Endpoint:**

| Endpoint | Limit | Window | Per |
|----------|-------|--------|-----|
| POST /api/sms/send | 100 | 60 sec | org |
| POST /api/auth/login | 5 | 60 sec | IP |
| POST /api/auth/register | 3 | 3600 sec | IP |
| GET /api/data | 1000 | 3600 sec | org |
| POST /api/data | 100 | 60 sec | org |

### Middleware Integration

Implement rate limiting on critical paths:

```typescript
// POST /api/sms/send
import { orgSmsLimiter } from '@/lib/rateLimit/upstash'

export async function POST(req: NextRequest) {
  const profile = await requireProfile()
  const limit = await orgSmsLimiter(profile.org_id)

  if (!limit.allowed) {
    const waitSecs = Math.ceil(limit.retryAfterSeconds)
    return NextResponse.json(
      { error: `Rate limited. Try again in ${waitSecs}s.` },
      { status: 429, headers: { 'Retry-After': String(waitSecs) } }
    )
  }

  // Process SMS...
}
```

---

## Input Validation

### Zod Schema Pattern

All public/user-supplied input **must** be validated:

```typescript
// Good: Zod schema at API boundary
const CreateCustomerSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email().optional(),
  phone: z.string().regex(/^\+?[0-9\-\(\) ]{10,}$/).optional(),
})

export async function POST(req: NextRequest) {
  const body = await req.json()
  const validated = CreateCustomerSchema.parse(body) // Throws on invalid

  // Use validated...
}

// Bad: No validation
export async function POST(req: NextRequest) {
  const body = await req.json()
  const customer = await db.insert('customers', body) // Unsafe!
}
```

### Common Validations

- **Emails:** `z.string().email()`
- **Phone:** `z.string().regex(/^\+?[0-9\-\(\) ]{7,}$/)`
- **URLs:** `z.string().url()`
- **UUID:** `z.string().uuid()`
- **Dates:** `z.string().datetime()` or custom date parser
- **Enums:** `z.enum(['active', 'inactive'])`
- **Strings:** `z.string().min(1).max(1000)`

---

## API Key Management

### Secret Storage

**DO:**
- Store secrets in `.env.production` (never in git)
- Use `process.env.SECRET_NAME` in server-side code only
- Rotate secrets quarterly
- Never log secrets (redact in error messages)

**DON'T:**
- Hardcode secrets in source code
- Expose secrets in error responses
- Log API requests that contain secrets
- Commit `.env.*` files to git

### Secret Validation

```typescript
// lib/env/validate.ts
const REQUIRED_SECRETS = [
  'TWILIO_AUTH_TOKEN',
  'STRIPE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'RESEND_API_KEY',
]

for (const secret of REQUIRED_SECRETS) {
  if (!process.env[secret]) {
    throw new Error(`Missing required secret: ${secret}`)
  }
}
```

---

## Response Security

### No Information Leakage

**DO:**
```typescript
// Safe: Generic error message
return NextResponse.json({ error: 'Not found' }, { status: 404 })

// Safe: Don't expose internal IDs for auth checks
if (!scope.includes(org_id)) {
  return NextResponse.json({ error: 'Not found' }, { status: 404 })
}
```

**DON'T:**
```typescript
// Unsafe: Reveals system info
return NextResponse.json(
  { error: `Org ${org_id} not found in vertical ${vertical}` },
  { status: 404 }
)

// Unsafe: Stack trace
return NextResponse.json(
  { error: error.stack },
  { status: 500 }
)
```

### Security Headers

**Currently set by Vercel:**
- `Strict-Transport-Security: max-age=63072000` (HSTS)
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 1; mode=block`

**Set in `next.config.ts` if needed:**
```typescript
headers: [
  {
    source: '/api/(.*)',
    headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-XSS-Protection', value: '1; mode=block' },
    ],
  },
],
```

---

## Authentication & Authorization

### Profile Requirement

Every authenticated API route **must** call `requireProfile()`:

```typescript
export async function GET(req: NextRequest) {
  // REQUIRED: Check auth
  const profile = await requireProfile()
  if (!profile) return unauthorized()

  const orgId = profile.org_id // Use authenticated org, not request
  // ...
}
```

**Never trust request-supplied org_id.** Always use `profile.org_id`.

### Role-Based Access Control

```typescript
export async function DELETE(req: NextRequest) {
  const profile = await requireProfile()

  if (!canDeleteUsers(profile.role)) {
    return forbidden()
  }

  // Safe to delete...
}
```

---

## Compliance & Audit

### Audit Logging Requirements

Critical mutations **must** be logged via `writeAuditLog()`:
- User role changes
- Payment confirmations
- Data deletions
- Impersonation start/end
- Webhook auth failures

```typescript
await writeAuditLog({
  orgId: profile.org_id,
  actorId: profile.id,
  actorType: 'user',
  action: 'user_role_changed',
  metadata: { from_role: 'agent', to_role: 'admin' },
  ipAddress: req.headers.get('x-forwarded-for'),
})
```

---

## Security Testing

### Pre-Launch Checklist

- [ ] **CORS:** Test cross-origin request rejection (curl with Origin header)
- [ ] **CSRF:** Verify state-mutating requests require valid Origin
- [ ] **Webhook signing:** Test invalid signatures are rejected
- [ ] **Rate limiting:** Verify limits enforce per org/IP
- [ ] **Auth checks:** Confirm all routes call `requireProfile()`
- [ ] **Input validation:** Test invalid data is rejected (Zod)
- [ ] **Error responses:** Verify no secrets/stack traces leaked
- [ ] **Audit logging:** Check critical actions are logged

### Test Commands

```bash
# CORS/CSRF: Cross-origin POST should fail
curl -X POST https://dealerwyze.com/api/customers/create \
  -H "Origin: https://attacker.com" \
  -H "Content-Type: application/json" \
  -d '{"name":"test"}' \
  # Expected: 403 Forbidden (CSRF validation failed)

# Webhook auth: Invalid signature should fail
curl -X POST https://dealerwyze.com/api/stripe/webhook \
  -H "stripe-signature: invalid" \
  -d '{"type":"payment_intent.succeeded"}' \
  # Expected: 403 Forbidden

# Rate limiting: Exceed limit
for i in {1..6}; do
  curl -X POST https://dealerwyze.com/api/auth/login \
    -d '{"email":"test@example.com","password":"test"}'
done
# Expected: 5th request succeeds, 6th gets 429 Too Many Requests

# Input validation: Invalid email
curl -X POST https://dealerwyze.com/api/customers/create \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"test","email":"invalid"}' \
  # Expected: 400 Bad Request (email validation failed)
```

---

## Threats & Mitigations

| Threat | Mitigation | Status |
|--------|-----------|--------|
| **CSRF** | Origin/Referer validation in proxy.ts | ✅ Implemented |
| **Webhook spoofing** | Signature verification per service | ✅ Implemented |
| **Brute-force auth** | Rate limiting (5 attempts/60s per IP) | ✅ Implemented |
| **SQL injection** | Supabase RLS + Zod input validation | ✅ Implemented |
| **XSS** | CSP headers, Next.js built-in escaping | ✅ Implemented |
| **Privilege escalation** | Role checks in auth helpers | ✅ Implemented |
| **Data leak via error** | Generic error responses | ✅ Implemented |
| **Replay attacks** | Webhook idempotency + timestamps | ⚠️ Partial |
| **Account takeover** | MFA, session rotation | ⚠️ Planned |
| **API key exposure** | Secret rotation, audit logging | ⚠️ Partial |

---

## References

- [proxy.ts](../proxy.ts) — CSRF protection middleware
- [lib/auth/profile.ts](../lib/auth/profile.ts) — Authentication
- [lib/rateLimit/upstash.ts](../lib/rateLimit/upstash.ts) — Rate limiting
- [OWASP Top 10](https://owasp.org/www-project-top-ten/) — Security guidelines

---

## Quarterly Security Audit

- [ ] Review rate limit thresholds (under attack? raise limits)
- [ ] Rotate API secrets (Twilio, Stripe, etc.)
- [ ] Audit failed webhook auth attempts (log analysis)
- [ ] Penetration test (internal CSRF, auth bypass, data leaks)
- [ ] Update dependencies (security patches)
- [ ] Review secrets in logs (grep .env variables)

