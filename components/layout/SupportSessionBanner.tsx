'use client'

import { useEffect, useState } from 'react'
import { ShieldCheck, X } from 'lucide-react'

interface Session { active: boolean; write_mode?: boolean }

export default function SupportSessionBanner() {
  const [session, setSession] = useState<Session | null>(null)
  const [ending, setEnding] = useState(false)

  useEffect(() => {
    let mounted = true

    async function check() {
      try {
        const res = await fetch('/api/support/active-session')
        if (!res.ok || !mounted) return
        const data: Session = await res.json()
        if (mounted) setSession(data)
      } catch { /* ignore — banner stays hidden on error */ }
    }

    check()
    const interval = setInterval(check, 60_000)
    return () => { mounted = false; clearInterval(interval) }
  }, [])

  async function endSession() {
    setEnding(true)
    await fetch('/api/support/active-session', { method: 'DELETE' })
    setSession({ active: false })
    setEnding(false)
  }

  if (!session?.active) return null

  return (
    <div className="bg-blue-600 text-white px-4 py-2 flex items-center justify-between gap-3 text-sm sticky top-0 z-50">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 shrink-0" />
        <span>
          A DealerWyze support agent is viewing your account
          {session.write_mode ? ' and may make changes on your behalf' : ''}.
        </span>
      </div>
      <button
        onClick={endSession}
        disabled={ending}
        className="flex items-center gap-1 rounded-md bg-white/20 hover:bg-white/30 px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 shrink-0"
      >
        <X className="h-3.5 w-3.5" />
        {ending ? 'Ending…' : 'End Access'}
      </button>
    </div>
  )
}
