/**
 * TelegramConnect
 * ─────────────────────────────────────────────────────────────────────────────
 * Settings widget that lets a dealer admin connect their Telegram account.
 *
 * How it works:
 *   1. Dealer clicks "Get Setup Code"
 *   2. App generates a 6-digit code (15-min TTL) and shows it here
 *   3. Dealer opens Telegram, searches for the bot, and sends the code
 *   4. The bot webhook receives the code, matches it to this org, and saves
 *      the dealer's Telegram chat ID — connecting their account
 *   5. Dealer clicks "I sent it" to check if the connection was successful
 *
 * Once connected:
 *   - New leads trigger an instant Telegram notification
 *   - The dealer can message the bot to ask questions about their inventory,
 *     leads, and customers (powered by Claude AI with live CRM data)
 *   - Disconnect at any time from this page
 */
'use client'

import { useState } from 'react'
import { Send, CheckCircle2, XCircle, Loader2, RefreshCw } from 'lucide-react'
import ConfirmActionDialog from '@/components/settings/ConfirmActionDialog'

interface Props {
  /** Whether this org already has a Telegram chat connected */
  initialConnected: boolean
  /** The bot username to show in instructions (e.g. "ApolloTim_bot") */
  botUsername: string
}

type Step = 'idle' | 'code_shown' | 'checking' | 'connected' | 'error'

export default function TelegramConnect({ initialConnected, botUsername }: Props) {
  const [step, setStep]       = useState<Step>(initialConnected ? 'connected' : 'idle')
  const [code, setCode]       = useState<string | null>(null)
  const [errorMsg, setError]  = useState<string | null>(null)

  // ── Generate a code ──────────────────────────────────────────────────────

  async function handleGetCode() {
    setStep('checking')
    setError(null)
    try {
      const res  = await fetch('/api/settings/telegram/connect', { method: 'POST' })
      const json = await res.json()
      if (!res.ok || !json.code) throw new Error(json.error ?? 'Failed to generate code')
      setCode(json.code)
      setStep('code_shown')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setStep('error')
    }
  }

  // ── Check if verified ─────────────────────────────────────────────────────

  async function handleCheck() {
    setStep('checking')
    setError(null)
    try {
      const res  = await fetch('/api/settings/telegram/connect')
      const json = await res.json()
      if (json.connected) {
        setStep('connected')
        setCode(null)
      } else {
        setStep('code_shown') // code still valid, not verified yet
        setError('Not confirmed yet. Make sure you sent the code to the bot.')
      }
    } catch {
      setStep('code_shown')
      setError('Could not check status. Try again.')
    }
  }

  // ── Disconnect ────────────────────────────────────────────────────────────

  async function handleDisconnect() {
    setStep('checking')
    await fetch('/api/settings/telegram/connect', { method: 'DELETE' })
    setCode(null)
    setStep('idle')
  }

  // ── Connected state ───────────────────────────────────────────────────────

  if (step === 'connected') {
    return (
      <div className="p-4 rounded-lg border bg-card space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <p className="font-medium text-sm">Telegram Connected</p>
          </div>
          <span className="text-xs bg-green-500/10 text-green-600 px-2 py-0.5 rounded-full font-medium">Active</span>
        </div>
        <p className="text-xs text-muted-foreground">
          You will receive an instant notification when a new lead comes in.
          You can also message <strong>@{botUsername}</strong> to ask questions about your leads and inventory.
        </p>
        <ConfirmActionDialog
          title="Disconnect Telegram?"
          description="You will stop receiving lead notifications in Telegram until you reconnect it."
          confirmLabel="Disconnect"
          confirmVariant="destructive"
          onConfirm={handleDisconnect}
          trigger={(
            <button className="text-xs text-destructive hover:underline">
              Disconnect Telegram
            </button>
          )}
        />
      </div>
    )
  }

  // ── Code shown state ──────────────────────────────────────────────────────

  if (step === 'code_shown' && code) {
    return (
      <div className="p-4 rounded-lg border bg-card space-y-4">
        <div className="flex items-center gap-2">
          <Send className="h-4 w-4 text-primary" />
          <p className="font-medium text-sm">Connect Telegram</p>
        </div>

        {/* Step-by-step instructions */}
        <ol className="text-sm space-y-2 text-muted-foreground list-none">
          <li className="flex gap-2">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold">1</span>
            Open Telegram on your phone or computer
          </li>
          <li className="flex gap-2">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold">2</span>
            Search for <strong className="text-foreground">@{botUsername}</strong> and tap it
          </li>
          <li className="flex gap-2">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold">3</span>
            Tap <strong className="text-foreground">Start</strong> if you haven&apos;t already
          </li>
          <li className="flex gap-2">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold">4</span>
            Send this code to the bot:
          </li>
        </ol>

        {/* The code — large and easy to read */}
        <div className="flex items-center justify-center py-3 rounded-lg bg-muted border">
          <span className="text-3xl font-mono font-bold tracking-[0.25em] text-foreground select-all">
            {code}
          </span>
        </div>

        <p className="text-[11px] text-muted-foreground text-center">
          This code expires in 15 minutes. Do not share it.
        </p>

        {errorMsg && (
          <p className="text-xs text-destructive flex items-center gap-1">
            <XCircle className="h-3 w-3" /> {errorMsg}
          </p>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleCheck}
            className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium py-2.5 hover:bg-primary/90 transition-colors"
          >
            <CheckCircle2 className="h-4 w-4" />
            I sent it — confirm connection
          </button>
          <button
            onClick={handleGetCode}
            title="Get a new code"
            className="px-3 rounded-lg border bg-card hover:bg-accent transition-colors"
          >
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      </div>
    )
  }

  // ── Idle / error state ────────────────────────────────────────────────────

  return (
    <div className="p-4 rounded-lg border bg-card space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Send className="h-4 w-4 text-muted-foreground" />
          <p className="font-medium text-sm">Telegram Notifications</p>
        </div>
        <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-medium">Not connected</span>
      </div>

      <p className="text-xs text-muted-foreground">
        Get an instant Telegram message the moment a new lead comes in — so you can respond within minutes.
        Once connected, you can also ask the bot questions about your inventory and customers.
      </p>

      {errorMsg && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <XCircle className="h-3 w-3" /> {errorMsg}
        </p>
      )}

      <button
        onClick={handleGetCode}
        disabled={step === 'checking'}
        className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium py-2.5 hover:bg-primary/90 disabled:opacity-60 transition-colors"
      >
        {step === 'checking'
          ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating code...</>
          : <><Send className="h-4 w-4" /> Get Setup Code</>
        }
      </button>
    </div>
  )
}
