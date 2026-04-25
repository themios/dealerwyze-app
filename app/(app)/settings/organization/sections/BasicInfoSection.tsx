'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface OrgBasicInfo {
  name: string
  business_phone: string
  business_address: string
  timezone: string
  dealer_website_url: string
}

const TIMEZONES = [
  { value: 'America/Los_Angeles', label: 'Pacific (Los Angeles)' },
  { value: 'America/Denver',      label: 'Mountain (Denver)' },
  { value: 'America/Chicago',     label: 'Central (Chicago)' },
  { value: 'America/New_York',    label: 'Eastern (New York)' },
]

function SkeletonField() {
  return (
    <div className="space-y-1.5">
      <div className="h-4 w-24 bg-muted rounded animate-pulse" />
      <div className="h-10 w-full bg-muted rounded-md animate-pulse" />
    </div>
  )
}

export default function BasicInfoSection() {
  const [form, setForm] = useState<OrgBasicInfo>({
    name: '',
    business_phone: '',
    business_address: '',
    timezone: 'America/Los_Angeles',
    dealer_website_url: '',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)

  useEffect(() => {
    fetch('/api/settings/org')
      .then(r => r.json())
      .then(d => {
        setForm({
          name:               d.name ?? '',
          business_phone:     d.business_phone ?? '',
          business_address:   d.business_address ?? '',
          timezone:           d.timezone ?? 'America/Los_Angeles',
          dealer_website_url: (() => {
            const url  = (d.dealer_website_url ?? '').replace(/\/$/, '')
            const path = (d.dealer_website_inventory_path ?? '').trim()
            if (!path || url.endsWith(path) || url.endsWith(path.replace(/^\//, ''))) return url || ''
            return url + (path.startsWith('/') ? path : `/${path}`)
          })(),
        })
        setLoading(false)
      })
  }, [])

  function handleChange(field: keyof OrgBasicInfo, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    await fetch('/api/settings/org', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(form),
    })
    setSaving(false)
    setSaved(true)
  }

  if (loading) {
    return (
      <div className="px-4 py-6 space-y-5">
        <SkeletonField />
        <SkeletonField />
        <SkeletonField />
        <SkeletonField />
      </div>
    )
  }

  return (
    <div className="px-4 py-6 space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="org-name" className="text-sm font-medium">Dealership Name</Label>
        <Input
          id="org-name" type="text"
          value={form.name}
          onChange={e => handleChange('name', e.target.value)}
          placeholder="My Auto Group"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="org-phone" className="text-sm font-medium">Business Phone</Label>
        <Input
          id="org-phone" type="tel"
          value={form.business_phone}
          onChange={e => handleChange('business_phone', e.target.value)}
          placeholder="(555) 000-0000"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="org-address" className="text-sm font-medium">Business Address</Label>
        <Input
          id="org-address" type="text"
          value={form.business_address}
          onChange={e => handleChange('business_address', e.target.value)}
          placeholder="123 Main St, City, ST 00000"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="org-timezone" className="text-sm font-medium">Timezone</Label>
        <Select value={form.timezone} onValueChange={v => handleChange('timezone', v)}>
          <SelectTrigger id="org-timezone" className="w-full">
            <SelectValue placeholder="Select timezone" />
          </SelectTrigger>
          <SelectContent>
            {TIMEZONES.map(tz => (
              <SelectItem key={tz.value} value={tz.value}>{tz.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="pt-2 border-t space-y-3">
        <p className="text-sm font-semibold">Inventory page URL</p>
        <p className="text-xs text-muted-foreground">
          Full URL of your dealership&apos;s inventory or cars-for-sale page. Used by inventory sync and email template <code className="bg-muted px-1 rounded">{'{link}'}</code>.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="org-inventory-url" className="text-sm font-medium">URL</Label>
          <Input
            id="org-inventory-url"
            type="url"
            value={form.dealer_website_url}
            onChange={e => handleChange('dealer_website_url', e.target.value)}
            placeholder="https://www.yourdealer.com/cars-for-sale"
          />
        </div>
        <Button type="button" size="sm" onClick={handleSave} disabled={saving} className="mt-2">
          {saving ? 'Saving…' : saved ? 'Saved!' : 'Save'}
        </Button>
      </div>
    </div>
  )
}
