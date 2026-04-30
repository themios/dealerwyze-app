import type { UserRole } from '@/types/index'
import { isDealerAdmin } from '@/lib/auth/dealerRoles'

export type SettingsAudience = 'dealer_admin' | 'manager_plus' | 'all'

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
