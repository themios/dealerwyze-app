export const dynamic = 'force-dynamic'

import { createClientForRequest } from '@/lib/supabase/forRequest'
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
  const supabase = await createClientForRequest()

  const [{ data: vehicle }, { data: orgRow }] = await Promise.all([
    supabase
      .from('vehicles')
      .select('*')
      .eq('id', id)
      .eq('user_id', profile.org_id)
      .single(),
    supabase
      .from('organizations')
      .select('vertical')
      .eq('id', profile.org_id)
      .maybeSingle(),
  ])

  if (!vehicle) notFound()
  const isRe = (orgRow?.vertical as string | null) === 'real_estate'

  return (
    <div>
      <TopBar
        title={isRe ? 'Edit Listing' : 'Edit Vehicle'}
        right={
          <Link href={`/vehicles/${id}`}>
            <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4" /></Button>
          </Link>
        }
      />
      <EditVehicleForm vehicle={vehicle} isRe={isRe} />
    </div>
  )
}
