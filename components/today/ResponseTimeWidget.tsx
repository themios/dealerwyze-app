import { createClient } from '@/lib/supabase/server'

interface Props {
  orgId: string
}

export default async function ResponseTimeWidget({ orgId }: Props) {
  const supabase = await createClient()
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()

  const { data } = await supabase
    .from('customers')
    .select('response_time_seconds')
    .eq('user_id', orgId)
    .not('response_time_seconds', 'is', null)
    .gte('created_at', sevenDaysAgo)

  if (!data?.length) return null

  const avg = Math.round(
    data.reduce((sum, r) => sum + (r.response_time_seconds ?? 0), 0) / data.length
  )
  const mins = Math.floor(avg / 60)
  const secs = avg % 60
  const label = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
  const color = avg < 300 ? 'text-green-400' : avg < 600 ? 'text-yellow-400' : 'text-red-400'

  return (
    <div className="mx-4 mb-3 rounded-xl bg-white/5 px-4 py-3 flex items-center justify-between">
      <div>
        <p className="text-xs text-white/50 uppercase tracking-wide font-medium">Avg Response · 7d</p>
        <p className={`text-2xl font-bold ${color}`}>{label}</p>
      </div>
      <p className="text-xs text-white/40">{data.length} lead{data.length !== 1 ? 's' : ''}</p>
    </div>
  )
}
