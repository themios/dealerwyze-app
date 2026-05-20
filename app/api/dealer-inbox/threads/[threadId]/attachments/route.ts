import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

const MAX_BYTES = 10 * 1024 * 1024

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const profile = await requireProfile()
  const { threadId } = await params
  const orgId = profile.org_id

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File exceeds 10 MB limit' }, { status: 413 })
  }

  const supabase = await createClient()
  const { data: thread } = await supabase
    .from('dealer_threads')
    .select('id')
    .eq('id', threadId)
    .eq('org_id', orgId)
    .maybeSingle()

  if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })

  const timestamp = Date.now()
  const safeName  = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path      = `${orgId}/${threadId}/${timestamp}/${safeName}`

  const bytes = await file.arrayBuffer()

  // Storage signing requires service role — RLS does not apply to storage operations
  const service = createServiceClient()
  const { error: uploadError } = await service.storage
    .from('dealer-attachments')
    .upload(path, bytes, { contentType: file.type, upsert: false })

  if (uploadError) {
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }

  return NextResponse.json({
    name: file.name,
    path,
    size: file.size,
    type: file.type,
  })
}
