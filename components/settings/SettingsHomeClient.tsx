'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Building2, Users, GitBranch, Globe, Zap, ListOrdered, Webhook, Target, ClipboardList, Video, Share2, DollarSign, Heart, CreditCard, BookOpen, Shield, ArrowRightLeft, Palette, MessageSquare, ExternalLink, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import FontSizeSetting from '@/components/settings/FontSizeSetting'
import ProfileEditForm from '@/components/settings/ProfileEditForm'
import SignOutButton from '@/components/settings/SignOutButton'
import ExportDataButton from '@/components/settings/ExportDataButton'
import StorageWidget from '@/components/settings/StorageWidget'
import TelegramConnect from '@/components/settings/TelegramConnect'
import SettingsLinkCard from '@/components/settings/SettingsLinkCard'
import SettingsNav from '@/components/settings/SettingsNav'
import SettingsAccordionGroup from '@/components/settings/SettingsAccordionGroup'
import StatusChip, { type StatusChipTone } from '@/components/settings/StatusChip'
import { canViewSettingsAudience, describeSettingsAudience, type SettingsAudience } from '@/lib/settings/access'
import type { UserRole } from '@/types/index'

type GroupId =
  | 'business'
  | 'sales-communication'
  | 'inventory-merchandising'
  | 'customer-experience'
  | 'compliance-finance'
  | 'personal-support'

type RouteStatus = 'connected' | 'healthy' | 'optional' | 'pending' | 'error' | undefined

interface SettingsStatusItem {
  id: string
  title: string
  tone: StatusChipTone
  summary: string
}

interface RouteRuntimeData {
  status?: RouteStatus
  summary?: string
}

interface SettingsHomeClientProps {
  role: UserRole
  displayName: string
  canManageReconTemplate: boolean
  telegramBotUsername: string
  telegramConnected: boolean
  statusItems: SettingsStatusItem[]
  routeRuntime: Record<string, RouteRuntimeData>
}

interface SettingsItemConfig {
  id: string
  group: GroupId
  href: string
  title: string
  description: string
  keywords: string[]
  audience: SettingsAudience
  accessBadge?: string
  icon: typeof Building2
}

interface SettingsGroupConfig {
  id: GroupId
  title: string
  description: string
}

const STORAGE_KEY = 'settings-control-center-v1'

const GROUPS: SettingsGroupConfig[] = [
  { id: 'business', title: 'Business', description: 'Organization identity, team access, pipeline, and website controls.' },
  { id: 'sales-communication', title: 'Sales & Communication', description: 'Automation, sequences, outbound messaging, and sales targets.' },
  { id: 'inventory-merchandising', title: 'Inventory & Merchandising', description: 'Recon defaults plus video and social merchandising controls.' },
  { id: 'customer-experience', title: 'Customer Experience', description: 'Booking, payments, reviews, post-sale outreach, and retention settings.' },
  { id: 'compliance-finance', title: 'Compliance & Finance', description: 'Billing, bookkeeping, audit history, and ownership transfer workflows.' },
  { id: 'personal-support', title: 'Personal & Support', description: 'Personal preferences, account security, support, and legal resources.' },
]

