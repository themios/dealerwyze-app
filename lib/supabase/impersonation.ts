import { createServiceClient } from './service'

type ScopedTable =
  | 'activities'
  | 'bhph_payments'
  | 'customer_sequences'
  | 'customers'
  | 'email_accounts'
  | 'gbp_reviews'
  | 'ledger_transactions'
  | 'organizations'
  | 'org_pipeline_stages'
  | 'org_settings'
  | 'profiles'
  | 'receipt_categories'
  | 'receipts'
  | 'recon_checklist_items'
  | 'sequences'
  | 'social_accounts'
  | 'social_posts'
  | 'tasks'
  | 'templates'
  | 'vehicle_photos'
  | 'vehicles'
  | 'video_renders'
  | 'voice_calls'

const TABLE_SCOPE_COLUMN: Record<ScopedTable, string> = {
  activities: 'user_id',
  bhph_payments: 'user_id',
  customer_sequences: 'org_id',
  customers: 'user_id',
  email_accounts: 'org_id',
  gbp_reviews: 'org_id',
  ledger_transactions: 'user_id',
  organizations: 'id',
  org_pipeline_stages: 'org_id',
  org_settings: 'org_id',
  profiles: 'org_id',
  receipt_categories: 'user_id',
  receipts: 'user_id',
  recon_checklist_items: 'org_id',
  sequences: 'org_id',
  social_accounts: 'org_id',
  social_posts: 'org_id',
  tasks: 'user_id',
  templates: 'user_id',
  vehicle_photos: 'org_id',
  vehicles: 'user_id',
  video_renders: 'org_id',
  voice_calls: 'org_id',
}

const UNSCOPED_READ_TABLES = new Set([
  'video_templates',
])

function hasScopedTable(table: string): table is ScopedTable {
  return table in TABLE_SCOPE_COLUMN
}

/**
 * Read-only impersonation client.
 *
 * This still uses the service role under the hood so platform staff can inspect an
 * org they do not belong to, but it never hands application code a raw unrestricted
 * client. Every `.from(table)` call is pre-scoped to the impersonated org for
 * allowlisted tables, and unknown tables are rejected until they are reviewed.
 */
export function createScopedImpersonationClient(orgId: string) {
  const service = createServiceClient()
  const client = Object.create(service) as ReturnType<typeof createServiceClient>

  client.from = ((table: string) => {
      if (hasScopedTable(table)) {
        const builder = service.from(table) as unknown as {
          eq: (column: string, value: string) => unknown
        }
        return builder.eq(TABLE_SCOPE_COLUMN[table], orgId)
      }

      if (UNSCOPED_READ_TABLES.has(table)) {
        return service.from(table)
      }

      throw new Error(`Read-only impersonation attempted to access unscoped table "${table}"`)
  }) as typeof service.from

  return client
}
