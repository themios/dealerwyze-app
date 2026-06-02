#!/usr/bin/env npx tsx
/**
 * Create a RealtyWyze pilot org: auth user, agency profile, Repliers listings, demo buyers.
 *
 * Usage:
 *   npx tsx scripts/setupPilotOrg.ts --name "Agent Name" --email agent@test.com
 *   npx tsx scripts/setupPilotOrg.ts --name "Agent Name" --email agent@test.com --password "Secret123!" --slug my-agency --listings 15
 *
 * Required env (.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, REPLIERS_API_KEY
 */

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { createServiceClient } from '../lib/supabase/service'
import { getRepliersListings } from '../lib/mls/repliersClient'
import { upsertMlsListing } from '../lib/mls/upsertMlsListing'
import { defaultStagesForVertical } from '../lib/leads/states'

function loadEnvLocal() {
  const path = resolve(process.cwd(), '.env.local')
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
}

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    const next = argv[i + 1]
    if (key.startsWith('--') && next && !next.startsWith('--')) {
      args[key.slice(2)] = next
      i++
    }
  }
  return args
}

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return code
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
}

async function uniqueSlug(service: ReturnType<typeof createServiceClient>, base: string): Promise<string> {
  let slug = base || 'pilot-agency'
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = attempt === 0 ? slug : `${slug}-${attempt + 1}`
    const { data } = await service.from('organizations').select('id').eq('slug', candidate).maybeSingle()
    if (!data) return candidate
  }
  return `${slug}-${Date.now().toString(36)}`
}

async function main() {
  loadEnvLocal()

  const args = parseArgs(process.argv.slice(2))
  const displayName = args.name?.trim()
  const email = args.email?.trim().toLowerCase()
  const password = args.password?.trim() || 'PilotTest123!'
  const listingCount = Math.min(Math.max(parseInt(args.listings ?? '15', 10) || 15, 10), 20)
  const slugOverride = args.slug?.trim().toLowerCase()

  if (!displayName || !email) {
    console.error('Usage: npx tsx scripts/setupPilotOrg.ts --name "Agent Name" --email agent@test.com [--password ...] [--slug ...] [--listings 15]')
    process.exit(2)
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
    process.exit(2)
  }

  if (!process.env.REPLIERS_API_KEY) {
    console.error('Missing REPLIERS_API_KEY in .env.local')
    process.exit(2)
  }

  const service = createServiceClient()
  const emailDomain = email.split('@')[1] ?? ''
  const agencyName = `${displayName}'s Agency`
  const slug = slugOverride || (await uniqueSlug(service, slugify(displayName)))

  console.log(`Creating pilot org for ${displayName} (${email})…`)

  const { data: created, error: createErr } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (createErr || !created.user) {
    console.error('Auth create failed:', createErr?.message ?? 'unknown')
    process.exit(1)
  }

  const userId = created.user.id
  const orgId = userId

  const { error: orgErr } = await service.from('organizations').insert({
    id: orgId,
    name: agencyName,
    slug,
    approved_at: new Date().toISOString(),
    subscription_status: 'free',
    signup_email_domain: emailDomain || null,
    vertical: 'real_estate',
    public_inventory_enabled: true,
  })

  if (orgErr) {
    await service.auth.admin.deleteUser(userId)
    console.error('Org insert failed:', orgErr.message)
    process.exit(1)
  }

  await service.from('org_settings').insert({ org_id: orgId })

  const stages = defaultStagesForVertical('real_estate')
  await service.from('org_pipeline_stages').insert(stages.map((s) => ({ ...s, org_id: orgId })))

  const { error: profileErr } = await service.from('profiles').insert({
    id: userId,
    display_name: displayName,
    role: 'admin',
    org_id: orgId,
    invite_code: generateInviteCode(),
    mls_board_id: 'repliers-sandbox',
  })

  if (profileErr) {
    await service.from('organizations').delete().eq('id', orgId)
    await service.auth.admin.deleteUser(userId)
    console.error('Profile insert failed:', profileErr.message)
    process.exit(1)
  }

  console.log(`Fetching ${listingCount} Repliers sandbox listings…`)
  const listings = await getRepliersListings({ limit: listingCount })

  let createdListings = 0
  let updatedListings = 0
  for (const listing of listings) {
    const { action } = await upsertMlsListing({
      supabase: service,
      listing,
      orgId,
      agentId: userId,
      mlsSource: 'repliers',
    })
    if (action === 'created') createdListings++
    else updatedListings++
  }

  const { error: buyersErr } = await service.from('buyer_profiles').insert([
    {
      org_id: orgId,
      agent_id: userId,
      buyer_name: 'Pilot Buyer — Family Home',
      bedrooms_min: 3,
      bedrooms_max: 5,
      price_min: 350_000,
      price_max: 1_500_000,
      location: listings[0]?.address.city ?? 'Pasadena',
      property_type: 'single_family',
      active: true,
      notes: 'Seeded by setupPilotOrg.ts for matcher demo',
    },
    {
      org_id: orgId,
      agent_id: userId,
      buyer_name: 'Pilot Buyer — Condo',
      bedrooms_min: 1,
      bedrooms_max: 2,
      price_min: 250_000,
      price_max: 900_000,
      property_type: 'condo',
      active: true,
      notes: 'Seeded by setupPilotOrg.ts for matcher demo',
    },
  ])

  if (buyersErr) {
    console.warn('Buyer profile seed warning:', buyersErr.message)
  }

  const appHost = process.env.REALTYWYZE_DOMAIN ?? 'realtywyze.us'
  const bookUrl = `https://${appHost}/book/${slug}`

  const summary = {
    ok: true,
    org_id: orgId,
    user_id: userId,
    agency_name: agencyName,
    slug,
    email,
    password,
    listings_synced: listings.length,
    listings_created: createdListings,
    listings_updated: updatedListings,
    buyer_profiles_seeded: buyersErr ? 0 : 2,
    book_url: bookUrl,
    login_url: `https://${appHost}/login`,
  }

  console.log(JSON.stringify(summary, null, 2))
}

main().catch((err) => {
  console.error('setupPilotOrg failed:', err)
  process.exit(1)
})
