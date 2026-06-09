import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
          }
        },
      },
    }
  )

  // Suppress the getSession() insecure-user warning. The library fires it when
  // its own _getAccessToken() calls getSession() internally to get the JWT for
  // PostgREST headers. Our app always uses getUser() for auth checks, so the
  // warning is a false positive. Setting this flag mirrors what getUser() does.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(client.auth as any).suppressGetSessionWarning = true

  return client
}
