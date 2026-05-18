'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { resetPostHogSession } from '@/lib/posthog/identify'

interface Props {
  variant?: 'light' | 'dark'
}

export default function SignOutButton({ variant = 'light' }: Props) {
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    resetPostHogSession()
    router.replace('/login')
  }

  if (variant === 'dark') {
    return (
      <button
        onClick={handleSignOut}
        className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors text-white/50 hover:text-red-400 hover:bg-red-400/10"
      >
        <LogOut className="h-4 w-4" />
        Sign Out
      </button>
    )
  }

  return (
    <button
      onClick={handleSignOut}
      className="flex items-center gap-2 w-full p-4 rounded-lg border bg-card hover:bg-destructive/5 hover:border-destructive/30 transition-colors text-destructive text-sm font-medium"
    >
      <LogOut className="h-4 w-4" />
      Sign Out
    </button>
  )
}
