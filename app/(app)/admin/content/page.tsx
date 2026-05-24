import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { requireProfile } from '@/lib/auth/profile'
import { isPlatformSuperAdmin } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/service'
import TopBar from '@/components/layout/TopBar'
import ContentDraftsClient from '@/components/content/ContentDraftsClient'

export const dynamic = 'force-dynamic'

export default async function AdminContentPage() {
  const profile    = await requireProfile()
  const superAdmin = await isPlatformSuperAdmin(profile.id)
  if (!superAdmin) redirect('/admin')

  const hdrs = await headers()
  const isRE = hdrs.get('x-vertical') === 'real_estate'
  const contentTitle = isRE ? 'RealtyWyze Content' : 'DealerWyze Content'

  const marketingOrgId = process.env.CONTENT_MCP_ORG_ID
  if (!marketingOrgId) {
    return (
      <div className="flex flex-col h-screen">
        <TopBar title={contentTitle} />
        <p className="p-6 text-sm text-muted-foreground">CONTENT_MCP_ORG_ID not configured.</p>
      </div>
    )
  }

  const supabase = createServiceClient()
  const { data: drafts } = await supabase
    .from('content_drafts')
    .select('id, status, topic, tagline, slides, cta_text, content_theme, platform_targets, platform_captions, render_id, scheduled_at, created_at')
    .eq('org_id', marketingOrgId)
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <div className="flex flex-col h-screen">
      <TopBar title={contentTitle} />
      <div className="flex-1 overflow-hidden">
        <ContentDraftsClient initialDrafts={drafts ?? []} />
      </div>
    </div>
  )
}
