import type { createServiceClient } from '@/lib/supabase/service'

export type DealerAttachmentMeta = {
  name: string
  path: string
  size: number
  type: string
}

export type DealerAttachmentSigned = DealerAttachmentMeta & {
  url: string | null
}

const BUCKET = 'dealer-attachments'

export async function signDealerAttachments(
  supabase: ReturnType<typeof createServiceClient>,
  raw: unknown,
): Promise<DealerAttachmentSigned[]> {
  if (!Array.isArray(raw) || raw.length === 0) return []

  const items = raw.filter(
    (a): a is DealerAttachmentMeta =>
      !!a &&
      typeof a === 'object' &&
      typeof (a as DealerAttachmentMeta).path === 'string' &&
      typeof (a as DealerAttachmentMeta).name === 'string',
  )

  return Promise.all(
    items.map(async att => {
      const { data } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(att.path, 3600)
      return { ...att, url: data?.signedUrl ?? null }
    }),
  )
}

export async function readStorageObjectBase64(
  supabase: ReturnType<typeof createServiceClient>,
  path: string,
): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path)
  if (error || !data) return null
  const buf = Buffer.from(await data.arrayBuffer())
  return buf.toString('base64')
}
