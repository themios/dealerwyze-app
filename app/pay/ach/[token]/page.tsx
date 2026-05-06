import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'
import { verifyAchSetupToken } from '@/lib/bhph/achSetupToken'
import AchSetupClient from './AchSetupClient'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ token: string }>
}

export default async function AchPayPage({ params }: Props) {
  const { token: raw } = await params
  const token = decodeURIComponent(raw)
  const verified = verifyAchSetupToken(token)
  if (!verified) notFound()

  const supabase = createServiceClient()
  const { data: row, error } = await supabase
    .from('bhph_payments')
    .select(`
      user_id,
      monthly_payment, status,
      vehicle:vehicles(year, make, model),
      customer:customers(name)
    `)
    .eq('id', verified.contractId)
    .maybeSingle()

  if (error || !row || row.status !== 'active') notFound()

  const orgId = row.user_id as string
  const { data: orgSettings } = await supabase
    .from('org_settings')
    .select('business_name')
    .eq('org_id', orgId)
    .maybeSingle()

  const veh = row.vehicle as unknown as { year: number; make: string; model: string } | null
  const vehicleDescription = veh ? `${veh.year} ${veh.make} ${veh.model}` : 'your vehicle'
  const cust = row.customer as { name?: string } | null
  const dealerName = (orgSettings?.business_name as string | null)?.trim() || 'Your dealership'

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-md px-4 py-10">
        <h1 className="text-xl font-semibold mb-1">Set up automatic bank payments</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Hi{cust?.name ? ` ${cust.name.split(/\s+/)[0]}` : ''} — link a bank account for your payment plan.
        </p>
        <AchSetupClient
          setupToken={token}
          dealerName={dealerName}
          vehicleDescription={vehicleDescription}
          monthlyAmount={Number(row.monthly_payment)}
        />
      </div>
    </div>
  )
}
