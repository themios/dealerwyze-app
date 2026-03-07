'use client'

import { useState } from 'react'
import { Eye, Pencil, X } from 'lucide-react'

interface Props {
  orgName:   string
  writeMode: boolean
}

export default function ImpersonationBanner({ orgName, writeMode }: Props) {
  const [ending, setEnding] = useState(false)

  async function endSession() {
    setEnding(true)
    await fetch('/api/admin/impersonate', { method: 'DELETE' })
    // Full page reload ensures server reads the cleared cookie fresh
    window.location.href = '/admin'
  }

  if (writeMode) {
    return (
      <div className="bg-orange-500 text-white px-4 py-2 flex items-center justify-between gap-3 text-sm font-medium sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <Pencil className="h-4 w-4 shrink-0" />
          <span>Remote Admin — <strong>{orgName}</strong> — changes are live</span>
        </div>
        <button
          onClick={endSession}
          disabled={ending}
          className="flex items-center gap-1 rounded-md bg-white/20 hover:bg-white/30 px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" />
          {ending ? 'Ending…' : 'End Session'}
        </button>
      </div>
    )
  }

  return (
    <div className="bg-yellow-400 text-yellow-900 px-4 py-2 flex items-center justify-between gap-3 text-sm font-medium sticky top-0 z-50">
      <div className="flex items-center gap-2">
        <Eye className="h-4 w-4 shrink-0" />
        <span>Viewing <strong>{orgName}</strong> as read-only staff</span>
      </div>
      <button
        onClick={endSession}
        disabled={ending}
        className="flex items-center gap-1 rounded-md bg-yellow-900/10 hover:bg-yellow-900/20 px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50"
      >
        <X className="h-3.5 w-3.5" />
        {ending ? 'Ending…' : 'End Session'}
      </button>
    </div>
  )
}
