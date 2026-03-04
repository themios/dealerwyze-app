import type { UserRole } from '@/types/index'
import { isDealerAdmin } from '@/types/index'

export function canManageUsers(role: UserRole): boolean {
  return isDealerAdmin(role)
}

export function canAccessBilling(role: UserRole): boolean {
  return isDealerAdmin(role)
}

export function canAccessBhph(role: UserRole): boolean {
  return role !== 'dealer_rep'
}

export function canAccessLedger(role: UserRole): boolean {
  return role !== 'dealer_rep'
}

export function canAccessReports(role: UserRole): boolean {
  return role === 'dealer_admin' || role === 'dealer_manager' || role === 'admin'
}

export function isRepRestricted(role: UserRole): boolean {
  return role === 'dealer_rep'
}

export function canAssignLeads(role: UserRole): boolean {
  return isDealerAdmin(role) || role === 'dealer_manager'
}

/** All roles that can be assigned work/leads (excludes dealer_admin) */
export const ASSIGNABLE_ROLES: UserRole[] = [
  'dealer_manager',
  'dealer_finance',
  'dealer_rep',
  'dealer_staff',
  'agent',
]

/** Human-readable labels for all dealer roles */
export const ROLE_LABELS: Record<UserRole, string> = {
  dealer_admin: 'Admin',
  dealer_manager: 'Manager',
  dealer_finance: 'Finance / BDR',
  dealer_rep: 'Sales Rep',
  dealer_staff: 'Staff',
  admin: 'Admin',
  agent: 'Agent',
}

export const ROLE_DESCRIPTIONS: Partial<Record<UserRole, string>> = {
  dealer_admin: 'Full access including billing and user management',
  dealer_manager: 'All leads/customers/vehicles and reports, no billing',
  dealer_finance: 'Full operational access including BHPH and ledger',
  dealer_rep: 'Sees only their assigned leads',
  dealer_staff: 'Full operational access, no billing or user management',
}
