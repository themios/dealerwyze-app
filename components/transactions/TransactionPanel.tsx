'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Paperclip, Loader2, FileText, Image } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import {
  type Transaction,
  type PipelineStatus,
  isTerminalPipelineStatus,
  pickActiveTransaction as pickActive,
} from '@/lib/transactions/types'
import TransactionStageBar from './TransactionStageBar'
import TransactionForm from './TransactionForm'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

interface VehicleDoc {
  id: string
  label: string
  file_name: string
  file_type: string
  signed_url: string | null
  created_at: string
}

interface Props {
  vehicleId:               string
  isAdmin:                 boolean
  agentId:                 string
  currentUserIsAuthority:  boolean
  brokerName:              string | null
}

type UIMode = 'view' | 'create' | 'edit'

function formatDate(value: string | null | undefined) {
  if (!value) return null
  return new Intl.DateTimeFormat('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/Los_Angeles',
  }).format(new Date(value))
}

function terminalStatusLabel(status: PipelineStatus): string {
  return status.replace(/_/g, ' ')
}

export default function TransactionPanel({ vehicleId, isAdmin, agentId, currentUserIsAuthority, brokerName }: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading]           = useState(true)
  const [fetchError, setFetchError]     = useState<string | null>(null)
  const [mode, setMode]                 = useState<UIMode>('view')
  const [advancing, setAdvancing]       = useState(false)
  const [stageNote, setStageNote]       = useState('')
  const [savingNote, setSavingNote]     = useState(false)
  const [confirmFall, setConfirmFall]   = useState(false)
  const [confirmClose, setConfirmClose]       = useState(false)
  const [closing, setClosing]                 = useState(false)
  const [closeError, setCloseError]           = useState<string | null>(null)
  const [closePrice, setClosePrice]           = useState('')
  const [closeDate, setCloseDate]             = useState('')
  const [docs, setDocs]                 = useState<VehicleDoc[]>([])
  const [docLabel, setDocLabel]         = useState('')
  const [uploading, setUploading]       = useState(false)
  const [uploadError, setUploadError]   = useState<string | null>(null)
  const fileInputRef                    = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const [txnRes, docRes] = await Promise.all([
        fetch(`/api/transactions?vehicle_id=${encodeURIComponent(vehicleId)}`),
        fetch(`/api/vehicles/${encodeURIComponent(vehicleId)}/documents`),
      ])
      if (!txnRes.ok) {
        setFetchError('Unable to load transaction data. Please refresh.')
        return
      }
      const txnData = await txnRes.json() as { transactions: Transaction[] }
      setTransactions(txnData.transactions ?? [])
      if (docRes.ok) {
        const docData = await docRes.json() as VehicleDoc[]
        setDocs(docData ?? [])
      }
    } catch {
      setFetchError('Network error. Please check your connection.')
    } finally {
      setLoading(false)
    }
  }, [vehicleId])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!docLabel.trim()) {
      setUploadError('Add a label before uploading (e.g. "Inspection report")')
      return
    }
    setUploading(true)
    setUploadError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('label', docLabel.trim())
      form.append('document_scope', 'inventory')
      const res = await fetch(`/api/vehicles/${vehicleId}/documents`, { method: 'POST', body: form })
      const data = await res.json() as { error?: string }
      if (!res.ok) {
        setUploadError(data.error ?? 'Upload failed. Try a smaller file or different format.')
        return
      }
      setDocLabel('')
      if (fileInputRef.current) fileInputRef.current.value = ''
      await load()
    } catch {
      setUploadError('Network error during upload.')
    } finally {
      setUploading(false)
    }
  }

  useEffect(() => { void load() }, [load])

  async function handleAdvance(to: PipelineStatus) {
    const active = pickActive(transactions)
    if (!active) return
    setAdvancing(true)
    try {
      const res = await fetch(`/api/transactions/${active.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipeline_status: to }),
      })
      if (!res.ok) return
      await load()
    } finally {
      setAdvancing(false)
    }
  }

  async function handleFall() {
    const active = pickActive(transactions)
    if (!active) return
    setConfirmFall(false)
    setAdvancing(true)
    const terminalStatus = active.transaction_type === 'lease' ? 'cancelled' : 'fallen_through'
    try {
      const res = await fetch(`/api/transactions/${active.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipeline_status: terminalStatus }),
      })
      if (!res.ok) return
      await load()
    } finally {
      setAdvancing(false)
    }
  }

  async function handleSaveNote(transactionId: string, currentStage: PipelineStatus, existingNotes: string | null) {
    if (!stageNote.trim()) return
    setSavingNote(true)
    const stageLabel = currentStage.replace(/_/g, ' ')
    const date = new Date().toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' })
    const newEntry = `[${date} · ${stageLabel}] ${stageNote.trim()}`
    const combined = existingNotes ? `${existingNotes}\n${newEntry}` : newEntry
    try {
      const res = await fetch(`/api/transactions/${transactionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: combined }),
      })
      if (res.ok) {
        setStageNote('')
        await load()
      }
    } finally {
      setSavingNote(false)
    }
  }

  function handleSaved(t: Transaction) {
    setTransactions(prev => {
      const idx = prev.findIndex(x => x.id === t.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = t
        return next
      }
      return [t, ...prev]
    })
    setMode('view')
  }

  // --- Loading ---
  if (loading) {
    return (
      <div className="rounded-lg border bg-card p-4">
        <div className="animate-pulse space-y-2">
          <div className="h-3 w-1/3 bg-muted rounded" />
          <div className="h-6 bg-muted rounded" />
          <div className="h-6 bg-muted rounded w-2/3" />
        </div>
      </div>
    )
  }

  // --- Error ---
  if (fetchError) {
    return (
      <div className="rounded-lg border bg-card p-4 text-sm text-red-600 dark:text-red-400">
        {fetchError}
      </div>
    )
  }

  // --- Create mode ---
  if (mode === 'create') {
    return (
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <p className="text-sm font-semibold">Create Transaction</p>
        <TransactionForm
          vehicleId={vehicleId}
          agentId={agentId}
          onSave={handleSaved}
          onCancel={() => setMode('view')}
        />
      </div>
    )
  }

  // --- Empty state ---
  if (transactions.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-6 text-center space-y-3">
        <p className="text-sm text-muted-foreground">No transaction yet for this listing.</p>
        <Button size="sm" onClick={() => setMode('create')}>Create Transaction</Button>
      </div>
    )
  }

  const active = pickActive(transactions)
  const others = active
    ? transactions.filter(t => t.id !== active.id)
    : transactions

  // All transactions are terminal (cancelled, expired, closed, etc.) — offer a fresh start
  if (!active && transactions.length > 0) {
    const latest = transactions[0]
    return (
      <div className="space-y-3">
        <div className="rounded-lg border bg-card p-6 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            The latest transaction on this listing is{' '}
            <span className="font-medium capitalize">{terminalStatusLabel(latest.pipeline_status)}</span>.
            Start a new one to track the next deal.
          </p>
          <Button size="sm" onClick={() => setMode('create')}>Create New Transaction</Button>
        </div>
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Previous transactions</p>
          {others.map(t => (
            <div key={t.id} className="rounded-lg border bg-card px-3 py-2 text-xs flex items-center justify-between gap-2">
              <span className="font-mono">{t.transaction_number ?? t.id.slice(0, 8)}</span>
              <span className="capitalize text-muted-foreground">{terminalStatusLabel(t.pipeline_status)}</span>
              {t.monthly_rent != null && (
                <span className="tabular-nums">{formatCurrency(t.monthly_rent)}/mo</span>
              )}
              {t.offer_amount != null && (
                <span className="tabular-nums">{formatCurrency(t.offer_amount)}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // --- Edit mode ---
  if (mode === 'edit' && active) {
    return (
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <p className="text-sm font-semibold">Edit Transaction</p>
        <TransactionForm
          vehicleId={vehicleId}
          agentId={agentId}
          transaction={active}
          onSave={handleSaved}
          onCancel={() => setMode('view')}
        />
      </div>
    )
  }

  // --- View mode ---
  return (
    <div className="space-y-3">
      {active && (
        <div className="rounded-lg border bg-card p-4 space-y-4">
          {/* Header row */}
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs text-muted-foreground">Transaction</p>
              <p className="text-sm font-semibold">{active.transaction_number ?? 'TXN'}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setMode('edit')}>Edit</Button>
          </div>

          {/* Stage bar */}
          <TransactionStageBar
            currentStage={active.pipeline_status}
            onAdvance={handleAdvance}
            onFall={() => setConfirmFall(true)}
            isLoading={advancing}
            isAdmin={isAdmin}
          />

          {/* Fallen Through confirmation dialog */}
          <Dialog open={confirmFall} onOpenChange={setConfirmFall}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Mark as Fallen Through?</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                {active?.transaction_type === 'lease'
                  ? 'This will mark the lease as cancelled. This action cannot be undone.'
                  : 'This will close the transaction as fallen through. This action cannot be undone.'}
              </p>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={() => setConfirmFall(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={advancing}
                  onClick={handleFall}
                >
                  {advancing ? 'Saving…' : 'Yes, Mark Fallen Through'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Close authority info + Confirm Close button */}
          {active.pipeline_status === 'closing' && (
            <div className="rounded-md bg-muted/40 px-3 py-2 space-y-2">
              {currentUserIsAuthority ? (
                <>
                  <p className="text-xs text-muted-foreground">You have authority to confirm close.</p>
                  {active.final_sale_price == null && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">Enter the final sale price in Edit before closing.</p>
                  )}
                  {active.closing_date == null && (
                    <p className="text-xs text-amber-600 dark:text-amber-400">Enter the closing date in Edit before closing.</p>
                  )}
                  <Button
                    size="sm"
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                    disabled={closing}
                    onClick={() => {
                      setCloseError(null)
                      setClosePrice(active.final_sale_price != null ? String(active.final_sale_price) : '')
                      setCloseDate(active.closing_date ?? '')
                      setConfirmClose(true)
                    }}
                  >
                    Confirm Close
                  </Button>
                  {closeError && <p className="text-xs text-destructive">{closeError}</p>}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Broker confirmation required from: {brokerName ?? 'your org admin'}.
                </p>
              )}
            </div>
          )}

          {/* Confirm Close dialog — collects/verifies closing date and price inline */}
          <Dialog open={confirmClose} onOpenChange={open => { if (!closing) setConfirmClose(open) }}>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Confirm Close</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Finalizes the deal and calculates commission splits. This cannot be undone.
                </p>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Final Sale Price *</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                      <Input
                        type="number"
                        min={1}
                        step="0.01"
                        placeholder="e.g. 865000"
                        value={closePrice}
                        onChange={e => setClosePrice(e.target.value)}
                        className="pl-6 h-10"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Closing Date *</label>
                    <Input
                      type="date"
                      value={closeDate}
                      onChange={e => setCloseDate(e.target.value)}
                      className="h-10"
                    />
                  </div>
                </div>
                {closeError && <p className="text-xs text-destructive">{closeError}</p>}
              </div>
              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={() => setConfirmClose(false)} disabled={closing}>
                  Cancel
                </Button>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  disabled={closing || !closePrice || !closeDate}
                  onClick={async () => {
                    if (!closePrice || !closeDate) {
                      setCloseError('Both final sale price and closing date are required.')
                      return
                    }
                    setClosing(true)
                    setCloseError(null)
                    try {
                      const res = await fetch(`/api/transactions/${active.id}/close`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          closing_price: parseFloat(closePrice),
                          closing_date:  closeDate,
                        }),
                      })
                      const data = await res.json() as { error?: string }
                      if (!res.ok) {
                        setCloseError(data.error ?? 'Close failed. Please try again.')
                        return
                      }
                      setConfirmClose(false)
                      await load()
                    } finally {
                      setClosing(false)
                    }
                  }}
                >
                  {closing ? 'Closing…' : 'Confirm Close'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Stage-specific notes */}
          {!isTerminalPipelineStatus(active.pipeline_status) && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground font-medium">
                Add a note for this stage ({active.pipeline_status.replace(/_/g, ' ')})
              </p>
              <Textarea
                rows={2}
                placeholder="Inspection scheduled, issues found, buyer feedback..."
                value={stageNote}
                onChange={e => setStageNote(e.target.value)}
                className="text-sm resize-none"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!stageNote.trim() || savingNote}
                onClick={() => handleSaveNote(active.id, active.pipeline_status, active.notes ?? null)}
              >
                {savingNote ? 'Saving…' : 'Save Note'}
              </Button>
            </div>
          )}

          {/* Key details */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            {active.offer_amount != null && (
              <div>
                <p className="text-xs text-muted-foreground">Offer Amount</p>
                <p className="font-semibold tabular-nums">{formatCurrency(active.offer_amount)}</p>
              </div>
            )}
            {active.offer_date && (
              <div>
                <p className="text-xs text-muted-foreground">Offer Date</p>
                <p className="font-semibold">{formatDate(active.offer_date)}</p>
              </div>
            )}
            {active.inspection_deadline && (
              <div>
                <p className="text-xs text-muted-foreground">Inspection Deadline</p>
                <p className="font-semibold">{formatDate(active.inspection_deadline)}</p>
              </div>
            )}
            {active.commission_pct != null && (
              <div>
                <p className="text-xs text-muted-foreground">Commission %</p>
                <p className="font-semibold">{active.commission_pct}%</p>
              </div>
            )}
            {active.closing_date && (
              <div>
                <p className="text-xs text-muted-foreground">Closing Date</p>
                <p className="font-semibold">{formatDate(active.closing_date)}</p>
              </div>
            )}
            {active.final_sale_price != null && (
              <div>
                <p className="text-xs text-muted-foreground">Final Sale Price</p>
                <p className="font-semibold tabular-nums">{formatCurrency(active.final_sale_price)}</p>
              </div>
            )}
          </div>

          {/* Contingencies */}
          {active.contingencies && active.contingencies.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Contingencies</p>
              <div className="flex flex-wrap gap-1">
                {active.contingencies.map(c => (
                  <span key={c} className="text-xs bg-muted px-2 py-0.5 rounded-full">{c}</span>
                ))}
              </div>
            </div>
          )}

          {/* Parties */}
          {active.parties && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Parties</p>
              <div className="grid grid-cols-2 gap-1 text-xs">
                {active.parties.buyerAgent   && <p><span className="text-muted-foreground">Buyer agent:</span> {active.parties.buyerAgent}</p>}
                {active.parties.sellerAgent  && <p><span className="text-muted-foreground">Seller agent:</span> {active.parties.sellerAgent}</p>}
                {active.parties.titleCompany && <p><span className="text-muted-foreground">Title:</span> {active.parties.titleCompany}</p>}
                {active.parties.lender       && <p><span className="text-muted-foreground">Lender:</span> {active.parties.lender}</p>}
              </div>
            </div>
          )}

          {/* Notes — displayed as a log, one entry per line */}
          {active.notes && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Notes</p>
              <div className="space-y-1">
                {active.notes.split('\n').map(l => l.trim()).filter(Boolean).map((line, i) => (
                  <p key={i} className="text-xs bg-muted/40 rounded px-2 py-1">{line}</p>
                ))}
              </div>
            </div>
          )}

          {/* Document upload */}
          <div className="border-t pt-3 mt-1 space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Documents</p>

            {/* Existing docs */}
            {docs.length > 0 && (
              <div className="space-y-1">
                {docs.map(doc => (
                  <a
                    key={doc.id}
                    href={doc.signed_url ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-xs rounded-md px-2 py-1.5 bg-muted/40 hover:bg-muted/70 transition-colors"
                  >
                    {doc.file_type.startsWith('image/') ? <Image className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                    <span className="flex-1 truncate">{doc.label}</span>
                    <span className="text-muted-foreground/60 shrink-0">{doc.file_name}</span>
                  </a>
                ))}
              </div>
            )}

            {/* Upload new */}
            <div className="flex gap-2 items-start">
              <Input
                placeholder="Label (e.g. Inspection report)"
                value={docLabel}
                onChange={e => { setDocLabel(e.target.value); setUploadError(null) }}
                className="h-8 text-xs flex-1"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 shrink-0 gap-1"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                {uploading ? 'Uploading…' : 'Attach'}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,application/pdf,.heic,.heif"
                className="hidden"
                capture="environment"
                onChange={handleUpload}
              />
            </div>
            {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
            <p className="text-[10px] text-muted-foreground">Photos, PDFs up to 5 MB. On mobile, tap Attach to use your camera.</p>
          </div>
        </div>
      )}

      {/* Other (collapsed) transactions */}
      {others.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Previous transactions</p>
          {others.map(t => (
            <div key={t.id} className="rounded-lg border bg-card px-3 py-2 text-xs flex items-center justify-between gap-2">
              <span className="font-mono">{t.transaction_number ?? t.id.slice(0, 8)}</span>
              <span className="capitalize text-muted-foreground">{t.pipeline_status.replace(/_/g, ' ')}</span>
              {t.offer_amount != null && (
                <span className="tabular-nums">{formatCurrency(t.offer_amount)}</span>
              )}
            </div>
          ))}
        </div>
      )}

    </div>
  )
}
