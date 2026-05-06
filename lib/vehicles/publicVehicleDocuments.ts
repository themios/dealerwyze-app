import { createServiceClient } from '@/lib/supabase/service'

const BUCKET = 'vehicle-docs'

export type PublicVehicleDownload = {
  id: string
  label: string
  file_name: string
  url: string
}

/** Signed URLs for customer-visible website documents on the public VDP. */
export async function getWebsiteDocumentsForPublicVdp(
  orgId: string,
  vehicleId: string,
): Promise<PublicVehicleDownload[]> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('vehicle_documents')
    .select('id, label, file_name, file_key')
    .eq('vehicle_id', vehicleId)
    .eq('user_id', orgId)
    .eq('document_scope', 'website')
    .order('created_at', { ascending: false })

  if (error || !data?.length) return []

  const expectedPrefix = `${orgId}/`
  const out: PublicVehicleDownload[] = []

  for (const d of data) {
    if (!d.file_key.startsWith(expectedPrefix)) continue
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(d.file_key, 3600)
    if (signed?.signedUrl) {
      out.push({
        id: d.id,
        label: d.label,
        file_name: d.file_name,
        url: signed.signedUrl,
      })
    }
  }

  return out
}
