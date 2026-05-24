import { requireProfile } from '@/lib/auth/profile'
import { createClientForRequest } from '@/lib/supabase/forRequest'
import TopBar from '@/components/layout/TopBar'
import ContentDraftsClient from '@/components/content/ContentDraftsClient'

export const dynamic = 'force-dynamic'

export default async function ContentPage() {
  await requireProfile()

  const supabase = await createClientForRequest()
  const { data: drafts } = await supabase
    .from('content_drafts')
    .select('id, status, topic, tagline, slides, cta_text, content_theme, platform_targets, platform_captions, render_id, scheduled_at, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <div className="flex flex-col h-screen">
      <TopBar title="Content Drafts" />
      <div className="flex-1 overflow-hidden">
        <ContentDraftsClient initialDrafts={drafts ?? []} />
      </div>
    </div>
  )
}
