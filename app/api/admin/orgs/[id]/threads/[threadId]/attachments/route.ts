import { NextRequest, NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { requirePlatformArea } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'

const MAX_BYTES = 10 * 1024 * 1024

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; threadId: string }> },
) {
  const profile = await requireProfile()
  const denied  = await requirePlatformArea(profile.id, 'dealers')
  if (denied) return denied

  const { id: orgId, threadId } = await params

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

  const timestamp = Date.now()
  const safeName  = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path      = `${orgId}/${threadId}/${timestamp}/${safeName}`

  const bytes = await file.arrayBuffer()

  const supabase = createServiceClient()
  const { error: uploadError } = await supabase.storage
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
