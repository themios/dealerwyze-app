import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import { STORAGE_BASE_QUOTA, STORAGE_PACK_QUOTA } from '@/lib/stripe'

interface GroupedDoc {
  id: string
  label: string
  file_name: string
  file_size: number | null
  created_at: string
}

interface VehicleStorageGroup {
  vehicle_id: string
  label: string
  status: string
  doc_count: number
  total_bytes: number
  docs: GroupedDoc[]
}

interface CustomerStorageGroup {
  customer_id: string
  label: string
  doc_count: number
  total_bytes: number
  docs: GroupedDoc[]
}

// GET /api/settings/storage
// Returns org document storage usage stats grouped by vehicle and customer
export async function GET(): Promise<NextResponse> {
  const profile = await requireProfile()
  const supabase = await createClient()

  // Fetch quota settings + all docs in parallel
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const [{ data: settings }, { data: vDocs, error: vErr }, { data: cDocs, error: cErr }] = await Promise.all([
    supabase.from('org_settings')
      .select('storage_quota_bytes, storage_pack, storage_pack_expires_at')
      .eq('org_id', profile.org_id)
      .maybeSingle(),
    supabase
      .from('vehicle_documents')
      .select('id, vehicle_id, label, file_name, file_size, created_at')
      .eq('user_id', profile.org_id)
      .order('created_at', { ascending: false })
      .limit(500),
    supabase
      .from('customer_documents')
      .select('id, customer_id, label, file_name, file_size, created_at')
      .eq('user_id', profile.org_id)
      .order('created_at', { ascending: false })
      .limit(500),
  ])

  if (vErr || cErr) {
    return NextResponse.json({ error: 'Failed to fetch storage data' }, { status: 500 })
  }

  const allVehicleDocs = vDocs ?? []
  const allCustomerDocs = cDocs ?? []
  const totalBytes = [...allVehicleDocs, ...allCustomerDocs].reduce((s, d) => s + (d.file_size ?? 0), 0)

  // --- Vehicle section ---
  let vehicleList: VehicleStorageGroup[] = []
  if (allVehicleDocs.length > 0) {
    const vehicleIds = [...new Set(allVehicleDocs.map(d => d.vehicle_id))]
    const { data: vehicles } = await supabase
      .from('vehicles')
      .select('id, year, make, model, status')
      .eq('user_id', profile.org_id)
      .in('id', vehicleIds)
    const vehicleMap = new Map((vehicles ?? []).map(v => [v.id, v]))

    const byVehicle = new Map<string, VehicleStorageGroup>()
    for (const doc of allVehicleDocs) {
      const v = vehicleMap.get(doc.vehicle_id)
      if (!byVehicle.has(doc.vehicle_id)) {
        byVehicle.set(doc.vehicle_id, {
          vehicle_id: doc.vehicle_id,
          label: v ? `${v.year} ${v.make} ${v.model}` : 'Unknown Vehicle',
          status: v?.status ?? 'unknown',
          doc_count: 0, total_bytes: 0, docs: [],
        })
      }
      const entry = byVehicle.get(doc.vehicle_id)!
      entry.doc_count++
      entry.total_bytes += doc.file_size ?? 0
      entry.docs.push({ id: doc.id, label: doc.label, file_name: doc.file_name, file_size: doc.file_size, created_at: doc.created_at })
    }
    vehicleList = [...byVehicle.values()].sort((a, b) => b.total_bytes - a.total_bytes)
  }

  // --- Customer section ---
  let customerList: CustomerStorageGroup[] = []
  if (allCustomerDocs.length > 0) {
    const customerIds = [...new Set(allCustomerDocs.map(d => d.customer_id))]
    const { data: customers } = await supabase
      .from('customers')
      .select('id, name')
      .eq('user_id', profile.org_id)
      .in('id', customerIds)
    const customerMap = new Map((customers ?? []).map(c => [c.id, c]))

    const byCustomer = new Map<string, CustomerStorageGroup>()
    for (const doc of allCustomerDocs) {
      const c = customerMap.get(doc.customer_id)
      if (!byCustomer.has(doc.customer_id)) {
        byCustomer.set(doc.customer_id, {
          customer_id: doc.customer_id,
          label: c?.name ?? 'Unknown Customer',
          doc_count: 0, total_bytes: 0, docs: [],
        })
      }
      const entry = byCustomer.get(doc.customer_id)!
      entry.doc_count++
      entry.total_bytes += doc.file_size ?? 0
      entry.docs.push({ id: doc.id, label: doc.label, file_name: doc.file_name, file_size: doc.file_size, created_at: doc.created_at })
    }
    customerList = [...byCustomer.values()].sort((a, b) => b.total_bytes - a.total_bytes)
  }

  // Determine effective quota
  const BASE = STORAGE_BASE_QUOTA
  const packExpired = settings?.storage_pack_expires_at
    ? new Date(settings.storage_pack_expires_at) < new Date()
    : false
  const activePack = (!packExpired && settings?.storage_pack && settings.storage_pack !== 'none')
    ? settings.storage_pack as '10gb' | '25gb'
    : null
  const quotaBytes = activePack ? STORAGE_PACK_QUOTA[activePack] : (settings?.storage_quota_bytes ?? BASE)
  const quotaMb = Math.round(quotaBytes / (1024 * 1024))

  // Time-to-full estimate based on last 30 days upload rate
  const allDocs = [...allVehicleDocs, ...allCustomerDocs]
  const recentBytes = allDocs
    .filter(d => d.created_at >= thirtyDaysAgo)
    .reduce((s, d) => s + (d.file_size ?? 0), 0)
  const mbPerMonth = recentBytes / (1024 * 1024)
  const remainingMb = Math.max(0, (quotaBytes - totalBytes) / (1024 * 1024))
  const monthsToFull = mbPerMonth > 0.5 ? parseFloat((remainingMb / mbPerMonth).toFixed(1)) : null

  return NextResponse.json({
    used_bytes: totalBytes,
    used_mb: parseFloat((totalBytes / (1024 * 1024)).toFixed(1)),
    limit_mb: quotaMb,
    quota_bytes: quotaBytes,
    pct: parseFloat(((totalBytes / quotaBytes) * 100).toFixed(1)),
    doc_count: allVehicleDocs.length + allCustomerDocs.length,
    storage_pack: activePack ?? 'none',
    storage_pack_expires_at: settings?.storage_pack_expires_at ?? null,
    months_to_full: monthsToFull,
    mb_per_month: parseFloat(mbPerMonth.toFixed(1)),
    vehicles: vehicleList,
    customers: customerList,
  })
}
