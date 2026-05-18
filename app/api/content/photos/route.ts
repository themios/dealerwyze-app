import { NextRequest, NextResponse } from 'next/server'
import { requireProfile }         from '@/lib/auth/profile'
import { createClientForRequest } from '@/lib/supabase/forRequest'
import { createServiceClient }    from '@/lib/supabase/service'
import { validateMcpToken }       from '@/lib/content/mcpAuth'
import { listBrandPhotos, registerBrandPhoto } from '@/lib/content/photoLibrary'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export async function GET(req: NextRequest) {
  const mcpOrgId = validateMcpToken(req.headers.get('authorization'))
  let orgId: string

  if (mcpOrgId) {
    orgId = mcpOrgId
  } else {
    const profile = await requireProfile()
    orgId = profile.org_id
  }

  const supabase = mcpOrgId ? createServiceClient() : await createClientForRequest()
  const photos   = await listBrandPhotos(supabase, orgId)

  return NextResponse.json({ photos })
}

export async function POST(req: NextRequest) {
  const mcpOrgId = validateMcpToken(req.headers.get('authorization'))
  let orgId: string

  if (mcpOrgId) {
    orgId = mcpOrgId
  } else {
    const profile = await requireProfile()
    orgId = profile.org_id
  }

  let formData: FormData
  try { formData = await req.formData() } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file field required' }, { status: 400 })
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 413 })
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Only JPEG, PNG, and WebP are allowed' }, { status: 415 })
  }

  const tagsRaw = formData.get('tags')
  const tags    = tagsRaw ? String(tagsRaw).split(',').map(t => t.trim()).filter(Boolean) : []

  const ext      = file.name.split('.').pop() ?? 'jpg'
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const path     = `brand-photos/${orgId}/${filename}`

  const bytes = Buffer.from(await file.arrayBuffer())

  // Service role required for Storage uploads (Storage ignores session RLS)
  const service = createServiceClient()
  const { error: uploadError } = await service.storage
    .from('dealer-branding')
    .upload(path, bytes, { contentType: file.type, upsert: false })

  if (uploadError) {
    console.error('[content/photos] Storage upload failed:', uploadError.message)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }

  const { data: { publicUrl } } = service.storage
    .from('dealer-branding')
    .getPublicUrl(path)

  const supabase = mcpOrgId ? createServiceClient() : await createClientForRequest()
  const photo    = await registerBrandPhoto(supabase, orgId, publicUrl, file.name, tags)

  return NextResponse.json({ photo }, { status: 201 })
}
