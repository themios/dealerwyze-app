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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useMediaQuery } from '@/hooks/useMediaQuery'

interface User {
  id: string
  name: string
  email: string
  avatar_url?: string
}

interface Props {
  currentUser: User | null
  availableUsers: User[]
  onReassign: (userId: string) => Promise<void>
  isLoading?: boolean
  trigger?: React.ReactNode
}

/**
 * Quick reassign action that adapts to viewport:
 * - Mobile (<768px): Bottom sheet with list
 * - Desktop (≥768px): Dropdown menu
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

  if (isMobile) {
    return (
      <>
        <div onClick={() => setSheetOpen(true)}>
          {trigger || defaultTrigger}
        </div>

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent side="bottom" className="max-h-[60vh] rounded-t-lg">
            <SheetHeader>
              <SheetTitle>Reassign lead</SheetTitle>
              <SheetDescription>
                Select a team member to reassign this lead to.
              </SheetDescription>
            </SheetHeader>

            <div className="mt-4 space-y-2">
              {availableUsers.map(user => (
                <button
                  key={user.id}
                  onClick={() => handleReassign(user.id)}
                  disabled={reassigning || isLoading}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
                >
                  <Avatar className="h-10 w-10 flex-shrink-0">
                    <AvatarImage src={user.avatar_url} alt={user.name} />
                    <AvatarFallback>{user.name.charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
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
              <Avatar className="h-8 w-8 mr-2 flex-shrink-0">
                <AvatarImage src={currentUser.avatar_url} alt={currentUser.name} />
                <AvatarFallback>{currentUser.name.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="text-left">
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
                <Avatar className="h-8 w-8 mr-2 flex-shrink-0">
                  <AvatarImage src={user.avatar_url} alt={user.name} />
                  <AvatarFallback>{user.name.charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="text-left">
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