const SETTINGS_ITEMS: SettingsItemConfig[] = [
  { id: 'organization', group: 'business', href: '/settings/organization', title: 'Organization', description: 'Business profile, intake channels, integrations, and administrative controls.', keywords: ['dealer', 'business', 'profile', 'calendar', 'gmail', 'phone'], audience: 'dealer_admin', accessBadge: describeSettingsAudience('dealer_admin'), icon: Building2 },
  { id: 'users', group: 'business', href: '/settings/users', title: 'Users', description: 'Invite staff, assign roles, and manage lead routing.', keywords: ['team', 'staff', 'roles', 'invite', 'permissions'], audience: 'dealer_admin', accessBadge: describeSettingsAudience('dealer_admin'), icon: Users },
  { id: 'pipeline', group: 'business', href: '/settings/pipeline', title: 'Pipeline', description: 'Rename, reorder, and tune pipeline stages to match your sales process.', keywords: ['stages', 'board', 'lead status'], audience: 'dealer_admin', accessBadge: describeSettingsAudience('dealer_admin'), icon: GitBranch },
  { id: 'website', group: 'business', href: '/settings/website', title: 'Website', description: 'Public inventory page, custom domain details, and customer-facing website settings.', keywords: ['public site', 'inventory site', 'domain', 'website'], audience: 'dealer_admin', accessBadge: describeSettingsAudience('dealer_admin'), icon: Globe },

  { id: 'automation', group: 'sales-communication', href: '/settings/automation', title: 'Automation', description: 'Lead response timing, auto-response behavior, and message templates.', keywords: ['autoresponder', 'sla', 'sms', 'email', 'template'], audience: 'dealer_admin', accessBadge: describeSettingsAudience('dealer_admin'), icon: Zap },
  { id: 'sequences', group: 'sales-communication', href: '/settings/sequences', title: 'Sequences', description: 'Build and manage email and SMS follow-up cadences.', keywords: ['sequence', 'drip', 'cadence', 'follow-up'], audience: 'all', icon: ListOrdered },
  { id: 'webhooks', group: 'sales-communication', href: '/settings/webhooks', title: 'Webhooks', description: 'Send lead and appointment events to external systems in real time.', keywords: ['integration', 'api', 'zapier', 'hooks'], audience: 'dealer_admin', accessBadge: describeSettingsAudience('dealer_admin'), icon: Webhook },
  { id: 'goals', group: 'sales-communication', href: '/settings/goals', title: 'Goals', description: 'Set the sales targets that feed the AI dealer brief.', keywords: ['targets', 'forecast', 'ai dealer brief'], audience: 'dealer_admin', accessBadge: describeSettingsAudience('dealer_admin'), icon: Target },

  { id: 'recon-template', group: 'inventory-merchandising', href: '/settings/recon-template', title: 'Recon Checklist Template', description: 'Set the default staging checklist for new inventory.', keywords: ['checklist', 'reconditioning', 'staging'], audience: 'dealer_admin', accessBadge: describeSettingsAudience('dealer_admin'), icon: ClipboardList },
  { id: 'video', group: 'inventory-merchandising', href: '/settings/video', title: 'Video Settings', description: 'Control templates, voice, and autopost defaults for inventory videos.', keywords: ['remotion', 'voice', 'video'], audience: 'dealer_admin', accessBadge: describeSettingsAudience('dealer_admin'), icon: Video },
  { id: 'social', group: 'inventory-merchandising', href: '/settings/social', title: 'Social Accounts', description: 'Connect channels for automated merchandising posts.', keywords: ['facebook', 'instagram', 'tiktok', 'youtube', 'social'], audience: 'dealer_admin', accessBadge: describeSettingsAudience('dealer_admin'), icon: Share2 },

  { id: 'payments', group: 'customer-experience', href: '/settings/payments', title: 'Payments & Booking', description: 'Stripe settings for BHPH payments and customer self-booking controls.', keywords: ['booking', 'stripe', 'bhph', 'appointments', 'payments'], audience: 'dealer_admin', accessBadge: describeSettingsAudience('dealer_admin'), icon: DollarSign },
  { id: 'pulse', group: 'customer-experience', href: '/settings/pulse', title: 'Post-Sale Outreach', description: 'Review requests and survey sends after every sale.', keywords: ['pulse', 'survey', 'review request'], audience: 'dealer_admin', accessBadge: describeSettingsAudience('dealer_admin'), icon: Heart },
  { id: 'reviews', group: 'customer-experience', href: '/settings/reviews', title: 'Reviews', description: 'Manage review prompts, destinations, and customer feedback routing.', keywords: ['google review', 'ratings', 'reputation'], audience: 'dealer_admin', accessBadge: describeSettingsAudience('dealer_admin'), icon: MessageSquare },
  { id: 'retention', group: 'customer-experience', href: '/settings/retention', title: 'Retention', description: 'Campaign cadence, postcard automation, and customer retention timing.', keywords: ['postcards', 'birthday', 'retention', 'campaign'], audience: 'dealer_admin', accessBadge: describeSettingsAudience('dealer_admin'), icon: Users },

  { id: 'billing', group: 'compliance-finance', href: '/settings/billing', title: 'Billing', description: 'Manage the subscription, payment method, and plan details.', keywords: ['plan', 'subscription', 'invoice'], audience: 'dealer_admin', accessBadge: describeSettingsAudience('dealer_admin'), icon: CreditCard },
  { id: 'bookkeeping', group: 'compliance-finance', href: '/settings/bookkeeping', title: 'Bookkeeping', description: 'Receipt categories and QuickBooks mapping for the ledger.', keywords: ['ledger', 'quickbooks', 'expenses', 'receipts'], audience: 'all', icon: BookOpen },
  { id: 'audit', group: 'compliance-finance', href: '/settings/audit', title: 'Audit Log', description: 'Review security, export, billing, and settings-change history.', keywords: ['security', 'events', 'history', 'audit'], audience: 'dealer_admin', accessBadge: describeSettingsAudience('dealer_admin'), icon: Shield },
  { id: 'transfer', group: 'compliance-finance', href: '/settings/transfer', title: 'Business Transfer', description: 'Controlled, high-risk ownership transfer workflow.', keywords: ['ownership', 'sell business', 'transfer'], audience: 'dealer_admin', accessBadge: describeSettingsAudience('dealer_admin'), icon: ArrowRightLeft },

  { id: 'appearance', group: 'personal-support', href: '/settings/appearance', title: 'Appearance', description: 'Theme and typography preferences for the app.', keywords: ['theme', 'font', 'colors', 'appearance'], audience: 'all', icon: Palette },
]

