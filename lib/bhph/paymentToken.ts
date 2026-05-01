/**
 * BHPH payment token helpers.
 * Generates a secure one-time token per reminder, stores it in
 * bhph_payment_tokens, and builds the /pay/[token] URL.
 */

import crypto from 'crypto'
import { createServiceClient } from '@/lib/supabase/service'

export function generateToken(): string {
  return crypto.randomBytes(24).toString('base64url')
}

export function buildPayUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://dealerwyze.com'
  return `${base}/pay/${token}`
}

/** Creates or returns an existing pending token for this contract + due cycle. */
export async function getOrCreatePaymentToken(opts: {
  orgId:          string
  customerId:     string
  bhphContractId: string
  amount:         number
}): Promise<{ id: string; token: string } | null> {
  const supabase = createServiceClient()

  // Reuse existing pending token if not expired
  const { data: existing } = await supabase
    .from('bhph_payment_tokens')
    .select('id, token')
    .eq('bhph_contract_id', opts.bhphContractId)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing) return existing

  const token = generateToken()
  const { data, error } = await supabase.from('bhph_payment_tokens').insert({
    org_id:          opts.orgId,
    customer_id:     opts.customerId,
    bhph_contract_id: opts.bhphContractId,
    amount:          opts.amount,
    token,
  }).select('id, token').single()

  return error ? null : data
}
