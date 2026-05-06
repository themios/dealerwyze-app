import 'server-only'
import { createHmac } from 'crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from './service'

function requireJwtSecret(): string {
  const secret = process.env.SUPABASE_JWT_SECRET
  if (!secret) {
    throw new Error(
      'SUPABASE_JWT_SECRET is required for staff impersonation (Supabase Dashboard → Project Settings → API → JWT Secret)',
    )
  }
  return secret
}

function base64UrlEncode(obj: object): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url')
}

/**
 * Mint a short-lived HS256 JWT that PostgREST accepts as `authenticated`.
 * Used only for staff impersonation — never exposed to the browser.
 */
function mintUserAccessToken(userId: string, email: string): string {
  const secret = requireJwtSecret()
  const now = Math.floor(Date.now() / 1000)
  const exp = now + 60 * 60 // 1 hour
  const payload = {
    aud: 'authenticated',
    exp,
    iat: now,
    iss: 'supabase',
    sub: userId,
    email,
    role: 'authenticated',
    app_metadata:  {},
    user_metadata: {},
    aal: 'aal1',
    amr: [{ method: 'impersonation', timestamp: now }],
  }
  const header = { alg: 'HS256', typ: 'JWT' }
  const h = base64UrlEncode(header)
  const p = base64UrlEncode(payload)
  const sig = createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url')
  return `${h}.${p}.${sig}`
}

/**
 * Returns a Supabase client that runs as a real org user (first profile in the org),
 * so Postgres RLS + get_org_id() apply — never returns the service-role key to callers.
 *
 * A service client is used only inside this module to resolve which user id to mint for.
 */
export async function createScopedImpersonationClient(orgId: string): Promise<SupabaseClient> {
  const admin = createServiceClient()
  const { data: profile, error } = await admin
    .from('profiles')
    .select('id')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error || !profile?.id) {
    throw new Error(`Staff impersonation: no profile found for org ${orgId}`)
  }

  const email = `impersonation+${profile.id}@dealerwyze.internal`
  const accessToken = mintUserAccessToken(profile.id, email)

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
      auth: {
        persistSession:      false,
        autoRefreshToken:    false,
        detectSessionInUrl:    false,
      },
    },
  )
}
