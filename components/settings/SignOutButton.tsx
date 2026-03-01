'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'

export default function SignOutButton() {
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/login')
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
