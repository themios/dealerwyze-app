import { createClientForRequest } from '@/lib/supabase/forRequest'
import { requireProfile } from '@/lib/auth/profile'
import TopBar from '@/components/layout/TopBar'
import Link from 'next/link'
import { isDealerAdmin } from '@/lib/auth/dealerRoles'
import { canViewSettingsAudience } from '@/lib/settings/access'
import {
  BarChart2, Users, ChevronRight, ExternalLink, CreditCard, Building2,
  Target, BookOpen, Zap, MessageSquare, ClipboardList, ListOrdered,
  Webhook, DollarSign, GitBranch, Video, Share2, Palette, Heart, Shield, Globe, ArrowRightLeft,
  type LucideIcon,
} from 'lucide-react'
import FontSizeSetting from '@/components/settings/FontSizeSetting'
import SignOutButton from '@/components/settings/SignOutButton'
import ProfileEditForm from '@/components/settings/ProfileEditForm'
import ExportDataButton from '@/components/settings/ExportDataButton'
import StorageWidget from '@/components/settings/StorageWidget'
import TelegramConnect from '@/components/settings/TelegramConnect'
import SettingsLinkCard from '@/components/settings/SettingsLinkCard'

// ── Types ─────────────────────────────────────────────────────────────────────

interface LinkCardDef {
  href: string
  icon: LucideIcon
  title: string
  description: string
}

// ── Config arrays ─────────────────────────────────────────────────────────────

const BILLING_LINKS: LinkCardDef[] = [
  {
    href: '/settings/billing',
    icon: CreditCard,
    title: 'Plan & Billing',
    description: 'Manage your subscription and payment method',
  },
]

const ORG_LINKS: LinkCardDef[] = [
  {
    href: '/settings/organization',
    icon: Building2,
    title: 'Dealership Info',
    description: 'Name, phone, address, timezone',
  },
  {
    href: '/settings/users',
    icon: Users,
    title: 'Manage Team',
    description: 'Invite agents, assign roles, manage access',
  },
  {
    href: '/settings/pipeline',
    icon: GitBranch,
    title: 'Pipeline Stages',
    description: 'Rename, reorder, and add custom stages to match your sales process',
  },
  {
    href: '/settings/website',
    icon: Globe,
    title: 'Website',
    description: 'Website details, inventory site content, and customer-facing settings',
  },
  {
    href: '/settings/audit',
    icon: Shield,
    title: 'Audit Log',
    description: 'Security event history — payments, exports, settings changes, and access events',
  },
]

const FINANCE_LINKS: LinkCardDef[] = [
  {
    href: '/settings/bookkeeping',
    icon: BookOpen,
    title: 'Categories & QuickBooks',
    description: 'Manage expense categories and QB account mapping',
  },
  {
    href: '/settings/payments',
    icon: DollarSign,
    title: 'Payments & Booking',
    description: 'Stripe keys for BHPH online payments, customer booking page',
  },
  {
    href: '/settings/transfer',
    icon: ArrowRightLeft,
    title: 'Business Transfer',
    description: 'Transfer dealership ownership with a controlled, high-risk workflow',
  },
]

const COMMUNICATION_LINKS: LinkCardDef[] = [
  {
    href: '/settings/automation',
    icon: Zap,
    title: 'Automation & Timings',
    description: 'SMS mode, response SLA, follow-up schedule, SMS & email templates',
  },
  {
    href: '/settings/sequences',
    icon: ListOrdered,
    title: 'Sequences',
    description: 'Build automated follow-up cadences for email and SMS leads',
  },
  {
    href: '/settings/webhooks',
    icon: Webhook,
    title: 'Webhooks',
    description: 'Send real-time events to your own systems when leads, stages, or appointments change',
  },
]

const CUSTOMER_EXPERIENCE_LINKS: LinkCardDef[] = [
  {
    href: '/settings/pulse',
    icon: Heart,
    title: 'Post-Sale Outreach',
    description: 'Google review requests and satisfaction surveys after every sale',
  },
  {
    href: '/settings/retention',
    icon: Users,
    title: 'Customer Retention',
    description: 'Campaign timing, direct-mail postcards, and retention automation settings',
  },
]

const GOALS_LINKS: LinkCardDef[] = [
  {
    href: '/settings/goals',
    icon: Target,
    title: 'Performance Goals',
    description: 'Set daily, weekly, monthly & annual targets',
  },
]

const VIDEO_LINKS: LinkCardDef[] = [
  {
    href: '/settings/video',
    icon: Video,
    title: 'Video Settings',
    description: 'Auto-post preferences, voice, default template',
  },
  {
    href: '/settings/social',
    icon: Share2,
    title: 'Social Media Accounts',
    description: 'Connect Facebook, Instagram, TikTok, YouTube for auto-posting',
  },
]

const INVENTORY_LINKS: LinkCardDef[] = [
  {
    href: '/settings/recon-template',
    icon: ClipboardList,
    title: 'Recon Checklist Template',
    description: 'Customize the default reconditioning checklist for new vehicles',
  },
]

const REPORTS_LINKS: LinkCardDef[] = [
  {
    href: '/analytics',
    icon: BarChart2,
    title: 'Deal Pipeline & Analytics',
    description: 'Inventory value, lead funnel, source breakdown',
  },
]

const APPEARANCE_LINKS: LinkCardDef[] = [
  {
    href: '/settings/appearance',
    icon: Palette,
    title: 'Theme & Colors',
    description: 'Personalize your dealership colors and font style',
  },
]

// ── Helper ────────────────────────────────────────────────────────────────────

function LinkGroup({ links }: { links: LinkCardDef[] }) {
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {links.map((link, i) => (
        <SettingsLinkCard key={link.href} divider={i > 0} {...link} />
      ))}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function SettingsPage() {
  const profile = await requireProfile()
  const supabase = await createClientForRequest()
  const canManageReconTemplate = isDealerAdmin(profile.role)
  const canViewAdminSettings = canViewSettingsAudience(profile.role, 'dealer_admin')

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
        {canViewAdminSettings && (
          <>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Dealership Settings</p>

            <section>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Billing</p>
              <LinkGroup links={BILLING_LINKS} />
            </section>

            <section>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Appearance</p>
              <LinkGroup links={APPEARANCE_LINKS} />
            </section>

            <section>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Organization</p>
              <LinkGroup links={ORG_LINKS} />
            </section>

            <section>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Finance</p>
              <LinkGroup links={FINANCE_LINKS} />
            </section>

            <section>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Communication</p>
              <LinkGroup links={COMMUNICATION_LINKS} />
            </section>

            <section>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Customer Experience</p>
              <LinkGroup links={CUSTOMER_EXPERIENCE_LINKS} />
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
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Goals</p>
              <LinkGroup links={GOALS_LINKS} />
            </section>

            <section>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Vehicle Documents</p>
              <StorageWidget />
            </section>

            <section>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Video &amp; Social</p>
              <LinkGroup links={VIDEO_LINKS} />
            </section>

            <section>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Reports</p>
              <LinkGroup links={REPORTS_LINKS} />
              <div className="mt-2">
                <ExportDataButton />
              </div>
            </section>
          </>
        )}

        {canManageReconTemplate && (
          <section>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Inventory</p>
            <LinkGroup links={INVENTORY_LINKS} />
          </section>
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
        {canViewAdminSettings && (
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

        {canViewAdminSettings && (
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
