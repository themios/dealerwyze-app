'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import SettingsPageShell from '@/components/settings/SettingsPageShell'
import CommissionPlanCard from '@/components/commissions/CommissionPlanCard'
import CommissionPlanForm, { type CommissionPlan } from '@/components/commissions/CommissionPlanForm'
import { useVertical } from '@/hooks/useVertical'

/**
 * /settings/commission-plans
 *
 * Broker/admin only. Real estate vertical only.
 * Renders CRUD UI for commission plans (TXN-05).
 */
export default function CommissionPlansPage() {
  const router = useRouter()
  const { vertical } = useVertical()
  const [plans, setPlans] = useState<CommissionPlan[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editPlan, setEditPlan] = useState<CommissionPlan | undefined>(undefined)
  // Role and vertical are checked server-side via middleware/layout, but we also
  // do a client-side soft check using the API response to gate the UI.
  const [permissionDenied, setPermissionDenied] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const res = await fetch('/api/commission-plans')
      if (res.status === 403) {
        setPermissionDenied(true)
        return
      }
      if (!res.ok) {
        setFetchError('Unable to load commission plans. Please refresh.')
        return
      }
      const data = await res.json() as { plans: CommissionPlan[] }
      setPlans(data.plans ?? [])
    } catch {
      setFetchError('Network error. Please check your connection.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Redirect dealer orgs away immediately — this page is RE only
    if (vertical === 'dealer') {
      router.replace('/settings/organization')
      return
    }
    void load()
  }, [vertical, load, router])

  function handleSaved(plan: CommissionPlan) {
    setPlans(prev => {
      const idx = prev.findIndex(p => p.id === plan.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = plan
        return next
      }
      // New plan — reload to get correct sort order
      void load()
      return prev
    })
    setShowForm(false)
    setEditPlan(undefined)
  }

  function handleDeleted(id: string) {
    setPlans(prev => prev.filter(p => p.id !== id))
  }

  function openEdit(plan: CommissionPlan) {
    setEditPlan(plan)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditPlan(undefined)
  }

  if (permissionDenied) {
    return (
      <SettingsPageShell
        title="Commission Plans"
        description="Configure how commissions are split between agents and the brokerage."
      >
        <p className="text-sm text-muted-foreground">
          You don&apos;t have permission to manage commission plans. Contact your office admin.
        </p>
      </SettingsPageShell>
    )
  }

  return (
    <SettingsPageShell
      title="Commission Plans"
      description="Configure how commissions are split between agents and the brokerage."
      headerActions={
        <Button size="sm" onClick={() => { setEditPlan(undefined); setShowForm(true) }}>
          <Plus className="h-4 w-4 mr-1" />
          Add Plan
        </Button>
      }
    >
      {loading ? (
        <div className="space-y-3">
          {[0, 1].map(i => (
            <div key={i} className="h-24 rounded-lg border bg-muted animate-pulse" />
          ))}
        </div>
      ) : fetchError ? (
        <p className="text-sm text-destructive">{fetchError}</p>
      ) : plans.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/30 p-8 text-center space-y-2">
          <p className="text-sm font-medium">No commission plans yet</p>
          <p className="text-xs text-muted-foreground">
            Add your first plan to enable commission calculation at close.
          </p>
          <Button size="sm" variant="outline" className="mt-2" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add Plan
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map(plan => (
            <CommissionPlanCard
              key={plan.id}
              plan={plan}
              onEdit={() => openEdit(plan)}
              onDelete={() => handleDeleted(plan.id)}
            />
          ))}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={open => { if (!open) closeForm() }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editPlan ? 'Edit Commission Plan' : 'Add Commission Plan'}</DialogTitle>
          </DialogHeader>
          <CommissionPlanForm
            plan={editPlan}
            onSave={handleSaved}
            onCancel={closeForm}
          />
        </DialogContent>
      </Dialog>
    </SettingsPageShell>
  )
}
