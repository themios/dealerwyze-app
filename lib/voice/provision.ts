/**
 * Retell AI voice agent provisioning.
 * Each org gets its own LLM (prompt) + agent + linked Twilio phone number.
 */

import { createServiceClient } from '@/lib/supabase/service'

const BASE        = 'https://api.retellai.com'
const VOICE_ID    = 'openai-Nova'              // platform default voice
const WEBHOOK_URL = `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/retell-callback`

function headers() {
  return {
    Authorization:  `Bearer ${process.env.RETELL_API_KEY!}`,
    'Content-Type': 'application/json',
  }
}

async function retellPost(path: string, body: object) {
  const res = await fetch(`${BASE}${path}`, {
    method:  'POST',
    headers: headers(),
    body:    JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { message?: string }
    throw new Error(err.message ?? `Retell ${path} failed (${res.status})`)
  }
  return res.json()
}

async function retellDelete(path: string) {
  await fetch(`${BASE}${path}`, { method: 'DELETE', headers: headers() }).catch(() => {})
}

function buildPrompt(
  businessName: string,
  hoursStart:   string,
  hoursEnd:     string,
  dealerCell:   string,
  vertical:     'dealer' | 'real_estate' = 'dealer',
): string {
  const businessType = vertical === 'real_estate' ? 'real estate agency' : 'used car dealership'
  const vehicleInstructions = vertical === 'real_estate'
    ? '2. If they\'re asking about a property: ask for location/type of interest, check MLS listings if you have the tool, and share availability.'
    : '2. If they\'re asking about a vehicle: ask for make/model/year of interest, check live inventory if you have the tool, and share availability.'
  const collectionItems = vertical === 'real_estate'
    ? 'caller name, callback phone number, property interests (location, type, budget), and preferred appointment time.'
    : 'caller name, callback phone number, vehicle interest, and preferred appointment time.'

  return `You are the AI phone receptionist for ${businessName}, a ${businessType}.

IMPORTANT: At the start of the call, you must inform the caller that the call is being recorded.
Say: "Thank you for calling ${businessName}. Please note that this call is being recorded for quality and training purposes. How can I help you today?"

Your goals on each call:
1. Greet the caller warmly and inform them of recording (see above).
${vehicleInstructions}
3. If they want to reach someone: let them know a team member will call back shortly.
4. Always collect: ${collectionItems}

Business hours: ${hoursStart} – ${hoursEnd}.
${dealerCell ? `Team direct: ${dealerCell}.` : ''}

Rules:
- Never quote financing, monthly payments, or out-the-door prices without team confirmation.
${vertical === 'real_estate'
  ? '- For listing information, share only publicly available MLS data and say "I can arrange a showing with my team."'
  : '- For listing prices, share only the advertised price and say "final price confirmed with sales team."'}
- Keep all responses under 30 words when possible.
- Be friendly, professional, and concise.
- Honor STOP/STOP RECORDING requests if the caller explicitly asks to opt out of recording.`
}

/**
 * Create a Retell LLM + agent for an org, and link the org's Twilio number.
 * Idempotent: if agent already exists, returns existing IDs.
 */
export async function provisionVoiceAgent(
  orgId: string,
  opts: {
    businessName: string
    phoneNumber:  string   // E.164 (org's Twilio number)
    hoursStart:   string
    hoursEnd:     string
    dealerCell:   string
    vertical?:    'dealer' | 'real_estate'
  },
): Promise<{ llmId: string; agentId: string }> {
  const supabase = createServiceClient()

  // Check if already provisioned
  const { data: existing } = await supabase
    .from('org_settings')
    .select('retell_agent_id, retell_llm_id')
    .eq('org_id', orgId)
    .maybeSingle()

  if (existing?.retell_agent_id && existing?.retell_llm_id) {
    return { agentId: existing.retell_agent_id, llmId: existing.retell_llm_id }
  }

  // 1. Create LLM (org-specific prompt with recording disclosure)
  const prompt = buildPrompt(opts.businessName, opts.hoursStart, opts.hoursEnd, opts.dealerCell, opts.vertical)
  const llm = await retellPost('/create-retell-llm', {
    general_prompt: prompt,
    begin_message:  `Thank you for calling ${opts.businessName}. How can I help you today?`,
  }) as { llm_id: string }

  // 2. Create agent
  const agent = await retellPost('/create-agent', {
    response_engine: { type: 'retell-llm', llm_id: llm.llm_id },
    voice_id:        VOICE_ID,
    agent_name:      `${opts.businessName} — Voice Agent`,
    language:        'en-US',
    webhook_url:     WEBHOOK_URL,
    begin_message:   `Thank you for calling ${opts.businessName}. How can I help you today?`,
  }) as { agent_id: string }

  // 3. Import org's Twilio number into Retell (links it to this agent)
  //    Uses platform Twilio creds since we provision numbers on the master account.
  await retellPost('/create-phone-number', {
    phone_number:       opts.phoneNumber,
    agent_id:           agent.agent_id,
    twilio_account_sid: process.env.TWILIO_ACCOUNT_SID,
    twilio_auth_token:  process.env.TWILIO_AUTH_TOKEN,
  }).catch(err => {
    // Non-fatal: number might already be imported or on a sub-account
    console.warn('[provision-voice] phone import failed:', err)
  })

  // 4. Persist to DB
  await supabase
    .from('org_settings')
    .upsert(
      { org_id: orgId, retell_agent_id: agent.agent_id, retell_llm_id: llm.llm_id, updated_at: new Date().toISOString() },
      { onConflict: 'org_id' },
    )

  return { agentId: agent.agent_id, llmId: llm.llm_id }
}

/**
 * Remove the org's Retell agent, LLM, and phone number link.
 */
export async function deprovisionVoiceAgent(orgId: string): Promise<void> {
  const supabase = createServiceClient()

  const { data: settings } = await supabase
    .from('org_settings')
    .select('retell_agent_id, retell_llm_id, twilio_phone_number')
    .eq('org_id', orgId)
    .maybeSingle()

  if (!settings?.retell_agent_id) return

  // Unlink phone from Retell (delete-phone-number uses E.164)
  if (settings.twilio_phone_number) {
    await retellDelete(`/delete-phone-number/${encodeURIComponent(settings.twilio_phone_number)}`)
  }

  // Delete agent
  await retellDelete(`/delete-agent/${settings.retell_agent_id}`)

  // Delete LLM
  if (settings.retell_llm_id) {
    await retellDelete(`/delete-retell-llm/${settings.retell_llm_id}`)
  }

  // Clear from DB
  await supabase
    .from('org_settings')
    .update({ retell_agent_id: null, retell_llm_id: null, updated_at: new Date().toISOString() })
    .eq('org_id', orgId)
}
