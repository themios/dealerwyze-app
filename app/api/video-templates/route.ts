import { NextResponse } from 'next/server'
import { requireProfile } from '@/lib/auth/profile'
import { createClientForRequest } from '@/lib/supabase/forRequest'

// GET /api/video-templates — list active templates
export async function GET() {
  await requireProfile()
  const supabase = await createClientForRequest()

  const { data: templates } = await supabase
    .from('video_templates')
    .select('id, name, description, composition_id, aspect_ratio, duration_seconds, thumbnail_url, best_for, sort_order')
    .eq('is_active', true)
    .order('sort_order')

  // Deduplicate by composition_id (keeps first occurrence — lowest sort_order)
  const seen = new Set<string>()
  const deduped = (templates ?? []).filter(t => {
    if (seen.has(t.composition_id)) return false
    seen.add(t.composition_id)
    return true
  })

  return NextResponse.json({ templates: deduped })
}
