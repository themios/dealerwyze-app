'use client'

import { useEffect, useState } from 'react'
import { apiFetch, ApiError } from '@/lib/api/fetchClient'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2 } from 'lucide-react'
import ConfirmActionDialog from '@/components/settings/ConfirmActionDialog'

interface VoiceForm {
  dealer_cell_number: string
  voice_business_hours_start: string
  voice_business_hours_end: string
  twilio_phone_number: string | null
}

export default function VoiceAgentSection() {
  const [form, setForm] = useState<VoiceForm>({
    dealer_cell_number: '',
    voice_business_hours_start: '09:00',
    voice_business_hours_end: '19:00',
    twilio_phone_number: null,
  })
  const [isAdmin, setIsAdmin]                         = useState(false)
  const [retellAgentId, setRetellAgentId]             = useState<string | null>(null)
  const [voiceProvisioning, setVoiceProvisioning]     = useState(false)
  const [voiceDeprovisioning, setVoiceDeprovisioning] = useState(false)
  const [voiceError, setVoiceError]                   = useState<string | null>(null)
  const [saving, setSaving]                           = useState(false)
  const [saved, setSaved]                             = useState(false)
  const [saveError, setSaveError]                     = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/settings/org').then(r => r.json()),
      fetch('/api/auth/me').then(r => r.json()).catch(() => ({ role: 'agent' })),
    ]).then(([d, me]) => {
      setForm({
        dealer_cell_number:         d.dealer_cell_number ?? '',
        voice_business_hours_start: d.voice_business_hours_start ?? '09:00',
        voice_business_hours_end:   d.voice_business_hours_end ?? '19:00',
        twilio_phone_number:        d.twilio_phone_number ?? null,
      })
      setIsAdmin(me?.role === 'admin' || me?.role === 'dealer_admin')
      setRetellAgentId(d.retell_agent_id ?? null)
    })
  }, [])

  function handleChange(field: keyof VoiceForm, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    setSaved(false)
    setSaveError(null)
    try {
      await apiFetch('/api/settings/org', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          dealer_cell_number:         form.dealer_cell_number,
          voice_business_hours_start: form.voice_business_hours_start,
          voice_business_hours_end:   form.voice_business_hours_end,
        }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Save failed. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  async function handleProvisionVoice() {
    setVoiceProvisioning(true)
    setVoiceError(null)
    const res  = await fetch('/api/admin/provision-voice', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({}),
    })
    const data = await res.json() as { agentId?: string; error?: string }
    setVoiceProvisioning(false)
    if (!res.ok) {
      setVoiceError(data.error ?? 'We couldn\'t turn on the AI voice agent. Try again or contact support.')
    } else {
      setRetellAgentId(data.agentId ?? null)
    }
  }

  async function handleDeprovisionVoice() {
    setVoiceDeprovisioning(true)
    setVoiceError(null)
    await fetch('/api/admin/provision-voice', {
      method:  'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({}),
    })
    setVoiceDeprovisioning(false)
    setRetellAgentId(null)
  }

  return (
    <div className="px-4 pt-2 border-t">
      <p className="text-sm font-semibold mb-3">Voice Agent</p>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="dealer-cell" className="text-sm font-medium">Dealer Cell Number</Label>
          <Input
            id="dealer-cell" type="tel"
            value={form.dealer_cell_number}
            onChange={e => handleChange('dealer_cell_number', e.target.value)}
            placeholder="+15555550100"
          />
          <p className="text-xs text-muted-foreground">Calls ring this number first during business hours (E.164 format)</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="hours-start" className="text-sm font-medium">Open</Label>
            <Input
              id="hours-start" type="time"
              value={form.voice_business_hours_start}
              onChange={e => handleChange('voice_business_hours_start', e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="hours-end" className="text-sm font-medium">Close</Label>
            <Input
              id="hours-end" type="time"
              value={form.voice_business_hours_end}
              onChange={e => handleChange('voice_business_hours_end', e.target.value)}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">After hours → voice agent answers immediately</p>

        {saveError && <p className="text-sm text-destructive">{saveError}</p>}
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : saved ? 'Saved!' : 'Save'}
        </Button>

        {/* AI Agent status + provision (admin only) */}
        {isAdmin && (
          <div className="pt-3 border-t border-dashed space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium">AI Agent</p>
              {retellAgentId
                ? <span className="text-xs bg-green-500/10 text-green-600 px-1.5 py-0.5 rounded-full font-medium">Active</span>
                : <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full font-medium">Not configured</span>
              }
            </div>
            {!retellAgentId && !form.twilio_phone_number && (
              <p className="text-[10px] text-muted-foreground">Add a business phone number above first. The AI voice agent uses that number for calls.</p>
            )}
            {voiceError && <p className="text-xs text-destructive">{voiceError}</p>}
            {retellAgentId ? (
              <ConfirmActionDialog
                title="Remove the AI voice agent?"
                description="Incoming calls will no longer be answered automatically until the voice agent is provisioned again."
                confirmLabel={voiceDeprovisioning ? 'Removing...' : 'Remove voice agent'}
                confirmVariant="destructive"
                onConfirm={handleDeprovisionVoice}
                trigger={(
                  <Button
                    variant="outline" size="sm"
                    className="text-destructive border-destructive/30 text-xs"
                    disabled={voiceDeprovisioning}
                  >
                    {voiceDeprovisioning
                      ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Removing…</>
                      : 'Remove Voice Agent'}
                  </Button>
                )}
              />
            ) : (
              <Button
                variant="outline" size="sm"
                onClick={handleProvisionVoice}
                disabled={voiceProvisioning || !form.twilio_phone_number}
              >
                {voiceProvisioning
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />Provisioning…</>
                  : 'Provision Voice Agent'}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
