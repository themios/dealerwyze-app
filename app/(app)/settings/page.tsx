import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth/profile'
import TopBar from '@/components/layout/TopBar'
import Link from 'next/link'
import TemplatesClient from './TemplatesClient'
import { Button } from '@/components/ui/button'
import { BarChart2, Users, ChevronRight, ExternalLink, CreditCard, Building2, Target, BookOpen, Zap, MessageSquare } from 'lucide-react'
import FontSizeSetting from '@/components/settings/FontSizeSetting'
import SignOutButton from '@/components/settings/SignOutButton'
import ProfileEditForm from '@/components/settings/ProfileEditForm'
import ExportDataButton from '@/components/settings/ExportDataButton'

export default async function SettingsPage() {
  const profile = await requireProfile()
  const supabase = await createClient()

  const [
    { data: templates },
    { data: feedStats },
  ] = await Promise.all([
    supabase
      .from('templates')
      .select('*')
      .eq('user_id', profile.org_id)
      .order('channel', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('org_settings')
      .select('feed_cg_last_synced_at, feed_cg_last_count, feed_cg_last_error, feed_fb_last_synced_at, feed_fb_last_count, feed_fb_last_error')
      .eq('org_id', profile.org_id)
      .maybeSingle(),
  ])

  return (
    <div>
      <TopBar title="Settings" />
      <div className="px-4 py-4 space-y-8">

        {/* Admin-only sections */}
        {profile.role === 'admin' && (
          <>
            <section>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Billing</p>
              <Link href="/settings/billing">
                <div className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent transition-colors">
                  <div className="flex items-center gap-3">
                    <CreditCard className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium text-sm">Plan & Billing</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Manage your subscription and payment method</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            </section>

            <section>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Organization</p>
              <Link href="/settings/organization">
                <div className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent transition-colors">
                  <div className="flex items-center gap-3">
                    <Building2 className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium text-sm">Dealership Info</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Name, phone, address, timezone</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            </section>

            <section>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Team</p>
              <Link href="/settings/users">
                <div className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent transition-colors">
                  <div className="flex items-center gap-3">
                    <Users className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium text-sm">Manage Team</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Invite agents, assign roles, manage access</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            </section>

            <section>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Bookkeeping</p>
              <Link href="/settings/bookkeeping">
                <div className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent transition-colors">
                  <div className="flex items-center gap-3">
                    <BookOpen className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium text-sm">Categories & QuickBooks</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Manage expense categories and QB account mapping</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            </section>

            <section>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Communication</p>
              <Link href="/settings/automation">
                <div className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent transition-colors">
                  <div className="flex items-center gap-3">
                    <Zap className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium text-sm">Automation & Timings</p>
                      <p className="text-xs text-muted-foreground mt-0.5">SMS mode, response SLA, follow-up schedule</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            </section>

            <section>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">AI Dealer Brief</p>
              <Link href="/settings/goals">
                <div className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent transition-colors">
                  <div className="flex items-center gap-3">
                    <Target className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium text-sm">Performance Goals</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Set daily, weekly, monthly & annual targets</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            </section>

            <section>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Reports</p>
              <div className="space-y-2">
                <Link href="/analytics">
                  <div className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent transition-colors">
                    <div className="flex items-center gap-3">
                      <BarChart2 className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium text-sm">Deal Pipeline & Analytics</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Inventory value, lead funnel, source breakdown</p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
                <ExportDataButton />
              </div>
            </section>
          </>
        )}

        {/* Lead Response Templates */}
        <section>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Lead Response Templates</p>
          <p className="text-xs text-muted-foreground mb-3">
            Variables:{' '}
            <code className="bg-muted px-1 rounded">{'{firstName}'}</code>{' '}
            <code className="bg-muted px-1 rounded">{'{vehicle}'}</code>{' '}
            <code className="bg-muted px-1 rounded">{'{price}'}</code>{' '}
            <code className="bg-muted px-1 rounded">{'{link}'}</code>
          </p>
          <TemplatesClient templates={templates || []} userId={profile.org_id} />
        </section>

        {/* Display */}
        <section>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Display</p>
          <div className="p-4 rounded-lg border bg-card">
            <p className="font-medium text-sm mb-1">Text Size</p>
            <p className="text-xs text-muted-foreground mb-3">Adjust for comfortable reading on your device</p>
            <FontSizeSetting />
          </div>
        </section>

        {/* Integrations */}
        {profile.role === 'admin' && (
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Integrations</p>
            <div className="space-y-2">
              <div className="p-4 rounded-lg border bg-card">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-medium text-sm">Gmail IMAP Sync</p>
                  <span className="text-xs bg-green-500/10 text-green-600 px-2 py-0.5 rounded-full font-medium">Active</span>
                </div>
                <p className="text-xs text-muted-foreground">Auto-imports CarGurus, AutoTrader leads every 15 min via cron-job.org.</p>
              </div>
              <div className="p-4 rounded-lg border bg-card">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-medium text-sm">Twilio SMS</p>
                  <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-medium">Optional</span>
                </div>
                <p className="text-xs text-muted-foreground">Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, NEXT_PUBLIC_TWILIO_ENABLED=true to Vercel.</p>
              </div>
              <div className="p-4 rounded-lg border bg-card space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-sm">Inventory Feed Sync</p>
                  <span className="text-xs bg-green-500/10 text-green-600 px-2 py-0.5 rounded-full font-medium">Daily 2 AM</span>
                </div>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div className="flex justify-between gap-2">
                    <span>CarGurus</span>
                    <span className={feedStats?.feed_cg_last_error ? 'text-destructive' : ''}>
                      {feedStats?.feed_cg_last_error
                        ? `Error: ${feedStats.feed_cg_last_error.slice(0, 50)}`
                        : feedStats?.feed_cg_last_synced_at
                          ? `${feedStats.feed_cg_last_count} vehicles · ${new Date(feedStats.feed_cg_last_synced_at).toLocaleDateString()}`
                          : 'Not yet synced'}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span>Facebook Catalog</span>
                    <span className={feedStats?.feed_fb_last_error ? 'text-destructive' : ''}>
                      {feedStats?.feed_fb_last_error
                        ? `Error: ${feedStats.feed_fb_last_error.slice(0, 50)}`
                        : feedStats?.feed_fb_last_synced_at
                          ? `${feedStats.feed_fb_last_count} vehicles · ${new Date(feedStats.feed_fb_last_synced_at).toLocaleDateString()}`
                          : 'Not yet synced'}
                    </span>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground pt-1">
                  Feed URLs: <code className="bg-muted px-1 rounded">/api/inventory/cargurus-feed</code> · <code className="bg-muted px-1 rounded">/api/inventory/facebook-feed</code>
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Account */}
        <section>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Account</p>
          <div className="space-y-2">
            <ProfileEditForm displayName={profile.display_name} />
            <SignOutButton />
          </div>
        </section>

        {/* Support */}
        <section>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Help</p>
          <Link href="/support">
            <div className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent transition-colors">
              <div className="flex items-center gap-3">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <p className="font-medium text-sm">Support Tickets</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </Link>
        </section>

        {/* Legal */}
        <section>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Legal</p>
          <div className="space-y-2">
            <a href="/privacy.html">
              <div className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent transition-colors">
                <p className="font-medium text-sm">Privacy Policy</p>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </a>
            <a href="/terms.html">
              <div className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent transition-colors">
                <p className="font-medium text-sm">Terms of Service</p>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </div>
            </a>
          </div>
        </section>

        {profile.role === 'admin' && (
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Quick Links</p>
            <div className="space-y-2">
              {[
                { label: 'Supabase Dashboard', href: 'https://supabase.com/dashboard' },
                { label: 'Vercel Dashboard', href: 'https://vercel.com/dashboard' },
              ].map(({ label, href }) => (
                <a key={href} href={href} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent transition-colors">
                  <span className="text-sm">{label}</span>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                </a>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
