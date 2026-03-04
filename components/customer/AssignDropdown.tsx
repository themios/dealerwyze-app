'use client'

import { useState, useEffect } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { UserCheck } from 'lucide-react'

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
  deactivated_at?: string | null
}

interface Props {
  customerId: string
  assignedTo: string | null | undefined
  /** If false, dropdown is read-only (for dealer_rep viewing their own assignment) */
  canReassign?: boolean
  onAssigned?: () => void
}

export default function AssignDropdown({ customerId, assignedTo, canReassign = true, onAssigned }: Props) {
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

  if (agents.length === 0) return null

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b">
      <UserCheck className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      <div className="flex-1">
        <p className="text-xs text-muted-foreground mb-1">Assigned to</p>
        <Select
          defaultValue={assignedTo ?? 'unassigned'}
          onValueChange={handleChange}
          disabled={saving || !canReassign}
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="Unassigned" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {agents.map(a => (
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
