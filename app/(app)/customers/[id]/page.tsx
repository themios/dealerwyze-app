export const dynamic = 'force-dynamic'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import TopBar from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Pencil } from 'lucide-react'
import CustomerDetailClient from './CustomerDetailClient'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function CustomerDetailPage({ params }: PageProps) {
  const { id } = await params
  const profile = await requireProfile()
  const supabase = await createClient()

  const [{ data: customer }, { data: activities }, { data: tasks }] = await Promise.all([
    supabase.from('customers').select('*').eq('id', id).eq('user_id', profile.org_id).single(),
    supabase.from('activities').select('*, vehicle:vehicles(id, year, make, model)').eq('customer_id', id).order('created_at', { ascending: false }).limit(50),
    supabase.from('tasks')
      .select('id, title, task_type, priority, due_at, status, notes')
      .eq('linked_customer_id', id)
      .eq('status', 'open')
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(20),
  ])

  if (!customer) notFound()

  return (
    <div>
      <TopBar
        title={customer.name}
        right={
          <div className="flex items-center gap-1">
            <Link href={`/customers/${id}/edit`}>
              <Button variant="ghost" size="sm"><Pencil className="h-4 w-4" /></Button>
            </Link>
            <Link href="/customers">
              <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /></Button>
            </Link>
          </div>
        }
      />
      <CustomerDetailClient customer={customer} activities={activities || []} isAdmin={profile.role === 'admin'} tasks={tasks || []} />
    </div>
  )
}
