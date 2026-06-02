import { createServiceClient } from '@/lib/supabase/service'

export async function getAgentContact(
  supabase: ReturnType<typeof createServiceClient>,
  agentId: string
): Promise<{ email?: string; phone?: string } | null> {
  try {
    const { data, error } = await supabase.auth.admin.getUserById(agentId)
    if (error) {
      console.error('[getAgentContact] Failed fetching auth user:', { agentId, error: error.message })
      return null
    }

    const email = data?.user?.email ?? undefined
    const phone = data?.user?.phone ?? undefined
    if (!email && !phone) {
      console.warn('[getAgentContact] Agent has no email or phone on auth user:', { agentId })
      return null
    }

    return { email, phone }
  } catch (err) {
    console.error('[getAgentContact] Unexpected error fetching agent contact:', { agentId, err })
    return null
  }
}
