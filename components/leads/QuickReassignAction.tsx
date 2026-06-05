'use client'

import React, { useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { useMediaQuery } from '@/hooks/useMediaQuery'

interface User {
  id: string
  name: string
  email: string
}

interface Props {
  currentUser: User | null
  availableUsers: User[]
  onReassign: (userId: string) => Promise<void>
  isLoading?: boolean
  trigger?: React.ReactNode
}

function getUserInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function UserInitial({ name }: { name: string }) {
  return (
    <div className="h-8 w-8 flex-shrink-0 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground">
      {getUserInitials(name)}
    </div>
  )
}

/**
 * Quick reassign action that adapts to viewport:
 * - Mobile (<768px): Bottom sheet with list
 * - Tablet (768px–1023px): Side sheet (right) with list
 * - Desktop (≥1024px): Dropdown menu
 *
 * Reduces clicks from modal → picker → save (4 clicks) to sheet/dropdown tap (2 clicks).
 */
export function QuickReassignAction({
  currentUser,
  availableUsers,
  onReassign,
  isLoading = false,
  trigger,
}: Props) {
  const isMobile = useMediaQuery('(max-width: 767px)')
  const isTablet = useMediaQuery('(min-width: 768px) and (max-width: 1023px)')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [reassigning, setReassigning] = useState(false)

  const handleReassign = async (userId: string) => {
    setReassigning(true)
    try {
      await onReassign(userId)
      setSheetOpen(false)
      setDropdownOpen(false)
    } finally {
      setReassigning(false)
    }
  }

  const defaultTrigger = (
    <Button
      variant="ghost"
      size="sm"
      className="h-auto p-1"
      aria-label="Reassign"
    >
      {trigger || <span>Reassign</span>}
    </Button>
  )

  if (isMobile || isTablet) {
    return (
      <>
        <div onClick={() => setSheetOpen(true)}>
          {trigger || defaultTrigger}
        </div>

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent
            side={isMobile ? 'bottom' : 'right'}
            className={isMobile ? 'max-h-[60vh] rounded-t-lg' : 'max-w-sm'}
          >
            <SheetHeader>
              <SheetTitle>Reassign lead</SheetTitle>
              <SheetDescription>
                Select a team member to reassign this lead to.
              </SheetDescription>
            </SheetHeader>

            <div className={isMobile ? 'mt-4 space-y-2' : 'mt-6 space-y-2 pr-4'}>
              {availableUsers.map(user => (
                <button
                  key={user.id}
                  onClick={() => handleReassign(user.id)}
                  disabled={reassigning || isLoading}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
                >
                  <UserInitial name={user.name} />
                  <div className="text-left min-w-0 flex-1">
                    <p className="text-sm font-medium">{user.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                </button>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </>
    )
  }

  return (
    <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
      <DropdownMenuTrigger asChild>
        {trigger || defaultTrigger}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {currentUser && (
          <>
            <div className="px-2 py-1.5 text-xs text-muted-foreground font-semibold">
              Current
            </div>
            <DropdownMenuItem disabled>
              <UserInitial name={currentUser.name} />
              <div className="text-left ml-2">
                <p className="text-sm font-medium">{currentUser.name}</p>
                <p className="text-xs text-muted-foreground">{currentUser.email}</p>
              </div>
            </DropdownMenuItem>
          </>
        )}

        {availableUsers.length > 0 && (
          <>
            <div className="px-2 py-1.5 text-xs text-muted-foreground font-semibold mt-2 border-t">
              Reassign to
            </div>
            {availableUsers.map(user => (
              <DropdownMenuItem
                key={user.id}
                onClick={() => handleReassign(user.id)}
                disabled={reassigning || isLoading}
              >
                <UserInitial name={user.name} />
                <div className="text-left ml-2">
                  <p className="text-sm font-medium">{user.name}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