function matchesSearch(item: SettingsItemConfig, query: string) {
  if (!query) return true
  const haystack = [item.title, item.description, ...item.keywords].join(' ').toLowerCase()
  return haystack.includes(query)
}

function buildStatusSummary(statusItems: SettingsStatusItem[]) {
  return statusItems.filter(item => item.tone === 'error' || item.tone === 'pending').length
}

export default function SettingsHomeClient({
  role,
  displayName,
  canManageReconTemplate,
  telegramBotUsername,
  telegramConnected,
  statusItems,
  routeRuntime,
}: SettingsHomeClientProps) {
  const [query, setQuery] = useState('')
  const [selectedGroupId, setSelectedGroupId] = useState<GroupId>(() => {
    if (typeof window === 'undefined') return 'business'
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) return 'business'
      const parsed = JSON.parse(raw) as { selectedGroupId?: GroupId }
      return parsed.selectedGroupId ?? 'business'
    } catch {
      return 'business'
    }
  })
  const [openGroups, setOpenGroups] = useState<GroupId[]>(() => {
    if (typeof window === 'undefined') return ['business', 'sales-communication']
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) return ['business', 'sales-communication']
      const parsed = JSON.parse(raw) as { openGroups?: GroupId[] }
      return parsed.openGroups?.length ? parsed.openGroups : ['business', 'sales-communication']
    } catch {
      return ['business', 'sales-communication']
    }
  })

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ selectedGroupId, openGroups }))
  }, [selectedGroupId, openGroups])

  const normalizedQuery = query.trim().toLowerCase()
  const visibleItems = useMemo(() => SETTINGS_ITEMS.filter(item => {
    if (!canManageReconTemplate && item.id === 'recon-template') return false
    return canViewSettingsAudience(role, item.audience)
  }), [canManageReconTemplate, role])

  const visibleGroupIds = useMemo(
    () => GROUPS.filter(group => visibleItems.some(item => item.group === group.id)).map(group => group.id),
    [visibleItems],
  )
  const effectiveSelectedGroupId = visibleGroupIds.includes(selectedGroupId)
    ? selectedGroupId
    : ((visibleGroupIds[0] ?? 'personal-support') as GroupId)

  const filteredItems = useMemo(
    () => visibleItems.filter(item => matchesSearch(item, normalizedQuery)),
    [normalizedQuery, visibleItems],
  )

  const groupsForRender = useMemo(() => {
    return GROUPS
      .filter(group => visibleItems.some(item => item.group === group.id))
      .map(group => {
        const items = filteredItems.filter(item => item.group === group.id)
        return { ...group, items, count: items.length }
      })
      .filter(group => normalizedQuery ? group.items.length > 0 : true)
  }, [filteredItems, normalizedQuery, visibleItems])

  const selectedGroup = groupsForRender.find(group => group.id === effectiveSelectedGroupId) ?? groupsForRender[0] ?? null
  const criticalStatusCount = buildStatusSummary(statusItems)

  function toggleGroup(groupId: GroupId) {
    setOpenGroups(prev => prev.includes(groupId) ? prev.filter(id => id !== groupId) : [...prev, groupId])
  }

  function renderItem(item: SettingsItemConfig) {
    const runtime = routeRuntime[item.id]

    return (
      <SettingsLinkCard
        key={item.id}
        href={item.href}
        icon={item.icon}
        title={item.title}
        description={item.description}
        status={runtime?.status}
        summary={runtime?.summary}
        accessBadge={item.accessBadge}
      />
    )
  }

  function renderPersonalSupportExtras() {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm font-semibold">Display</p>
          <p className="mt-1 text-xs text-muted-foreground">Adjust text size for your current device.</p>
          <div className="mt-3">
            <FontSizeSetting />
          </div>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm font-semibold">Notifications</p>
          <p className="mt-1 text-xs text-muted-foreground">Telegram powers instant lead alerts and bot-assisted communication.</p>
          <div className="mt-3">
            <TelegramConnect initialConnected={telegramConnected} botUsername={telegramBotUsername} />
          </div>
        </div>

        <div className="space-y-2">
          <div className="rounded-xl border bg-card p-4">
            <p className="text-sm font-semibold">Account</p>
            <p className="mt-1 text-xs text-muted-foreground">Update your display name, password, and session access.</p>
            <div className="mt-4 space-y-2">
              <ProfileEditForm displayName={displayName} />
              <SignOutButton />
            </div>
          </div>

          <Link href="/support" className="flex items-center justify-between rounded-xl border bg-card p-4 hover:bg-accent transition-colors">
            <div>
              <p className="text-sm font-medium">Support Tickets</p>
              <p className="mt-1 text-xs text-muted-foreground">Open product or account support requests.</p>
            </div>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </Link>

          <a href="/privacy.html" className="flex items-center justify-between rounded-xl border bg-card p-4 hover:bg-accent transition-colors">
            <div>
              <p className="text-sm font-medium">Privacy Policy</p>
              <p className="mt-1 text-xs text-muted-foreground">Review data handling and platform privacy terms.</p>
            </div>
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
          </a>

          <a href="/terms.html" className="flex items-center justify-between rounded-xl border bg-card p-4 hover:bg-accent transition-colors">
            <div>
              <p className="text-sm font-medium">Terms of Service</p>
              <p className="mt-1 text-xs text-muted-foreground">Review account obligations, liability, and service terms.</p>
            </div>
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-card p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">Settings</h1>
            <p className="text-sm text-muted-foreground">
              Control center for dealership configuration, integrations, governance, and personal preferences.
            </p>
          </div>
          <div className="w-full max-w-sm">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search settings, integrations, or keywords"
                className="pl-9"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {statusItems.map(item => (
          <div key={item.id} className="rounded-2xl border bg-card p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">{item.title}</p>
              <StatusChip tone={item.tone} />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">{item.summary}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">Operational posture</p>
          {criticalStatusCount > 0 ? (
            <StatusChip tone="pending" label={`${criticalStatusCount} attention item${criticalStatusCount === 1 ? '' : 's'}`} />
          ) : (
            <StatusChip tone="healthy" label="No active alerts" />
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Search results and group counts update live. Desktop uses grouped navigation; mobile keeps the same taxonomy in expandable sections.
        </p>
      </div>

      <div className="hidden gap-6 lg:grid lg:grid-cols-[280px,minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="sticky top-4 space-y-4">
              <SettingsNav
                groups={groupsForRender.map(group => ({ id: group.id, title: group.title, description: group.description, count: group.count }))}
              selectedGroupId={effectiveSelectedGroupId}
              onSelect={groupId => setSelectedGroupId(groupId as GroupId)}
            />
            <div className="rounded-2xl border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quick Actions</p>
              <div className="mt-3 space-y-2">
                <ExportDataButton />
                <StorageWidget />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {normalizedQuery ? (
            groupsForRender.map(group => (
              <section key={group.id} className="rounded-2xl border bg-card p-4">
                <div className="mb-3">
                  <p className="text-sm font-semibold">{group.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{group.description}</p>
                </div>
                <div className="overflow-hidden rounded-xl border bg-background">
                  {group.items.map((item, index) => (
                    <div key={item.id} className={index > 0 ? 'border-t' : ''}>
                      {renderItem(item)}
                    </div>
                  ))}
                </div>
                {group.id === 'personal-support' ? <div className="mt-4">{renderPersonalSupportExtras()}</div> : null}
              </section>
            ))
          ) : selectedGroup ? (
            <section className="rounded-2xl border bg-card p-4">
              <div className="mb-4">
                <p className="text-sm font-semibold">{selectedGroup.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{selectedGroup.description}</p>
              </div>
              <div className="overflow-hidden rounded-xl border bg-background">
                {selectedGroup.items.map((item, index) => (
                  <div key={item.id} className={index > 0 ? 'border-t' : ''}>
                    {renderItem(item)}
                  </div>
                ))}
              </div>
              {selectedGroup.id === 'personal-support' ? <div className="mt-4">{renderPersonalSupportExtras()}</div> : null}
            </section>
          ) : null}
        </div>
      </div>

      <div className="space-y-4 lg:hidden">
        {groupsForRender.map(group => (
          <SettingsAccordionGroup
            key={group.id}
            title={group.title}
            description={group.description}
            count={group.count}
            open={openGroups.includes(group.id)}
            onToggle={() => toggleGroup(group.id)}
          >
            <div className="overflow-hidden rounded-xl border bg-background">
              {group.items.map((item, index) => (
                <div key={item.id} className={index > 0 ? 'border-t' : ''}>
                  {renderItem(item)}
                </div>
              ))}
            </div>
            {group.id === 'personal-support' ? <div className="mt-3">{renderPersonalSupportExtras()}</div> : null}
            {group.id === 'compliance-finance' ? (
              <div className="mt-3 space-y-2">
                <ExportDataButton />
                <StorageWidget />
              </div>
            ) : null}
          </SettingsAccordionGroup>
        ))}
      </div>
    </div>
  )
}
