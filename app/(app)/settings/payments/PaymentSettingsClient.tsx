'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { CreditCard, Calendar, Eye, EyeOff, ExternalLink } from 'lucide-react'

interface Props {
  stripePublishableKey: string | null
  stripeSecretKey:      string | null
  bookingEnabled:       boolean
  bookingIntroText:     string
  dealerName:           string
  dealerPhone:          string
  orgSlug:              string
}

const MASK = '••••••••••••••••'

async function patchOrgSettings(payload: Record<string, unknown>) {
  await fetch('/api/settings/org', {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  })
}

export default function PaymentSettingsClient({
  stripePublishableKey, stripeSecretKey, bookingEnabled, bookingIntroText, orgSlug,
}: Props) {
  const [pubKey, setPubKey]             = useState(stripePublishableKey ?? '')
  const [secKey, setSecKey]             = useState(stripeSecretKey ? MASK : '')
  const [secKeyEditing, setSecKeyEditing] = useState(false)
  const [showPub, setShowPub]           = useState(false)
  const [savingStripe, setSavingStripe] = useState(false)
  const [stripeConfigured, setStripeConfigured] = useState(!!(stripePublishableKey && stripeSecretKey))

  const [bookingOn, setBookingOn]       = useState(bookingEnabled)
  const [bookingText, setBookingText]   = useState(bookingIntroText)
  const [savingBooking, setSavingBooking] = useState(false)

  const bookUrl = `${typeof window !== 'undefined' ? window.location.origin : 'https://dealerwyze.com'}/book/${orgSlug}`

  async function saveStripeKeys() {
    if (!pubKey.trim() || (!secKeyEditing && secKey === MASK)) return
    if (!pubKey.startsWith('pk_')) { alert('Publishable key must start with pk_'); return }
    if (secKeyEditing && !secKey.startsWith('sk_')) { alert('Secret key must start with sk_'); return }
    setSavingStripe(true)
    try {
      const payload: Record<string, unknown> = { stripe_dealer_publishable_key: pubKey.trim() }
      if (secKeyEditing) payload.stripe_dealer_secret_key = secKey.trim()
      await patchOrgSettings(payload)
      setSecKeyEditing(false)
      setSecKey(MASK)
      setStripeConfigured(true)
    } finally {
      setSavingStripe(false)
    }
  }

  async function saveBooking() {
    setSavingBooking(true)
    try {
      await patchOrgSettings({ booking_enabled: bookingOn, booking_intro_text: bookingText })
    } finally {
      setSavingBooking(false)
    }
  }

  return (
    <div className="space-y-6">

      {/* Stripe Keys */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Stripe Keys (BHPH Online Payments)
            </CardTitle>
            {stripeConfigured && <Badge variant="secondary" className="text-xs text-green-600">Connected</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">
            Customers receive a pay-by-phone link in their payment reminder. Money goes directly to your Stripe account.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm">Publishable Key (pk_live_...)</Label>
            <div className="flex gap-2">
              <Input
                type={showPub ? 'text' : 'password'}
                value={pubKey}
                onChange={e => setPubKey(e.target.value)}
                placeholder="pk_live_..."
                className="h-10 flex-1 font-mono text-sm"
              />
              <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0"
                onClick={() => setShowPub(p => !p)}>
                {showPub ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Secret Key (sk_live_...)</Label>
            <div className="flex gap-2">
              <Input
                type="password"
                value={secKey}
                onChange={e => setSecKey(e.target.value)}
                readOnly={!secKeyEditing}
                placeholder="sk_live_..."
                className="h-10 flex-1 font-mono text-sm"
              />
              {!secKeyEditing && (
                <Button type="button" variant="outline" className="h-10 px-4 shrink-0"
                  onClick={() => { setSecKey(''); setSecKeyEditing(true) }}>
                  Change
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Your Stripe secret key is encrypted at rest and never shown after saving.
            </p>
          </div>

          <Button onClick={saveStripeKeys} disabled={savingStripe} className="w-full h-10">
            {savingStripe ? 'Saving...' : 'Save Stripe Keys'}
          </Button>

          <p className="text-xs text-muted-foreground">
            Get your keys at{' '}
            <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noopener noreferrer"
              className="underline inline-flex items-center gap-0.5">
              dashboard.stripe.com/apikeys <ExternalLink className="h-3 w-3" />
            </a>
          </p>
        </CardContent>
      </Card>

      {/* Booking Page */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Customer Booking Page
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            A public link where customers can book a test drive or call without calling you.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Enable booking page</p>
              <p className="text-xs text-muted-foreground">Customers can book a test drive online</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={bookingOn}
              onClick={() => setBookingOn(v => !v)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${bookingOn ? 'bg-primary' : 'bg-input'}`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform ${bookingOn ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>

          {bookingOn && (
            <>
              <div className="space-y-1.5">
                <Label className="text-sm">Welcome message (optional)</Label>
                <Textarea
                  value={bookingText}
                  onChange={e => setBookingText(e.target.value)}
                  placeholder="Welcome! Pick a time that works for you and we will be ready when you arrive."
                  className="resize-none h-20"
                />
              </div>

              <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2">
                <span className="text-xs text-muted-foreground font-mono flex-1 truncate">{bookUrl}</span>
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 shrink-0"
                  onClick={() => navigator.clipboard.writeText(bookUrl)}>
                  Copy
                </Button>
              </div>
            </>
          )}

          <Button onClick={saveBooking} disabled={savingBooking} className="w-full h-10">
            {savingBooking ? 'Saving...' : 'Save Booking Settings'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
