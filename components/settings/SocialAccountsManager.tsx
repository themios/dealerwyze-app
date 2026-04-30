'use client'

import { useState } from 'react'
import { CheckCircle2, Trash2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface SocialAccount {
  id: string
  platform: string
  account_label: string
  platform_account_id: string
  is_active: boolean
  connected_at: string
  token_expires_at: string | null
}

interface Props {
  initialAccounts: SocialAccount[]
}

const PLATFORMS = [
  {
    id: 'facebook',
    name: 'Facebook',
    description: 'Post to your Facebook Business Page',
    color: 'bg-blue-600',
    textColor: 'text-blue-700 dark:text-blue-400',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    description: 'Share Reels to your Instagram Business account',
    color: 'bg-pink-600',
    textColor: 'text-pink-700 dark:text-pink-400',
  },
  {
    id: 'tiktok',
    name: 'TikTok',
    description: 'Publish videos to TikTok (requires app approval)',
    color: 'bg-slate-800',
    textColor: 'text-slate-700 dark:text-slate-300',
  },
  {
    id: 'youtube',
    name: 'YouTube',
    description: 'Upload to your YouTube channel',
    color: 'bg-red-600',
    textColor: 'text-red-700 dark:text-red-400',
  },
]

export default function SocialAccountsManager({ initialAccounts }: Props) {
  const [accounts, setAccounts] = useState<SocialAccount[]>(initialAccounts)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)

  function getConnected(platformId: string): SocialAccount | undefined {
    return accounts.find(a => a.platform === platformId && a.is_active)
  }

  async function handleDisconnect(accountId: string) {
    setDisconnecting(accountId)
    try {
      const res = await fetch(`/api/social/accounts?id=${accountId}`, { method: 'DELETE' })
      if (res.ok) {
        setAccounts(prev => prev.filter(a => a.id !== accountId))
      }
    } finally {
      setDisconnecting(null)
    }
  }

  return (
    <div className="space-y-3">
      {PLATFORMS.map(platform => {
        const connected = getConnected(platform.id)
        return (
          <div key={platform.id} className="flex items-center justify-between p-4 rounded-lg border bg-card">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg ${platform.color} flex items-center justify-center flex-shrink-0`}>
                <span className="text-white text-sm font-bold">{platform.name[0]}</span>
              </div>
              <div>
                <p className="font-medium text-sm">{platform.name}</p>
                {connected ? (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                    <p className="text-xs text-muted-foreground">{connected.account_label}</p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground mt-0.5">{platform.description}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {connected ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDisconnect(connected.id)}
                  disabled={disconnecting === connected.id}
                  className="text-destructive hover:text-destructive"
                >
                  {disconnecting === connected.id
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Trash2 className="h-4 w-4" />
                  }
                </Button>
              ) : (
                <a href={`/api/social/connect/${platform.id}`}>
                  <Button size="sm" variant="outline">Connect</Button>
                </a>
              )}
            </div>
          </div>
        )
      })}

      <p className="text-xs text-muted-foreground pt-2">
        DealerWyze posts on your behalf using secure OAuth. We never see your passwords.
        Disconnect at any time to revoke access.
      </p>
    </div>
  )
}
