'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface AuctionConfig {
  enabled: boolean
  copart_enabled: boolean
  copart_api_key?: string
  copart_username?: string
  acv_enabled: boolean
  acv_api_key?: string
  last_sync_at?: string
  last_sync_status?: string
  last_sync_count?: number
}

interface Props {
  config: AuctionConfig
  onSave: (config: AuctionConfig) => Promise<void>
}

export function AuctionSettingsPanel({ config, onSave }: Props) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState<AuctionConfig>(config)

  async function handleSave() {
    setLoading(true)
    try {
      await onSave(formData)
      toast.success('Auction settings saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setLoading(false)
    }
  }

  const lastSyncDate = formData.last_sync_at ? new Date(formData.last_sync_at) : null
  const syncLabel = lastSyncDate
    ? lastSyncDate.toLocaleString('en-US', { timeZone: 'UTC' })
    : 'Never'

  return (
    <Card>
      <CardHeader>
        <CardTitle>Auction Platform Sync</CardTitle>
        <CardDescription>
          Auto-import vehicles from Copart and ACV Auctions every 6 hours.
          {lastSyncDate && (
            <p className="text-xs mt-2">
              Last sync: {syncLabel} (UTC) — {formData.last_sync_status || 'unknown'}
              {formData.last_sync_count ? ` — ${formData.last_sync_count} imported` : ''}
            </p>
          )}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Master toggle */}
        <div className="flex items-center justify-between">
          <Label>Enable Auction Sync</Label>
          <Switch
            checked={formData.enabled}
            onCheckedChange={(enabled: boolean) => setFormData({ ...formData, enabled })}
            aria-label="Toggle auction sync"
          />
        </div>

        {formData.enabled && (
          <>
            {/* Copart */}
            <div className="space-y-3 p-4 bg-muted rounded">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Copart</h4>
                <Switch
                  checked={formData.copart_enabled}
                  onCheckedChange={(enabled: boolean) =>
                    setFormData({ ...formData, copart_enabled: enabled })
                  }
                  aria-label="Toggle Copart"
                />
              </div>

              {formData.copart_enabled && (
                <div className="space-y-2">
                  <div>
                    <Label htmlFor="copart-key" className="text-xs">
                      API Key
                    </Label>
                    <Input
                      id="copart-key"
                      type="password"
                      placeholder="Your Copart API key"
                      value={formData.copart_api_key || ''}
                      onChange={(e) =>
                        setFormData({ ...formData, copart_api_key: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="copart-user" className="text-xs">
                      Username
                    </Label>
                    <Input
                      id="copart-user"
                      placeholder="Your Copart username"
                      value={formData.copart_username || ''}
                      onChange={(e) =>
                        setFormData({ ...formData, copart_username: e.target.value })
                      }
                    />
                  </div>
                </div>
              )}
            </div>

            {/* ACV */}
            <div className="space-y-3 p-4 bg-muted rounded">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">ACV Auctions</h4>
                <Switch
                  checked={formData.acv_enabled}
                  onCheckedChange={(enabled: boolean) =>
                    setFormData({ ...formData, acv_enabled: enabled })
                  }
                  aria-label="Toggle ACV"
                />
              </div>

              {formData.acv_enabled && (
                <div>
                  <Label htmlFor="acv-key" className="text-xs">
                    API Key
                  </Label>
                  <Input
                    id="acv-key"
                    type="password"
                    placeholder="Your ACV API key"
                    value={formData.acv_api_key || ''}
                    onChange={(e) =>
                      setFormData({ ...formData, acv_api_key: e.target.value })
                    }
                  />
                </div>
              )}
            </div>
          </>
        )}

        <Button onClick={handleSave} disabled={loading} className="w-full">
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Settings'
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
