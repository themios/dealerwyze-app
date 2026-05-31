'use client'

import { useState, useEffect } from 'react'
import type { Vertical } from '@/lib/vertical'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import Image from 'next/image'
import {
  captureUtmParams,
  readStoredUtmParams,
  clearStoredUtmParams,
  fireSignupConversion,
} from '@/lib/analytics/gtag'

export default function SignupForm({ vertical }: { vertical: Vertical }) {
  const [form, setForm] = useState({ display_name: '', email: '', password: '', invite_code: '' })
  const [agreedToTerms, setAgreedToTerms] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  useEffect(() => { captureUtmParams() }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!agreedToTerms) {
      setError('You must agree to the Terms of Service and Privacy Policy to create an account.')
      return
    }
    setLoading(true)
    setError('')

    const utmParams = readStoredUtmParams()

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        vertical,
        agreed_to_terms: true,
        agreed_to_terms_at: new Date().toISOString(),
        ...utmParams,
      }),
    })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error || 'Registration failed')
      setLoading(false)
      return
    }

    fireSignupConversion()
    clearStoredUtmParams()

    const supabase = createClient()
    const { error: loginErr } = await supabase.auth.signInWithPassword({
      email: form.email,
      password: form.password,
    })

    if (loginErr) {
      setError('Account created — please sign in.')
      router.replace('/login')
    } else {
      router.replace(data.redirect ?? '/today')
    }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          {vertical === 'real_estate' ? (
            <div className="flex justify-center mb-2">
              <span className="text-2xl font-bold tracking-tight text-foreground">RealtyWyze</span>
            </div>
          ) : (
            <div className="flex justify-center mb-2">
              <Image src="/logo.png" alt="DealerWyze" width={180} height={120} priority style={{ height: 'auto' }} className="object-contain" />
            </div>
          )}
          <CardTitle className="text-2xl">Create Account</CardTitle>
          <CardDescription>
            {vertical === 'real_estate' ? 'Set up your brokerage or join a team' : 'Set up your dealership or join a team'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <input type="hidden" name="vertical" value={vertical} readOnly />
            <div className="space-y-1.5">
              <Label htmlFor="name">Your Name</Label>
              <Input
                id="name"
                autoComplete="name"
                placeholder="John Smith"
                value={form.display_name}
                onChange={e => setForm(p => ({ ...p, display_name: e.target.value }))}
                required
                autoFocus
                className="h-12 text-base"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder={vertical === 'real_estate' ? 'you@yourbrokerage.com' : 'you@yourdealership.com'}
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                required
                className="h-12 text-base"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder="Min 8 characters"
                value={form.password}
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                required
                minLength={8}
                className="h-12 text-base"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="code">
                Team Code <span className="text-muted-foreground font-normal">(optional — joining an existing team?)</span>
              </Label>
              <Input
                id="code"
                autoComplete="off"
                placeholder="8-character code from your admin"
                value={form.invite_code}
                onChange={e => setForm(p => ({ ...p, invite_code: e.target.value.toUpperCase() }))}
                maxLength={8}
                className="h-12 text-base font-mono tracking-widest"
              />
            </div>
            <label className="flex items-start gap-2.5 cursor-pointer group">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={e => setAgreedToTerms(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-primary cursor-pointer"
                required
              />
              <span className="text-xs text-muted-foreground leading-snug">
                I agree to the{' '}
                <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">Terms of Service</a>
                {' '}and{' '}
                <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-2">Privacy Policy</a>
                , including the Acceptable Use Policy. I confirm I am authorized to bind my {vertical === 'real_estate' ? 'brokerage' : 'dealership'} to this agreement.
              </span>
            </label>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full h-12 text-base" disabled={loading || !agreedToTerms}>
              {loading ? 'Creating account…' : form.invite_code ? 'Join Team' : 'Create Account'}
            </Button>
          </form>
          <p className="text-center text-sm text-muted-foreground mt-4">
            Already have an account?{' '}
            <Link href="/login" className="text-primary underline underline-offset-4">Sign in</Link>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
