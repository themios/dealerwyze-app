'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { UserCheck } from 'lucide-react'

interface Agent {
  id: string
  display_name: string
  role: string
}

interface Props {
  customerId: string
  assignedTo: string | null | undefined
  onAssigned?: () => void
}

export default function AssignDropdown({ customerId, assignedTo, onAssigned }: Props) {
  const [agents, setAgents] = useState<Agent[]>([])
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    fetch('/api/admin/users')
      .then(r => r.json())
      .then(d => setAgents(d.users ?? []))
      .catch(() => {})
  }, [])

  async function handleChange(value: string) {
    setSaving(true)
    const newAssignment = value === 'unassigned' ? null : value
    await supabase
      .from('customers')
      .update({ assigned_to: newAssignment })
      .eq('id', customerId)
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
          disabled={saving}
        >
          <SelectTrigger className="h-9 text-sm">
            <SelectValue placeholder="Unassigned" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unassigned">Unassigned</SelectItem>
            {agents.map(a => (
              <SelectItem key={a.id} value={a.id}>
                {a.display_name}
                {a.role === 'admin' ? ' (admin)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
