import type { UserRole } from '@/types/index'
import { isDealerAdmin } from '@/lib/auth/dealerRoles'

export type SettingsAudience = 'dealer_admin' | 'manager_plus' | 'all'

const SETTINGS_AUDIENCE_LABELS: Record<Exclude<SettingsAudience, 'all'>, string> = {
  dealer_admin: 'Admin only',
  manager_plus: 'Manager+',
}

export function canViewSettingsAudience(role: UserRole, audience: SettingsAudience): boolean {
  switch (audience) {
    case 'all':
      return true
    case 'dealer_admin':
      return isDealerAdmin(role)
    case 'manager_plus':
      return role === 'dealer_admin' || role === 'dealer_manager' || role === 'admin'
    default:
      return false
  }
}

export function describeSettingsAudience(audience: SettingsAudience): string | undefined {
  if (audience === 'all') return undefined
  return SETTINGS_AUDIENCE_LABELS[audience]
}
