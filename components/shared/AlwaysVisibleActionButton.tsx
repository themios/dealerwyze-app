'use client'

import React from 'react'
import { Button, type ButtonProps } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Action button that is always visible on mobile, but fades in on hover on desktop.
 * Replaces opacity-0 hover patterns for better mobile UX.
 *
 * On mobile: always visible, bg-muted
 * On desktop (lg): hidden by default, fades in on hover
 */
export const AlwaysVisibleActionButton = React.forwardRef<
  HTMLButtonElement,
  ButtonProps & { 'aria-label'?: string }
>(({ className, children, ...props }, ref) => (
  <Button
    ref={ref}
    type="button"
    variant="ghost"
    size="icon"
    className={cn(
      // Mobile: always visible with bg
      'h-10 w-10 min-h-[44px] min-w-[44px] rounded-lg',
      'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground',
      // Desktop: hidden by default, fade in on hover
      'lg:bg-transparent lg:opacity-100 lg:group-hover:opacity-100 lg:transition-opacity',
      className,
    )}
    {...props}
  >
    {children}
  </Button>
))

AlwaysVisibleActionButton.displayName = 'AlwaysVisibleActionButton'
