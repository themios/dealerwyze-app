export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import TopBar from '@/components/layout/TopBar'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import EditVehicleForm from './EditVehicleForm'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function EditVehiclePage({ params }: PageProps) {
  const { id } = await params
  const profile = await requireProfile()
  const supabase = await createClient()

  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('*')
    .eq('id', id)
    .eq('user_id', profile.org_id)
    .single()

  if (!vehicle) notFound()

  return (
    <div>
      <TopBar
        title="Edit Vehicle"
        right={
          <Link href={`/vehicles/${id}`}>
            <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
        }
      />
      <EditVehicleForm vehicle={vehicle} />
    </div>
  )
}
