'use client'

import { useState, useEffect, useMemo } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { UserCheck } from 'lucide-react'
import { filterAssignableMembersForLead } from '@/lib/leads/filterAssignableMembers'

const ROLE_LABELS: Record<string, string> = {
  dealer_admin: 'Admin',
  dealer_manager: 'Manager',
  dealer_finance: 'Finance',
  dealer_rep: 'Sales Rep',
  dealer_staff: 'Staff',
  admin: 'Admin',
  agent: 'Agent',
}

// Roles that can be assigned leads (not admin-only roles)
const ASSIGNABLE_ROLES = new Set([
  'dealer_manager', 'dealer_finance', 'dealer_rep', 'dealer_staff', 'agent',
])

interface Agent {
  id: string
  display_name: string
  role: string
  location_id?: string | null
  deactivated_at?: string | null
}

interface Props {
  customerId: string
  assignedTo: string | null | undefined
  /** If false, dropdown is read-only (for dealer_rep viewing their own assignment) */
  canReassign?: boolean
  onAssigned?: () => void
  /** Render inline without border/padding wrapper */
  compact?: boolean
  /** Org owner's display name — shown instead of "Unassigned" when no one is explicitly assigned */
  orgOwnerName?: string | null
  leadLocationId?: string | null
  isMultiLocation?: boolean
  /** Multi-location lead without location — block reassignment */
  locationBlocked?: boolean
}

export default function AssignDropdown({
  customerId,
  assignedTo,
  canReassign = true,
  onAssigned,
  compact,
  orgOwnerName = null,
  leadLocationId = null,
  isMultiLocation = false,
  locationBlocked = false,
}: Props) {
  const [agents, setAgents] = useState<Agent[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/admin/users')
      .then(r => r.json())
      .then(d => {
        const all: Agent[] = d.users ?? []
        // Show only assignable roles + exclude deactivated
        setAgents(all.filter(a => ASSIGNABLE_ROLES.has(a.role) && !a.deactivated_at))
      })
      .catch(() => {})
  }, [])

  const pickerAgents = useMemo(
    () => filterAssignableMembersForLead(agents, leadLocationId, isMultiLocation),
    [agents, leadLocationId, isMultiLocation],
  )

  async function handleChange(value: string) {
    if (!canReassign) return
    setSaving(true)
    const newAssignment = value === 'unassigned' ? null : value
    await fetch(`/api/customers/${customerId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigned_to: newAssignment }),
    })
    setSaving(false)
    onAssigned?.()
  }

  if (pickerAgents.length === 0 && !orgOwnerName) return null

  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        <UserCheck className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        <Select
          defaultValue={assignedTo ?? 'unassigned'}
          onValueChange={handleChange}
          disabled={saving || !canReassign || locationBlocked}
        >
          <SelectTrigger className="h-7 text-xs border-0 bg-muted px-2 gap-1 w-auto">
            <SelectValue placeholder={orgOwnerName ? `${orgOwnerName.split(' ')[0]} (owner)` : 'Unassigned'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unassigned">
              {orgOwnerName ? `${orgOwnerName.split(' ')[0]} (owner)` : 'Unassigned'}
            </SelectItem>
            {pickerAgents.map(a => (
              <SelectItem key={a.id} value={a.id}>
                {a.display_name}
                {ROLE_LABELS[a.role] ? ` (${ROLE_LABELS[a.role]})` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b">
      <UserCheck className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      <div className="flex-1">
        <p className="text-xs text-muted-foreground mb-1">Assigned to</p>
        <Select
          defaultValue={assignedTo ?? 'unassigned'}
          onValueChange={handleChange}
          disabled={saving || !canReassign || locationBlocked}
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder={orgOwnerName ? `${orgOwnerName.split(' ')[0]} (owner)` : 'Unassigned'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unassigned">
              {orgOwnerName ? `${orgOwnerName.split(' ')[0]} (owner)` : 'Unassigned'}
            </SelectItem>
            {pickerAgents.map(a => (
              <SelectItem key={a.id} value={a.id}>
                {a.display_name}
                {ROLE_LABELS[a.role] ? ` (${ROLE_LABELS[a.role]})` : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
