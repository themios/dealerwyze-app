import { createClientForRequest } from '@/lib/supabase/forRequest'
import { requireProfile } from '@/lib/auth/profile'
import TopBar from '@/components/layout/TopBar'
import Link from 'next/link'
import { BarChart2, Users, ChevronRight, ExternalLink, CreditCard, Building2, Target, BookOpen, Zap, MessageSquare, ClipboardList, ListOrdered, Webhook, DollarSign, Layers, Star, GitBranch, Video, Share2 } from 'lucide-react'
import FontSizeSetting from '@/components/settings/FontSizeSetting'
import SignOutButton from '@/components/settings/SignOutButton'
import ProfileEditForm from '@/components/settings/ProfileEditForm'
import ExportDataButton from '@/components/settings/ExportDataButton'
import StorageWidget from '@/components/settings/StorageWidget'
import TelegramConnect from '@/components/settings/TelegramConnect'

export default async function SettingsPage() {
  const profile = await requireProfile()
  const supabase = await createClientForRequest()

  const { data: orgSettings } = await supabase
    .from('org_settings')
    .select('feed_cg_last_synced_at, feed_cg_last_count, feed_cg_last_error, feed_fb_last_synced_at, feed_fb_last_count, feed_fb_last_error, telegram_chat_id')
    .eq('org_id', profile.org_id)
    .maybeSingle()

  const feedStats = orgSettings

  return (
    <div>
      <TopBar title="Settings" />
      <div className="px-4 py-4 space-y-8">

        {/* Admin-only sections */}
        {profile.role === 'admin' && (
          <>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dealership Settings</p>

            <section>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Billing</p>
              <div className="rounded-lg border bg-card overflow-hidden">
                <Link href="/settings/billing">
                  <div className="flex items-center justify-between p-4 hover:bg-accent transition-colors">
                    <div className="flex items-center gap-3">
                      <CreditCard className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium text-sm">Plan &amp; Billing</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Manage your subscription and payment method</p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
              </div>
            </section>

            <section>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Organization</p>
              <div className="rounded-lg border bg-card overflow-hidden">
                <Link href="/settings/organization">
                  <div className="flex items-center justify-between p-4 hover:bg-accent transition-colors">
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
                <Link href="/settings/users">
                  <div className="flex items-center justify-between p-4 border-t border-border hover:bg-accent transition-colors">
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
                <Link href="/settings/pipeline">
                  <div className="flex items-center justify-between p-4 border-t border-border hover:bg-accent transition-colors">
                    <div className="flex items-center gap-3">
                      <GitBranch className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium text-sm">Pipeline Stages</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Rename, reorder, and add custom stages to match your sales process</p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
              </div>
            </section>

            <section>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Finance</p>
              <div className="rounded-lg border bg-card overflow-hidden">
                <Link href="/settings/bookkeeping">
                  <div className="flex items-center justify-between p-4 hover:bg-accent transition-colors">
                    <div className="flex items-center gap-3">
                      <BookOpen className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium text-sm">Categories &amp; QuickBooks</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Manage expense categories and QB account mapping</p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
                <Link href="/settings/payments">
                  <div className="flex items-center justify-between p-4 border-t border-border hover:bg-accent transition-colors">
                    <div className="flex items-center gap-3">
                      <DollarSign className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium text-sm">Payments &amp; Booking</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Stripe keys for BHPH online payments, customer booking page</p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
              </div>
            </section>

            <section>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Communication</p>
              <div className="rounded-lg border bg-card overflow-hidden">
                <Link href="/settings/automation">
                  <div className="flex items-center justify-between p-4 hover:bg-accent transition-colors">
                    <div className="flex items-center gap-3">
                      <Zap className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium text-sm">Automation &amp; Timings</p>
                        <p className="text-xs text-muted-foreground mt-0.5">SMS mode, response SLA, follow-up schedule, SMS &amp; email templates</p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
                <Link href="/settings/sequences">
                  <div className="flex items-center justify-between p-4 border-t border-border hover:bg-accent transition-colors">
                    <div className="flex items-center gap-3">
                      <ListOrdered className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium text-sm">Sequences</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Build automated follow-up cadences for email and SMS leads</p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
                <Link href="/customers/segments">
                  <div className="flex items-center justify-between p-4 border-t border-border hover:bg-accent transition-colors">
                    <div className="flex items-center gap-3">
                      <Layers className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium text-sm">Smart Segments</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Save customer filters and bulk-enroll them into sequences</p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
                <Link href="/settings/reviews">
                  <div className="flex items-center justify-between p-4 border-t border-border hover:bg-accent transition-colors">
                    <div className="flex items-center gap-3">
                      <Star className="h-5 w-5 text-yellow-500" />
                      <div>
                        <p className="font-medium text-sm">Google Reviews</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Auto-send review requests after a sale - immediately or on a delay</p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
                <Link href="/settings/webhooks">
                  <div className="flex items-center justify-between p-4 border-t border-border hover:bg-accent transition-colors">
                    <div className="flex items-center gap-3">
                      <Webhook className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium text-sm">Webhooks</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Send real-time events to your own systems when leads, stages, or appointments change</p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
              </div>
            </section>

            <section>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Notifications</p>
              {/* Telegram — instant lead alerts + AI chat via bot */}
              <TelegramConnect
                initialConnected={!!orgSettings?.telegram_chat_id}
                botUsername={process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? 'ApolloTim_bot'}
              />
            </section>

            <section>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">AI Dealer Brief</p>
              <div className="rounded-lg border bg-card overflow-hidden">
                <Link href="/settings/goals">
                  <div className="flex items-center justify-between p-4 hover:bg-accent transition-colors">
                    <div className="flex items-center gap-3">
                      <Target className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium text-sm">Performance Goals</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Set daily, weekly, monthly &amp; annual targets</p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
              </div>
            </section>

            <section>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Vehicle Documents</p>
              <StorageWidget />
            </section>

            <section>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Video &amp; Social</p>
              <div className="rounded-lg border bg-card overflow-hidden">
                <Link href="/settings/video">
                  <div className="flex items-center justify-between p-4 hover:bg-accent transition-colors">
                    <div className="flex items-center gap-3">
                      <Video className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium text-sm">Video Settings</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Auto-post preferences, voice, default template</p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
                <Link href="/settings/social">
                  <div className="flex items-center justify-between p-4 border-t border-border hover:bg-accent transition-colors">
                    <div className="flex items-center gap-3">
                      <Share2 className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium text-sm">Social Media Accounts</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Connect Facebook, Instagram, TikTok, YouTube for auto-posting</p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
              </div>
            </section>

            <section>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Inventory</p>
              <div className="rounded-lg border bg-card overflow-hidden">
                <Link href="/settings/recon-template">
                  <div className="flex items-center justify-between p-4 hover:bg-accent transition-colors">
                    <div className="flex items-center gap-3">
                      <ClipboardList className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium text-sm">Recon Checklist Template</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Customize the default reconditioning checklist for new vehicles</p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
              </div>
            </section>

            <section>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Reports</p>
              <div className="rounded-lg border bg-card overflow-hidden">
                <Link href="/analytics">
                  <div className="flex items-center justify-between p-4 hover:bg-accent transition-colors">
                    <div className="flex items-center gap-3">
                      <BarChart2 className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium text-sm">Deal Pipeline &amp; Analytics</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Inventory value, lead funnel, source breakdown</p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </Link>
              </div>
              <div className="mt-2">
                <ExportDataButton />
              </div>
            </section>
          </>
        )}

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
