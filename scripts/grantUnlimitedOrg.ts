#!/usr/bin/env npx tsx
/**
 * Grant lifetime plan (all billing features) and clear AI reanalyze cooldowns for an org by user email.
 *
 * Usage: npx tsx scripts/grantUnlimitedOrg.ts --email realtywyze@gmail.com
 */

import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { createServiceClient } from '../lib/supabase/service'

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

async function main() {
  loadEnvLocal()
  const { email } = parseArgs(process.argv.slice(2))
  if (!email?.trim()) {
    console.error('Usage: npx tsx scripts/grantUnlimitedOrg.ts --email user@example.com')
    process.exit(1)
  }

  const target = email.trim().toLowerCase()

  const service = createServiceClient()

  // Resolve org via profiles (email lookup requires DB — use psql or admin API in ops)
  const { data: profiles } = await service.from('profiles').select('id, org_id, display_name').limit(5000)
  let orgId: string | null = null
  let userId: string | null = null
  let orgBefore: { name: string | null; slug: string | null; plan: string | null } | null = null

  const dbUrl = process.env.SUPABASE_DB_URL
  if (dbUrl && !dbUrl.includes('YOUR-PASSWORD')) {
    const { execSync } = await import('child_process')
    const out = execSync(
      `psql "${dbUrl.replace(/"/g, '\\"')}" -t -A -c "SELECT au.id, p.org_id FROM auth.users au JOIN public.profiles p ON p.id = au.id WHERE lower(au.email) = lower('${target.replace(/'/g, "''")}') LIMIT 1;"`,
      { encoding: 'utf8' },
    ).trim()
    if (out) {
      const [uid, oid] = out.split('|')
      userId = uid
      orgId = oid
    }
  }

  if (!orgId) {
    console.error(`Could not resolve org for ${target}. Set SUPABASE_DB_URL and retry.`)
    process.exit(1)
  }

  const { data: orgRow } = await service
    .from('organizations')
    .select('name, slug, plan')
    .eq('id', orgId)
    .single()
  orgBefore = orgRow

  const farTrial = new Date()
  farTrial.setFullYear(farTrial.getFullYear() + 10)

  const { error: orgErr } = await service
    .from('organizations')
    .update({
      plan: 'lifetime',
      trial_ends_at: farTrial.toISOString(),
      suspended_at: null,
      canceled_at: null,
    })
    .eq('id', orgId)

  if (orgErr) {
    console.error('org update failed:', orgErr.message)
    process.exit(1)
  }

  const { data: vehicles, error: vehErr } = await service
    .from('vehicles')
    .select('id')
    .eq('user_id', orgId)

  if (vehErr) {
    console.error('vehicles list failed:', vehErr.message)
    process.exit(1)
  }

  const ids = (vehicles ?? []).map(v => v.id)
  if (ids.length > 0) {
    const { error: clearErr } = await service
      .from('vehicles')
      .update({ ai_last_analyzed_at: null })
      .eq('user_id', orgId)

    if (clearErr) {
      console.error('clear ai_last_analyzed_at failed:', clearErr.message)
      process.exit(1)
    }
  }

  console.log(JSON.stringify({
    ok: true,
    email: target,
    user_id: userId,
    org_id: orgId,
    org_name: orgBefore?.name,
    org_slug: orgBefore?.slug,
    previous_plan: orgBefore?.plan,
    new_plan: 'lifetime',
    trial_ends_at: farTrial.toISOString(),
    listings_cleared_cooldown: ids.length,
  }, null, 2))
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
