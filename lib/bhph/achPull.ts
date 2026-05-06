/**
 * ACH auto-pull: create PaymentIntent + optional immediate finalize via RPC.
 * All successful settlement must also be confirmed via webhook for async ACH states.
 */

import { createServiceClient } from '@/lib/supabase/service'
import { generateToken } from '@/lib/bhph/paymentToken'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface StripePiErrorShape {
  code?: string
  decline_code?: string
  message?: string
}

export function shapeStripeError(err: unknown): StripePiErrorShape {
  if (err && typeof err === 'object') {
    const o = err as Record<string, unknown>
    return {
      code: typeof o.code === 'string' ? o.code : undefined,
      decline_code: typeof o.decline_code === 'string' ? o.decline_code : undefined,
      message: typeof o.message === 'string' ? o.message : undefined,
    }
  }
  return { message: String(err) }
}

/** Create or reuse today's pending ACH pull token for idempotency (same calendar day UTC). */
export async function getOrCreateAchPullToken(
  supabase: SupabaseClient,
  opts: {
    orgId: string
    customerId: string
    bhphContractId: string
    amount: number
  },
): Promise<{ id: string; token: string } | null> {
  const start = new Date()
  start.setUTCHours(0, 0, 0, 0)
  const startIso = start.toISOString()

  const { data: existing } = await supabase
    .from('bhph_payment_tokens')
    .select('id, token')
    .eq('bhph_contract_id', opts.bhphContractId)
    .eq('status', 'pending')
    .gte('created_at', startIso)
    .eq('amount', opts.amount)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing?.id && existing.token) {
    return { id: existing.id as string, token: existing.token as string }
  }

  const token = generateToken()
  const expires = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('bhph_payment_tokens')
    .insert({
      org_id: opts.orgId,
      customer_id: opts.customerId,
      bhph_contract_id: opts.bhphContractId,
      amount: opts.amount,
      token,
      expires_at: expires,
    })
    .select('id, token')
    .single()

  if (error || !data) return null
  return { id: data.id as string, token: data.token as string }
}

export async function createStripeAchPaymentIntent(args: {
  secretKey: string
  customerId: string
  paymentMethodId: string
  amountCents: number
  tokenRowId: string
  bhphContractId: string
  orgId: string
  paymentDateYmd: string
}): Promise<{ id: string; status: string } | null> {
  const qs = new URLSearchParams({
    amount: String(args.amountCents),
    currency: 'usd',
    customer: args.customerId,
    payment_method: args.paymentMethodId,
    confirm: 'true',
    off_session: 'true',
    'payment_method_types[]': 'us_bank_account',
    'metadata[bhph_payment_token]': args.tokenRowId,
    'metadata[bhph_id]': args.bhphContractId,
    'metadata[org_id]': args.orgId,
    'metadata[payment_date]': args.paymentDateYmd,
    'metadata[ach_pull]': '1',
  })

  const res = await fetch('https://api.stripe.com/v1/payment_intents', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${args.secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: qs,
    signal: AbortSignal.timeout(25_000),
  })

  const json = (await res.json()) as { id?: string; status?: string; error?: { message?: string; code?: string } }
  if (!res.ok || !json.id) {
    console.error('[achPull] payment_intent create failed', {
      code: json.error?.code,
      message: json.error?.message,
    })
    return null
  }
  return { id: json.id, status: json.status ?? 'unknown' }
}

export async function finalizeBhphPaymentRpc(args: {
  supabase: ReturnType<typeof createServiceClient>
  tokenId: string
  paymentIntentId: string
  paidAtIso: string
  amount: number
  paymentDateYmd: string
}): Promise<{ ok: boolean; already?: boolean; conflict?: boolean }> {
  const { data: rpcResult, error: rpcError } = await args.supabase.rpc('finalize_bhph_payment', {
    p_token_id: args.tokenId,
    p_stripe_payment_intent: args.paymentIntentId,
    p_paid_at: args.paidAtIso,
    p_amount: args.amount,
    p_payment_date: args.paymentDateYmd,
  })

  if (rpcError) {
    console.error('[achPull] finalize_bhph_payment rpc', { message: rpcError.message })
    return { ok: false }
  }

  const result = rpcResult as { ok?: boolean; already_processed?: boolean; conflict?: boolean } | null
  if (result?.conflict) return { ok: false, conflict: true }
  if (result?.already_processed) return { ok: true, already: true }
  if (result?.ok) return { ok: true }
  return { ok: false }
}

export async function recordAchFailureLedger(args: {
  supabase: ReturnType<typeof createServiceClient>
  contractId: string
  paymentDateYmd: string
  attemptedAmount: number
  stripePaymentIntentId: string | null
  notes: string
}): Promise<boolean> {
  const { error } = await args.supabase.rpc('record_bhph_manual_payment', {
    p_contract_id: args.contractId,
    p_amount: args.attemptedAmount,
    p_payment_date: args.paymentDateYmd,
    p_payment_type: 'failed_ach',
    p_notes: args.notes,
    p_recorded_by: null,
    p_stripe_payment_intent: args.stripePaymentIntentId,
  })
  if (error) {
    console.error('[achPull] record failed_ach ledger', { message: error.message })
    return false
  }
  return true
}
