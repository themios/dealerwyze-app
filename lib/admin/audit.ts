import { createServiceClient } from '@/lib/supabase/service'

export async function logAdminAction(
  adminUserId: string,
  action: string,
  targetOrgId: string | null,
  details?: Record<string, unknown>,
): Promise<void> {
  const supabase = createServiceClient()
  await supabase.from('admin_audit_log').insert({
    admin_user_id: adminUserId,
    action,
    target_org_id: targetOrgId,
    details: details ?? null,
  })
}
