'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import Image from 'next/image'

export default function SignupPage() {
  const [form, setForm] = useState({ display_name: '', email: '', password: '', invite_code: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error || 'Registration failed')
      setLoading(false)
      return
    }

    // Sign in immediately after account creation
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
          <div className="flex justify-center mb-2">
            <Image src="/logo.jpg" alt="Apollo Auto" width={96} height={96} className="rounded-xl" />
          </div>
          <CardTitle className="text-2xl">Create Account</CardTitle>
          <CardDescription>Set up your dealership or join a team</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Your Name</Label>
              <Input
                id="name"
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
                placeholder="you@apolloauto.com"
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
                placeholder="8-character code from your admin"
                value={form.invite_code}
                onChange={e => setForm(p => ({ ...p, invite_code: e.target.value.toUpperCase() }))}
                maxLength={8}
                className="h-12 text-base font-mono tracking-widest"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full h-12 text-base" disabled={loading}>
              {loading ? 'Creating account…' : form.invite_code ? 'Join Team' : 'Create Account'}
            </Button>
          </form>
          <p className="text-center text-sm text-muted-foreground mt-4">
            Already have an account?{' '}
            <Link href="/login" className="text-primary underline underline-offset-4">Sign in</Link>
          </p>
          <p className="text-center text-xs text-muted-foreground mt-3">
            By creating an account you agree to our{' '}
            <a href="/terms.html" className="underline underline-offset-2">Terms of Service</a>
            {' '}and{' '}
            <a href="/privacy.html" className="underline underline-offset-2">Privacy Policy</a>
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
