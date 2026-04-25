'use client'

import { useEffect, useState } from 'react'
import { Mail } from 'lucide-react'

export default function EmailFromDomainSection() {
  const [resendFromDomain, setResendFromDomain] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/settings/org')
      .then(r => r.json())
      .then(d => setResendFromDomain(d.resend_from_domain ?? null))
  }, [])

  if (!resendFromDomain) return null

  return (
    <div className="px-4 pt-2 border-t">
      <p className="text-sm font-semibold mb-2">Email From Domain</p>
      <div className="flex items-center gap-2 p-3 rounded-lg border bg-muted/40">
        <Mail className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-mono">{resendFromDomain}</p>
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        Contact{' '}
        <a href="mailto:support@dealerwyze.com" className="underline">support@dealerwyze.com</a>
        {' '}to configure a custom email domain.
      </p>
    </div>
  )
}
