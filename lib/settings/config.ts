import {
  Building2, Users, GitBranch, Globe, MapPin, Zap, ListOrdered, Webhook, Target,
  ClipboardList, Video, Share2, DollarSign, Heart, CreditCard, BookOpen,
  Shield, ArrowRightLeft, Palette, MessageSquare,
} from 'lucide-react'
import { describeSettingsAudience, canViewSettingsAudience, type SettingsAudience } from '@/lib/settings/access'
import type { UserRole } from '@/types/index'

export type GroupId =
  | 'business'
  | 'sales-communication'
  | 'inventory-merchandising'
  | 'customer-experience'
  | 'compliance-finance'
  | 'personal-support'

export interface SettingsGroupConfig {
  id: GroupId
  title: string
  description: string
}

export interface SettingsItemConfig {
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

export const SETTINGS_STORAGE_KEY = 'settings-control-center-v1'

export const GROUPS: SettingsGroupConfig[] = [
  { id: 'business',                title: 'Business',                  description: 'Organization identity, team access, pipeline, and website controls.' },
  { id: 'sales-communication',     title: 'Sales & Communication',     description: 'Automation, sequences, outbound messaging, and sales targets.' },
  { id: 'inventory-merchandising', title: 'Inventory & Merchandising', description: 'Recon defaults plus video and social merchandising controls.' },
  { id: 'customer-experience',     title: 'Customer Experience',       description: 'Booking, payments, reviews, post-sale outreach, and retention settings.' },
  { id: 'compliance-finance',      title: 'Compliance & Finance',      description: 'Billing, bookkeeping, audit history, and ownership transfer workflows.' },
  { id: 'personal-support',        title: 'Personal & Support',        description: 'Personal preferences, account security, support, and legal resources.' },
]

export const SETTINGS_ITEMS: SettingsItemConfig[] = [
  { id: 'organization',    group: 'business',                href: '/settings/organization',    title: 'Organization',            description: 'Business profile, intake channels, integrations, and administrative controls.', keywords: ['dealer', 'business', 'profile', 'calendar', 'gmail', 'phone'],         audience: 'dealer_admin', accessBadge: describeSettingsAudience('dealer_admin'), icon: Building2 },
  { id: 'locations',       group: 'business',                href: '/settings/locations',       title: 'Locations',               description: 'Store locations, staff assignments, and per-location phone and inventory URLs.', keywords: ['location', 'store', 'lot', 'multi-location', 'branch'],              audience: 'dealer_admin', accessBadge: describeSettingsAudience('dealer_admin'), icon: MapPin },
  { id: 'users',           group: 'business',                href: '/settings/users',           title: 'Users',                   description: 'Invite staff, assign roles, and manage lead routing.',                          keywords: ['team', 'staff', 'roles', 'invite', 'permissions'],                      audience: 'dealer_admin', accessBadge: describeSettingsAudience('dealer_admin'), icon: Users },
  { id: 'pipeline',        group: 'business',                href: '/settings/pipeline',        title: 'Pipeline',                description: 'Rename, reorder, and tune pipeline stages to match your sales process.',        keywords: ['stages', 'board', 'lead status'],                                        audience: 'dealer_admin', accessBadge: describeSettingsAudience('dealer_admin'), icon: GitBranch },
  { id: 'website',         group: 'business',                href: '/settings/website',         title: 'Website',                 description: 'Public inventory page, custom domain details, and customer-facing website settings.', keywords: ['public site', 'inventory site', 'domain', 'website'],                  audience: 'dealer_admin', accessBadge: describeSettingsAudience('dealer_admin'), icon: Globe },

  { id: 'automation',      group: 'sales-communication',     href: '/settings/automation',      title: 'Automation',              description: 'Lead response timing, auto-response behavior, and message templates.',           keywords: ['autoresponder', 'sla', 'sms', 'email', 'template'],                     audience: 'dealer_admin', accessBadge: describeSettingsAudience('dealer_admin'), icon: Zap },
  { id: 'sequences',       group: 'sales-communication',     href: '/settings/sequences',       title: 'Sequences',               description: 'Build and manage email and SMS follow-up cadences.',                            keywords: ['sequence', 'drip', 'cadence', 'follow-up'],                             audience: 'all',          icon: ListOrdered },
  { id: 'webhooks',        group: 'sales-communication',     href: '/settings/webhooks',        title: 'Webhooks',                description: 'Send lead and appointment events to external systems in real time.',            keywords: ['integration', 'api', 'zapier', 'hooks'],                                audience: 'dealer_admin', accessBadge: describeSettingsAudience('dealer_admin'), icon: Webhook },
  { id: 'goals',           group: 'sales-communication',     href: '/settings/goals',           title: 'Goals',                   description: 'Set the sales targets that feed the AI dealer brief.',                         keywords: ['targets', 'forecast', 'ai dealer brief'],                               audience: 'dealer_admin', accessBadge: describeSettingsAudience('dealer_admin'), icon: Target },

  { id: 'recon-template',  group: 'inventory-merchandising', href: '/settings/recon-template',  title: 'Recon Checklist Template', description: 'Set the default staging checklist for new inventory.',                        keywords: ['checklist', 'reconditioning', 'staging'],                               audience: 'dealer_admin', accessBadge: describeSettingsAudience('dealer_admin'), icon: ClipboardList },
  { id: 'video',           group: 'inventory-merchandising', href: '/settings/video',           title: 'Video Settings',          description: 'Control templates, voice, and autopost defaults for inventory videos.',        keywords: ['remotion', 'voice', 'video'],                                           audience: 'dealer_admin', accessBadge: describeSettingsAudience('dealer_admin'), icon: Video },
  { id: 'social',          group: 'inventory-merchandising', href: '/settings/social',          title: 'Social Accounts',         description: 'Connect channels for automated merchandising posts.',                          keywords: ['facebook', 'instagram', 'tiktok', 'youtube', 'social'],                audience: 'dealer_admin', accessBadge: describeSettingsAudience('dealer_admin'), icon: Share2 },

  { id: 'payments',        group: 'customer-experience',     href: '/settings/payments',        title: 'Payments & Booking',      description: 'Stripe settings for BHPH payments and customer self-booking controls.',        keywords: ['booking', 'stripe', 'bhph', 'appointments', 'payments'],               audience: 'dealer_admin', accessBadge: describeSettingsAudience('dealer_admin'), icon: DollarSign },
  { id: 'pulse',           group: 'customer-experience',     href: '/settings/pulse',           title: 'Post-Sale Outreach',      description: 'Review requests and survey sends after every sale.',                           keywords: ['pulse', 'survey', 'review request'],                                    audience: 'dealer_admin', accessBadge: describeSettingsAudience('dealer_admin'), icon: Heart },
  { id: 'reviews',         group: 'customer-experience',     href: '/settings/reviews',         title: 'Reviews',                 description: 'Manage review prompts, destinations, and customer feedback routing.',          keywords: ['google review', 'ratings', 'reputation'],                               audience: 'dealer_admin', accessBadge: describeSettingsAudience('dealer_admin'), icon: MessageSquare },
  { id: 'retention',       group: 'customer-experience',     href: '/settings/retention',       title: 'Retention',               description: 'Campaign cadence, postcard automation, and customer retention timing.',        keywords: ['postcards', 'birthday', 'retention', 'campaign'],                       audience: 'dealer_admin', accessBadge: describeSettingsAudience('dealer_admin'), icon: Users },

  { id: 'billing',         group: 'compliance-finance',      href: '/settings/billing',         title: 'Billing',                 description: 'Manage the subscription, payment method, and plan details.',                   keywords: ['plan', 'subscription', 'invoice'],                                      audience: 'dealer_admin', accessBadge: describeSettingsAudience('dealer_admin'), icon: CreditCard },
  { id: 'bookkeeping',     group: 'compliance-finance',      href: '/settings/bookkeeping',     title: 'Bookkeeping',             description: 'Receipt categories and QuickBooks mapping for the ledger.',                    keywords: ['ledger', 'quickbooks', 'expenses', 'receipts'],                         audience: 'all',          icon: BookOpen },
  { id: 'audit',           group: 'compliance-finance',      href: '/settings/audit',           title: 'Audit Log',               description: 'Review security, export, billing, and settings-change history.',               keywords: ['security', 'events', 'history', 'audit'],                               audience: 'dealer_admin', accessBadge: describeSettingsAudience('dealer_admin'), icon: Shield },
  { id: 'transfer',        group: 'compliance-finance',      href: '/settings/transfer',        title: 'Business Transfer',       description: 'Controlled, high-risk ownership transfer workflow.',                          keywords: ['ownership', 'sell business', 'transfer'],                               audience: 'dealer_admin', accessBadge: describeSettingsAudience('dealer_admin'), icon: ArrowRightLeft },

  { id: 'appearance',      group: 'personal-support',        href: '/settings/appearance',      title: 'Appearance',              description: 'Theme and typography preferences for the app.',                               keywords: ['theme', 'font', 'colors', 'appearance'],                                audience: 'all',          icon: Palette },
]

export function getItemsForGroup(groupId: GroupId, role: UserRole, canManageReconTemplate = true): SettingsItemConfig[] {
  return SETTINGS_ITEMS.filter(item => {
    if (item.group !== groupId) return false
    if (!canManageReconTemplate && item.id === 'recon-template') return false
    return canViewSettingsAudience(role, item.audience)
  })
}

export function getGroupForPath(pathname: string): GroupId | null {
  const match = SETTINGS_ITEMS.find(item =>
    pathname === item.href || pathname.startsWith(item.href + '/')
  )
  return match?.group ?? null
}

export function matchesSearch(item: SettingsItemConfig, query: string): boolean {
  if (!query) return true
  const haystack = [item.title, item.description, ...item.keywords].join(' ').toLowerCase()
  return haystack.includes(query.toLowerCase().trim())
}
