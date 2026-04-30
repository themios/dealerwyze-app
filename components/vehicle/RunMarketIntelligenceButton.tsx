/**
 * RunMarketIntelligenceButton
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs market intelligence on all inventory vehicles that have never been checked.
 *
 * Rules:
 *   - Only processes vehicles where market_data_json IS NULL (new/unchecked inventory)
 *   - Vehicles with existing data are always skipped — the Monday cron handles refreshes
 *   - Calls the existing per-vehicle endpoint one at a time to avoid timeouts
 *   - Shows live progress: "Checking 3 / 12..."
 *   - If nothing needs checking, shows a friendly message
 *
 * Shown on the Inventory page (admin only).
 */
'use client'

import { useState } from 'react'
import { Brain, Loader2, CheckCircle2 } from 'lucide-react'

type State = 'idle' | 'loading_list' | 'running' | 'done' | 'nothing_to_do'

export default function RunMarketIntelligenceButton() {
  const [state, setState]     = useState<State>('idle')
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [failed, setFailed]   = useState(0)
  async function handleRun() {
    if (state === 'running' || state === 'loading_list') return

    setState('loading_list')
    setProgress({ done: 0, total: 0 })
    setFailed(0)
    // Step 1 — fetch unchecked vehicle IDs
    let vehicles: { id: string; year: number; make: string; model: string }[] = []
    try {
      const res  = await fetch('/api/vehicles/unchecked')
      const json = await res.json()
      vehicles   = json.vehicles ?? []
    } catch {
      setState('idle')
      return
    }

    if (vehicles.length === 0) {
      setState('nothing_to_do')
      setTimeout(() => setState('idle'), 4000)
      return
    }

    // Step 2 — run market check on each vehicle sequentially
    setState('running')
    setProgress({ done: 0, total: vehicles.length })

    let failCount = 0
    for (const v of vehicles) {
      try {
        await fetch(`/api/vehicles/${v.id}/market-check`)
      } catch {
        failCount++
      }
      setProgress(p => ({ ...p, done: p.done + 1 }))
      setFailed(failCount)
    }

    setState('done')
    // Auto-reset to idle after 8 seconds so the button reappears
    setTimeout(() => setState('idle'), 8000)
  }

  // ── Render — always a button so it never "disappears" ─────────────────────

  if (state === 'done') {
    const succeeded = progress.total - failed
    return (
      <button
        onClick={() => setState('idle')}
        title="Click to dismiss"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20 text-green-700 text-xs font-medium"
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        {succeeded} vehicle{succeeded !== 1 ? 's' : ''} updated
        {failed > 0 && <span className="text-orange-600"> · {failed} failed</span>}
      </button>
    )
  }

  if (state === 'nothing_to_do') {
    return (
      <button
        onClick={() => setState('idle')}
        title="Click to dismiss"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted border text-muted-foreground text-xs"
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        All up to date
      </button>
    )
  }

  if (state === 'running') {
    return (
      <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/5 border border-primary/20 text-primary text-xs font-medium">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Checking {progress.done + 1} / {progress.total}
      </span>
    )
  }

  if (state === 'loading_list') {
    return (
      <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-xs">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Finding vehicles...
      </span>
    )
  }

  // Idle
  return (
    <button
      onClick={handleRun}
      title="Run market intelligence on vehicles with no pricing data"
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-card hover:bg-accent transition-colors text-xs font-medium text-foreground"
    >
      <Brain className="h-3.5 w-3.5 text-primary" />
      <span className="hidden sm:inline">Market Check</span>
    </button>
  )
}
