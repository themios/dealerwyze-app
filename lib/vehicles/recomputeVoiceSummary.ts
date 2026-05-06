import type { SupabaseClient } from '@supabase/supabase-js'

/** Concat document AI summaries onto vehicles.voice_summary after upload or delete. */
export async function recomputeVehicleVoiceSummary(
  supabase: SupabaseClient,
  vehicleId: string,
  orgId: string,
): Promise<void> {
  const { data: allDocs } = await supabase
    .from('vehicle_documents')
    .select('label, ai_summary')
    .eq('vehicle_id', vehicleId)
    .eq('user_id', orgId)
    .eq('document_scope', 'website')
    .not('ai_summary', 'is', null)

  const voice_summary =
    allDocs && allDocs.length > 0
      ? allDocs.map(d => `[${d.label}]\n${d.ai_summary}`).join('\n\n')
      : null

  await supabase.from('vehicles').update({ voice_summary }).eq('id', vehicleId).eq('user_id', orgId)
}
