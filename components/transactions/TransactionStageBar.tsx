'use client'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  type PipelineStatus,
  VALID_TRANSITIONS,
  canTransition,
  SALE_STAGES,
  LEASE_STAGES,
  isSaleStatus,
} from '@/lib/transactions/types'

const STAGE_LABELS: Record<PipelineStatus, string> = {
  offer:          'Offer',
  under_contract: 'Under Contract',
  inspection:     'Inspection',
  appraisal:      'Appraisal',
  closing:        'Closing',
  closed:         'Closed',
  fallen_through: 'Fallen Through',
  application:    'Application',
  approved:       'Approved',
  lease_signed:   'Lease Signed',
  active:         'Active',
  expired:        'Expired',
  cancelled:      'Cancelled',
}

interface Props {
  currentStage: PipelineStatus
  onAdvance:    (to: PipelineStatus) => void
  onFall:       () => void
  isLoading:    boolean
  /** Broker-only actions (close) are gated on isAdmin; advance is available to all agents. */
  isAdmin:      boolean
}

export default function TransactionStageBar({
  currentStage,
  onAdvance,
  onFall,
  isLoading,
}: Props) {
  const isLeaseTransaction = !isSaleStatus(currentStage)
  const STAGE_ORDER = isLeaseTransaction ? LEASE_STAGES : SALE_STAGES

  const isFallen   = currentStage === 'fallen_through'
  const isCancelled = currentStage === 'cancelled'
  const isClosed   = currentStage === 'closed' || currentStage === 'expired'
  const isTerminal = isFallen || isCancelled || isClosed

  const currentIndex = (isFallen || isCancelled) ? -1 : STAGE_ORDER.indexOf(currentStage)
  const nextMain = VALID_TRANSITIONS[currentStage].find(s => s !== 'fallen_through' && s !== 'cancelled') ?? null
  const terminalLabel = isLeaseTransaction ? 'cancelled' : 'fallen_through'

  return (
    <div className="space-y-3">
      {/* Stage stepper */}
      <div className="flex items-center gap-0">
        {STAGE_ORDER.map((stage, i) => {
          const isDone   = currentIndex > i
          const isActive = !isFallen && STAGE_ORDER[currentIndex] === stage
          const isFuture = !isActive && !isDone

          return (
            <div key={stage} className="flex items-center flex-1 min-w-0">
              {/* Step circle */}
              <div
                className={cn(
                  'flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold border-2 transition-colors',
                  isDone  && 'border-emerald-500 bg-emerald-500 text-white',
                  isActive && 'border-blue-600 bg-blue-600 text-white',
                  isFuture && 'border-border bg-background text-muted-foreground',
                  isFallen && 'border-border bg-background text-muted-foreground',
                )}
              >
                {isDone ? '✓' : i + 1}
              </div>
              {/* Label below is only practical on wider screens; show short labels */}
              {/* Connector line */}
              {i < STAGE_ORDER.length - 1 && (
                <div
                  className={cn(
                    'h-0.5 flex-1',
                    isDone ? 'bg-emerald-500' : 'bg-border',
                  )}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Stage label row */}
      <div className="flex">
        {STAGE_ORDER.map((stage) => {
          const isDone   = currentIndex > STAGE_ORDER.indexOf(stage)
          const isActive = !isFallen && stage === currentStage

          return (
            <div
              key={stage}
              className={cn(
                'flex-1 text-[10px] font-medium text-center truncate px-0.5',
                isDone   && 'text-emerald-600 dark:text-emerald-400',
                isActive && 'text-blue-700 dark:text-blue-400',
                !isDone && !isActive && 'text-muted-foreground',
              )}
            >
              {STAGE_LABELS[stage]}
            </div>
          )
        })}
      </div>

      {/* Terminal state badges */}
      {isFallen && (
        <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2 text-sm font-medium text-red-700 dark:text-red-400">
          Transaction fallen through
        </div>
      )}
      {isCancelled && (
        <div className="rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 px-3 py-2 text-sm font-medium text-red-700 dark:text-red-400">
          Lease cancelled
        </div>
      )}

      {/* Action buttons */}
      {!isTerminal && (
        <div className="flex items-center gap-2 flex-wrap">
          {nextMain && nextMain !== 'closed' && canTransition(currentStage, nextMain) && (
            <Button
              size="sm"
              disabled={isLoading}
              onClick={() => onAdvance(nextMain)}
            >
              {isLoading ? 'Saving…' : `Advance to ${STAGE_LABELS[nextMain]}`}
            </Button>
          )}
          {currentStage === 'closing' && (
            <p className="text-xs text-muted-foreground">Your broker will confirm close to finalize commissions.</p>
          )}
          <Button
            size="sm"
            variant="outline"
            className="text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-950/30"
            disabled={isLoading}
            onClick={onFall}
          >
            {isLeaseTransaction ? 'Cancel Lease' : 'Mark Fallen Through'}
          </Button>
        </div>
      )}
    </div>
  )
}
