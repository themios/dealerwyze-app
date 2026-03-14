import { createClientForRequest } from '@/lib/supabase/forRequest'
import { requireProfile } from '@/lib/auth/profile'
import { Eye, MessageSquare, TrendingUp } from 'lucide-react'
import Link from 'next/link'

export default async function WebsiteAnalytics() {
  const profile = await requireProfile()
  const supabase = await createClientForRequest()

  // Gracefully handle if migration 064 hasn't been applied yet
  const [vehiclesRes, inquiriesRes] = await Promise.allSettled([
    supabase
      .from('vehicles')
      .select('id, year, make, model, views_count, public_slug')
      .eq('user_id', profile.org_id)
      .eq('published', true)
      .order('views_count', { ascending: false })
      .limit(20),
    supabase
      .from('inventory_inquiries')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', profile.org_id),
  ])

  const publishedVehicles = vehiclesRes.status === 'fulfilled' ? (vehiclesRes.value.data ?? []) : []
  const totalInquiries = inquiriesRes.status === 'fulfilled' ? (inquiriesRes.value.count ?? 0) : 0
  const totalViews = publishedVehicles.reduce((sum: number, v: any) => sum + (v.views_count ?? 0), 0)

  if (publishedVehicles.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center">
        <TrendingUp className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No published vehicles yet.</p>
        <p className="text-xs text-muted-foreground mt-1">Enable a vehicle's public listing from the vehicle detail page to start tracking views.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Performance</p>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-muted/50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold">{publishedVehicles.length}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Live listings</p>
        </div>
        <div className="bg-muted/50 rounded-lg p-3 text-center">
          <div className="flex items-center justify-center gap-1">
            <Eye className="h-4 w-4 text-muted-foreground" />
            <p className="text-2xl font-bold">{totalViews.toLocaleString()}</p>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">Total views</p>
        </div>
        <div className="bg-muted/50 rounded-lg p-3 text-center">
          <div className="flex items-center justify-center gap-1">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <p className="text-2xl font-bold">{totalInquiries}</p>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">Inquiries</p>
        </div>
      </div>

      {/* Top vehicles */}
      {publishedVehicles.some((v: any) => (v.views_count ?? 0) > 0) && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">Top viewed vehicles</p>
          <div className="space-y-2">
            {publishedVehicles
              .filter((v: any) => (v.views_count ?? 0) > 0)
              .slice(0, 5)
              .map((v: any) => (
                <Link key={v.id} href={`/vehicles/${v.id}`} className="flex items-center justify-between p-2.5 rounded-lg border hover:bg-accent transition-colors">
                  <p className="text-sm font-medium truncate">{v.year} {v.make} {v.model}</p>
                  <div className="flex items-center gap-1 shrink-0 ml-2 text-muted-foreground">
                    <Eye className="h-3.5 w-3.5" />
                    <span className="text-sm">{(v.views_count ?? 0).toLocaleString()}</span>
                  </div>
                </Link>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
