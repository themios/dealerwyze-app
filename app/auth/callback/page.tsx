'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AuthCallbackPage() {
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function handleCallback() {
      // 1. Try hash-based tokens (#access_token=... from implicit/admin flow)
      const hash = window.location.hash
      if (hash) {
        const params = new URLSearchParams(hash.slice(1))
        const accessToken = params.get('access_token')
        const refreshToken = params.get('refresh_token')

        if (accessToken && refreshToken) {
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          })
          if (data.session) {
            if (params.get('type') === 'recovery') {
              router.replace('/reset-password')
            } else {
              router.replace('/today')
            }
            return
          }
          router.replace(`/login?error=${encodeURIComponent(error?.message ?? 'Sign in failed')}`)
          return
        }
      }

      // 2. Try PKCE code exchange (?code=... from standard magic link)
      const code = new URLSearchParams(window.location.search).get('code')
      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code)
        if (data.session) {
          router.replace('/today')
          return
        }
        router.replace(`/login?error=${encodeURIComponent(error?.message ?? 'Sign in failed')}`)
        return
      }

      // 3. Already have a session?
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        router.replace('/today')
        return
      }

      router.replace('/login?error=No+session+found')
    }

    handleCallback()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-dvh flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="text-4xl animate-pulse">🔐</div>
        <p className="text-sm text-muted-foreground">Signing you in…</p>
      </div>
    </div>
  )
}
