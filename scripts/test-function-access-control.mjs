#!/usr/bin/env node
/**
 * Verify migration 221 function access control.
 *
 * Usage: node scripts/test-function-access-control.mjs
 *
 * Expects .env.local with NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
 * SUPABASE_SERVICE_ROLE_KEY
 */

import fs from 'fs'

function loadEnvLocal() {
  const path = '.env.local'
  if (!fs.existsSync(path)) throw new Error('Missing .env.local')
  for (const line of fs.readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq <= 0) continue
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (!process.env[k]) process.env[k] = v
  }
}

function isAccessDenied(status, json) {
  if (status === 401 || status === 403) return true
  if (json?.code === 'PGRST202') return true // function not found to caller
  if (json?.code === '42501') return true // insufficient_privilege
  return false
}

async function rpcCall(key, fn, body = {}) {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/${fn}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  return { status: res.status, json }
}

loadEnvLocal()

const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!anonKey || !serviceKey) {
  console.error('Missing anon or service role key')
  process.exit(2)
}

const internalFns = [
  ['get_org_id', {}],
  ['add_overage_buffer', { p_org_id: '00000000-0000-0000-0000-000000000001', p_cents: 0 }],
  ['claim_twilio_message_sid', { p_message_sid: 'SM_test_access_control', p_org_id: '00000000-0000-0000-0000-000000000001' }],
  ['finalize_bhph_payment', {
    p_token_id: '00000000-0000-0000-0000-000000000001',
    p_stripe_payment_intent: 'pi_test',
    p_paid_at: new Date().toISOString(),
    p_amount: 1,
    p_payment_date: '2026-01-01',
  }],
  ['close_re_transaction', {
    p_org_id: '00000000-0000-0000-0000-000000000001',
    p_transaction_id: '00000000-0000-0000-0000-000000000001',
    p_closing_price: 1,
    p_closing_date: '2026-01-01',
    p_closed_by: '00000000-0000-0000-0000-000000000001',
  }],
]

const publicFns = [
  ['increment_vehicle_views', { p_vehicle_id: '00000000-0000-0000-0000-000000000001' }],
]

const results = { anon_blocked: [], anon_allowed: [], service_ok: [], service_fail: [] }

for (const [fn, body] of internalFns) {
  const r = await rpcCall(anonKey, fn, body)
  if (isAccessDenied(r.status, r.json)) {
    results.anon_blocked.push({ fn, status: r.status, code: r.json?.code })
  } else {
    results.anon_blocked.push({ fn, status: r.status, unexpected: true, json: r.json })
  }
}

for (const [fn, body] of publicFns) {
  const r = await rpcCall(anonKey, fn, body)
  if (r.status >= 200 && r.status < 300) {
    results.anon_allowed.push({ fn, status: r.status })
  } else if (r.status === 401 || r.status === 403 || r.json?.code === 'PGRST202') {
    results.anon_allowed.push({ fn, status: r.status, blocked_unexpectedly: true, json: r.json })
  } else {
    // 204/void or business error is fine — access was granted
    results.anon_allowed.push({ fn, status: r.status, note: 'execute permitted (non-auth error ok)' })
  }
}

for (const [fn, body] of [
  ['claim_twilio_message_sid', { p_message_sid: `SM_svc_${Date.now()}`, p_org_id: '00000000-0000-0000-0000-000000000001' }],
  ['add_overage_buffer', { p_org_id: '00000000-0000-0000-0000-000000000001', p_cents: 0 }],
]) {
  const r = await rpcCall(serviceKey, fn, body)
  if (r.status >= 200 && r.status < 300) {
    results.service_ok.push({ fn, status: r.status, json: r.json })
  } else {
    results.service_fail.push({ fn, status: r.status, json: r.json })
  }
}

const anonInternalBlocked = results.anon_blocked.every(
  (x) => !x.unexpected && isAccessDenied(x.status, { code: x.code })
)
const anonPublicOk = results.anon_allowed.every((x) => !x.blocked_unexpectedly)
const serviceOk = results.service_fail.length === 0

console.log(JSON.stringify({ ok: anonInternalBlocked && anonPublicOk && serviceOk, ...results }, null, 2))
process.exit(anonInternalBlocked && anonPublicOk && serviceOk ? 0 : 1)
