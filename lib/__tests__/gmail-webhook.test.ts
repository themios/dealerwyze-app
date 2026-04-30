/**
 * Gmail push webhook handler tests
 *
 * Tests the four OIDC verification checks and audit log behavior
 * without hitting Google's real token endpoint.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))

// ── Hoisted mocks (must be declared before vi.mock calls) ───────────────────
const { mockGetPayload, mockVerifyIdToken, mockMaybeSingle, mockLogOrgAudit } = vi.hoisted(() => ({
  mockGetPayload: vi.fn(),
  mockVerifyIdToken: vi.fn(),
  mockMaybeSingle: vi.fn(),
  mockLogOrgAudit: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('google-auth-library', () => {
  class OAuth2Client {
    verifyIdToken = mockVerifyIdToken
  }
  return { OAuth2Client }
})

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: () => ({
      insert: vi.fn().mockResolvedValue({ error: null }),
      select: () => ({
        eq: () => ({ eq: () => ({ not: () => ({ or: () => ({ maybeSingle: mockMaybeSingle }) }) }) }),
      }),
    }),
  }),
}))

vi.mock('@/lib/audit/orgAudit', () => ({ logOrgAudit: mockLogOrgAudit }))

vi.mock('@/lib/gmail/processHistory', () => ({ processGmailHistory: vi.fn().mockResolvedValue(undefined) }))

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: (fn: () => Promise<void>) => { void fn() } }
})

import { handleGmailPushWebhook } from '@/lib/gmail/pushWebhook'

// ── Helpers ──────────────────────────────────────────────────────────────────

const AUDIENCE = 'https://dealerwyze.com/api/gmail/webhook'

function makeValidPayload() {
  const data = Buffer.from(JSON.stringify({ emailAddress: 'user@example.com', historyId: 12345 })).toString('base64')
  return JSON.stringify({ message: { data, messageId: 'msg1', publishTime: new Date().toISOString() } })
}

function makeRequest(authHeader: string | null, body = makeValidPayload()): NextRequest {
  return new NextRequest(AUDIENCE, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(authHeader ? { authorization: authHeader } : {}),
    },
    body,
  })
}

function mockValidOidc(email = 'gmail-pubsub-push@dealerwyze.iam.gserviceaccount.com') {
  mockGetPayload.mockReturnValue({
    iss: 'https://accounts.google.com',
    email,
    email_verified: true,
  })
  mockVerifyIdToken.mockResolvedValue({ getPayload: mockGetPayload })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_APP_URL = 'https://dealerwyze.com'
  process.env.GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL = 'gmail-pubsub-push@dealerwyze.iam.gserviceaccount.com'
  mockMaybeSingle.mockResolvedValue({ data: null, error: null })
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Gmail push webhook — OIDC verification', () => {
  it('returns 401 and writes audit log when authorization header is missing', async () => {
    const res = await handleGmailPushWebhook(makeRequest(null), '/api/gmail/webhook')
    expect(res.status).toBe(401)
    expect(mockLogOrgAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'gmail_webhook_auth_failure', actor_type: 'webhook', org_id: null }),
    )
  })

  it('returns 401 when Bearer token fails OIDC verification (throws)', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('Token signature invalid'))
    const res = await handleGmailPushWebhook(makeRequest('Bearer bad-token'), '/api/gmail/webhook')
    expect(res.status).toBe(401)
    expect(mockLogOrgAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'gmail_webhook_auth_failure' }),
    )
  })

  it('returns 401 when issuer is not a Google issuer', async () => {
    mockGetPayload.mockReturnValue({
      iss: 'https://evil.example.com',
      email: 'gmail-pubsub-push@dealerwyze.iam.gserviceaccount.com',
      email_verified: true,
    })
    mockVerifyIdToken.mockResolvedValue({ getPayload: mockGetPayload })
    const res = await handleGmailPushWebhook(makeRequest('Bearer token'), '/api/gmail/webhook')
    expect(res.status).toBe(401)
  })

  it('returns 401 when email does not match expected service account', async () => {
    mockGetPayload.mockReturnValue({
      iss: 'https://accounts.google.com',
      email: 'wrong-account@other-project.iam.gserviceaccount.com',
      email_verified: true,
    })
    mockVerifyIdToken.mockResolvedValue({ getPayload: mockGetPayload })
    const res = await handleGmailPushWebhook(makeRequest('Bearer token'), '/api/gmail/webhook')
    expect(res.status).toBe(401)
  })

  it('returns 401 when email_verified is false', async () => {
    mockGetPayload.mockReturnValue({
      iss: 'https://accounts.google.com',
      email: 'gmail-pubsub-push@dealerwyze.iam.gserviceaccount.com',
      email_verified: false,
    })
    mockVerifyIdToken.mockResolvedValue({ getPayload: mockGetPayload })
    const res = await handleGmailPushWebhook(makeRequest('Bearer token'), '/api/gmail/webhook')
    expect(res.status).toBe(401)
  })

  it('returns 200 and does NOT write auth_failure audit when OIDC is valid', async () => {
    mockValidOidc()
    const res = await handleGmailPushWebhook(makeRequest('Bearer valid-token'), '/api/gmail/webhook')
    expect(res.status).toBe(200)
    expect(mockLogOrgAudit).not.toHaveBeenCalledWith(
      expect.objectContaining({ action: 'gmail_webhook_auth_failure' }),
    )
  })

  it('returns 200 when payload is missing (no data field)', async () => {
    mockValidOidc()
    const emptyBody = JSON.stringify({ message: {} })
    const res = await handleGmailPushWebhook(makeRequest('Bearer valid-token', emptyBody), '/api/gmail/webhook')
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
  })

  it('accepts accounts.google.com as a valid issuer (without https:// prefix)', async () => {
    mockGetPayload.mockReturnValue({
      iss: 'accounts.google.com',
      email: 'gmail-pubsub-push@dealerwyze.iam.gserviceaccount.com',
      email_verified: true,
    })
    mockVerifyIdToken.mockResolvedValue({ getPayload: mockGetPayload })
    const res = await handleGmailPushWebhook(makeRequest('Bearer token'), '/api/gmail/webhook')
    expect(res.status).toBe(200)
  })
})
