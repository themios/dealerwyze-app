import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'

const CAP_MB = 500
const CAP_BYTES = CAP_MB * 1024 * 1024

// GET /api/settings/storage
// Returns org document storage usage stats grouped by vehicle
export async function GET(): Promise<NextResponse> {
  const profile = await requireProfile()
  const supabase = await createClient()

  // Fetch all docs for this org
  const { data: docs, error: docsErr } = await supabase
    .from('vehicle_documents')
    .select('id, vehicle_id, label, file_name, file_size, created_at')
    .eq('user_id', profile.org_id)
    .order('created_at', { ascending: false })
    .limit(500)

  if (docsErr) {
    return NextResponse.json({ error: 'Failed to fetch storage data' }, { status: 500 })
  }

  const allDocs = docs ?? []
  if (allDocs.length === 0) {
    return NextResponse.json({
      used_bytes: 0, used_mb: 0, limit_mb: CAP_MB, pct: 0, doc_count: 0, vehicles: [],
    })
  }

  // Fetch vehicle metadata for vehicles that have docs
  const vehicleIds = [...new Set(allDocs.map(d => d.vehicle_id))]
  const { data: vehicles } = await supabase
    .from('vehicles')
    .select('id, year, make, model, status')
    .eq('user_id', profile.org_id)
    .in('id', vehicleIds)

  const vehicleMap = new Map((vehicles ?? []).map(v => [v.id, v]))

  // Aggregate by vehicle
  const byVehicle = new Map<string, {
    vehicle_id: string
    label: string
    status: string
    doc_count: number
    total_bytes: number
    docs: { id: string; label: string; file_name: string; file_size: number | null; created_at: string }[]
  }>()

  for (const doc of allDocs) {
    const v = vehicleMap.get(doc.vehicle_id)
    if (!byVehicle.has(doc.vehicle_id)) {
      byVehicle.set(doc.vehicle_id, {
        vehicle_id: doc.vehicle_id,
        label: v ? `${v.year} ${v.make} ${v.model}` : 'Unknown Vehicle',
        status: v?.status ?? 'unknown',
        doc_count: 0,
        total_bytes: 0,
        docs: [],
      })
    }
    const entry = byVehicle.get(doc.vehicle_id)!
    entry.doc_count++
    entry.total_bytes += doc.file_size ?? 0
    entry.docs.push({ id: doc.id, label: doc.label, file_name: doc.file_name, file_size: doc.file_size, created_at: doc.created_at })
  }

  const vehicleList = [...byVehicle.values()].sort((a, b) => b.total_bytes - a.total_bytes)
  const usedBytes = allDocs.reduce((s, d) => s + (d.file_size ?? 0), 0)

  return NextResponse.json({
    used_bytes: usedBytes,
    used_mb: parseFloat((usedBytes / (1024 * 1024)).toFixed(1)),
    limit_mb: CAP_MB,
    pct: parseFloat(((usedBytes / CAP_BYTES) * 100).toFixed(1)),
    doc_count: allDocs.length,
    vehicles: vehicleList,
  })
}
