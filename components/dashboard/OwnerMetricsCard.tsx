'use client'

import React from 'react'
import { cn } from '@/lib/utils'

interface Metric {
  label: string
  value: string | number
  trend?: 'up' | 'down' | 'neutral'
  trendValue?: string
}

interface Props {
  title: string
  metrics: Metric[]
  className?: string
}

/**
 * Responsive metrics card for dashboard.
 * Replaces hidden lg:block with responsive grid that works on all viewports.
 *
 * On mobile: 1 or 2 columns
 * On tablet: 2 columns
 * On desktop: 2-3 columns
 */
export function OwnerMetricsCard({ title, metrics, className }: Props) {
  return (
    <div className={cn('rounded-lg border border-border bg-card p-4', className)}>
      <h3 className="text-sm font-semibold text-foreground mb-4">{title}</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        {metrics.map((metric, idx) => (
          <div key={idx} className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium">{metric.label}</p>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-semibold text-foreground">{metric.value}</span>
              {metric.trendValue && (
                <span
                  className={cn(
                    'text-xs font-medium',
                    metric.trend === 'up' && 'text-green-600 dark:text-green-400',
                    metric.trend === 'down' && 'text-red-600 dark:text-red-400',
                    metric.trend === 'neutral' && 'text-muted-foreground',
                  )}
                >
                  {metric.trend === 'up' && '↑'}
                  {metric.trend === 'down' && '↓'}
                  {metric.trendValue}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
