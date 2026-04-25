'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Phone, X, Loader2 } from 'lucide-react'

function formatPhone(p: string) {
  const d = p.replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) return `+1 (${d.slice(1,4)}) ${d.slice(4,7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`
  return p
}

export default function PhoneSection() {
  const [isAdmin, setIsAdmin]                 = useState(false)
  const [twilioNumber, setTwilioNumber]       = useState<string | null>(null)
  const [dealershipName, setDealershipName]   = useState('')
  const [provisionOpen, setProvisionOpen]     = useState(false)
  const [phoneType, setPhoneType]             = useState<'toll_free' | 'local' | 'existing'>('toll_free')
  const [areaCode, setAreaCode]               = useState('')
  const [existingNumber, setExistingNumber]   = useState('')
  const [provisioning, setProvisioning]       = useState(false)
  const [provisionError, setProvisionError]   = useState<string | null>(null)
  const [releasing, setReleasing]             = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/settings/org').then(r => r.json()),
      fetch('/api/auth/me').then(r => r.json()).catch(() => ({ role: 'agent' })),
    ]).then(([d, me]) => {
      setTwilioNumber(d.twilio_phone_number ?? null)
      setDealershipName(d.name ?? '')
      setIsAdmin(me?.role === 'admin' || me?.role === 'dealer_admin')
    })
  }, [])

  if (!isAdmin) return null

  async function handleProvision() {
    if (phoneType === 'local' && areaCode.length !== 3) {
      setProvisionError('Enter a 3-digit area code.')
      return
    }
    if (phoneType === 'existing' && existingNumber.replace(/\D/g, '').length < 10) {
      setProvisionError('Enter a valid 10-digit US phone number.')
      return
    }
    setProvisioning(true)
    setProvisionError(null)
    const payload = phoneType === 'existing'
      ? { type: 'existing', phone_number: existingNumber, dealership_name: dealershipName }
      : { type: phoneType, area_code: areaCode || undefined, dealership_name: dealershipName }
    const res  = await fetch('/api/admin/provision-phone', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    })
    const data = await res.json() as { phoneNumber?: string; error?: string }
    setProvisioning(false)
    if (!res.ok) {
      setProvisionError(data.error ?? 'Something went wrong. Please try again or contact support.')
    } else {
      setTwilioNumber(data.phoneNumber ?? null)
      setProvisionOpen(false)
      setAreaCode('')
      setExistingNumber('')
    }
  }

  async function handleRelease() {
    if (!confirm('Release this number? Your dealership will no longer be able to send or receive texts or take calls on it.')) return
    setReleasing(true)
    const res = await fetch('/api/admin/provision-phone', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({}),
    })
    setReleasing(false)
    if (res.ok) setTwilioNumber(null)
  }

  return (
    <div className="px-4 pt-2 border-t">
      <p className="text-sm font-semibold mb-3">SMS Phone Number</p>

      {twilioNumber ? (
        <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-primary" />
            <span className="font-mono text-sm">{formatPhone(twilioNumber)}</span>
            <span className="text-xs bg-green-500/10 text-green-600 px-1.5 py-0.5 rounded-full font-medium">Active</span>
          </div>
          <Button
            variant="ghost" size="sm"
            className="text-destructive text-xs"
            onClick={handleRelease}
            disabled={releasing}
          >
            {releasing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Release'}
          </Button>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground mb-3">
            Get a business phone number for texts and calls. Toll-free is ready immediately;
            local numbers may take a few days to activate.
          </p>

          {!provisionOpen ? (
            <Button variant="outline" size="sm" onClick={() => setProvisionOpen(true)}>
              <Phone className="h-4 w-4 mr-1.5" />
              Provision Phone Number
            </Button>
          ) : (
            <div className="space-y-3 p-3 rounded-lg border bg-card">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">New Phone Number</p>
                <button onClick={() => { setProvisionOpen(false); setProvisionError(null) }} title="Close">
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-1.5">
                {([
                  { value: 'toll_free', label: 'Toll-Free',        sub: 'Ready now' },
                  { value: 'local',     label: 'Local number',     sub: 'May take a few days' },
                  { value: 'existing',  label: 'I have a number',  sub: 'Use my existing number' },
                ] as const).map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setPhoneType(opt.value)}
                    className={`p-2.5 rounded-lg border text-left transition-colors ${phoneType === opt.value ? 'border-primary bg-primary/5' : 'border-border'}`}
                  >
                    <p className="text-xs font-medium leading-tight">{opt.label}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{opt.sub}</p>
                  </button>
                ))}
              </div>

              {phoneType === 'local' && (
                <div className="space-y-1">
                  <Label className="text-xs">Area Code</Label>
                  <Input
                    placeholder="818"
                    maxLength={3}
                    value={areaCode}
                    onChange={e => setAreaCode(e.target.value.replace(/\D/g, ''))}
                    className="h-9 font-mono"
                  />
                </div>
              )}

              {phoneType === 'existing' && (
                <div className="space-y-1">
                  <Label className="text-xs">Your phone number</Label>
                  <Input
                    placeholder="(818) 555-0100"
                    value={existingNumber}
                    onChange={e => setExistingNumber(e.target.value)}
                    className="h-9 font-mono"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    If we already manage this number for you, we&apos;ll connect it so texts and calls work right away. No extra setup needed.
                  </p>
                </div>
              )}

              {provisionError && (
                <p className="text-xs text-destructive">{provisionError}</p>
              )}

              <Button className="w-full" size="sm" onClick={handleProvision} disabled={provisioning}>
                {provisioning
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Provisioning…</>
                  : 'Provision Number'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
