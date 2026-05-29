'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { formatCurrency } from '@/lib/utils'
import type { CommissionPlan } from './CommissionPlanForm'

interface Props {
  plan: CommissionPlan
  onEdit: () => void
  onDelete: () => void
}

export default function CommissionPlanCard({ plan, onEdit, onDelete }: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  async function handleDelete() {
    setDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/commission-plans/${plan.id}`, { method: 'DELETE' })
      if (res.status === 409) {
        setDeleteError('This plan is used by open transactions and cannot be deleted.')
        return
      }
      if (!res.ok) {
        const data = await res.json() as { error?: string }
        setDeleteError(data.error ?? 'Failed to delete plan.')
        return
      }
      setConfirmDelete(false)
      onDelete()
    } catch {
      setDeleteError('Network error. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  const planTypeLabel: Record<CommissionPlan['plan_type'], string> = {
    percentage_split: 'Percentage Split',
    flat_fee: 'Flat Fee',
    tiered: 'Tiered',
  }

  return (
    <>
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold">{plan.tier_name ?? 'Unnamed Plan'}</p>
              {plan.is_default && (
                <Badge variant="secondary" className="text-xs">Default</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{planTypeLabel[plan.plan_type]}</p>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <Button variant="outline" size="sm" onClick={onEdit} className="h-7 px-2.5 text-xs">
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setDeleteError(null); setConfirmDelete(true) }}
              className="h-7 px-2.5 text-xs text-destructive hover:text-destructive"
            >
              Delete
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          {plan.plan_type === 'percentage_split' && (
            <>
              {plan.agent_split_pct != null && (
                <div>
                  <p className="text-muted-foreground">Agent Split</p>
                  <p className="font-semibold">{plan.agent_split_pct}%</p>
                </div>
              )}
              {plan.broker_split_pct != null && (
                <div>
                  <p className="text-muted-foreground">Broker Split</p>
                  <p className="font-semibold">{plan.broker_split_pct}%</p>
                </div>
              )}
            </>
          )}
          {plan.co_broke_pct != null && plan.co_broke_pct > 0 && (
            <div>
              <p className="text-muted-foreground">Co-Broke %</p>
              <p className="font-semibold">{plan.co_broke_pct}%</p>
            </div>
          )}
          {plan.referral_fee_flat != null && plan.referral_fee_flat > 0 && (
            <div>
              <p className="text-muted-foreground">Referral Fee</p>
              <p className="font-semibold">{formatCurrency(plan.referral_fee_flat)}</p>
            </div>
          )}
        </div>
      </div>

      <Dialog open={confirmDelete} onOpenChange={open => { if (!deleting) setConfirmDelete(open) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Commission Plan?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete &ldquo;{plan.tier_name ?? 'this plan'}&rdquo;. This action cannot be undone.
          </p>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirmDelete(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete Plan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
