/**
 * Daily Buyer Listing Matching Cron Job
 *
 * Runs daily at 7 AM UTC (after MLS sync at 6 AM)
 * For each RE agent: gets new MLS listings and matches against active buyer profiles
 * Creates matched_opportunities records for new matches
 * Queues notification emails to agent (deduplicated per day)
 *
 * Service-role job (no auth context). Idempotent: unique constraint prevents duplicates.
 */

import { matchesProfile, type BuyerProfile, type Listing } from '@/lib/matching/matchListing'
import { sendNotificationEmail } from '@/lib/email/notify'
import type { createServiceClient } from '@/lib/supabase/service'

interface Agent {
  id: string
  org_id: string
  email: string
  full_name: string
}

interface VehicleRow {
  id: string
  address: string
  city: string
  bedrooms: number | null
  bathrooms: number | null
  price: number | null
  sqft: number | null
  year_built: number | null
  property_type: string | null
  hoa_amenities: boolean | null
  mls_number: string | null
}

interface BuyerProfileRow {
  id: string
  buyer_name: string
  bedrooms_min: number | null
  bedrooms_max: number | null
  bathrooms_min: number | null
  bathrooms_max: number | null
  price_min: number | null
  price_max: number | null
  sqft_min: number | null
  sqft_max: number | null
  location: string | null
  year_built_min: number | null
  year_built_max: number | null
  property_type: string
  hoa_allowed: boolean
}

interface MatchedOpportunityInsert {
  buyer_profile_id: string
  listing_id: string
  status: 'new'
  matched_at?: string
}

export interface MatchBuyerListingsResult {
  matchesCreated: number
  agentsProcessed: number
  errors: Array<{ agent_id: string; error: string }>
}

export async function runMatchBuyerListings(
  supabase: ReturnType<typeof createServiceClient>
): Promise<MatchBuyerListingsResult> {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayISO = yesterday.toISOString()

  let matchesCreated = 0
  let agentsProcessed = 0
  const errors: Array<{ agent_id: string; error: string }> = []

  try {
    // Fetch all RE agents with buyer profiles (service role)
    const { data: agents, error: agentsError } = await supabase
      .from('profiles')
      .select('id, org_id, email, full_name')
      .eq('vertical', 'real_estate')
      .not('org_id', 'is', null)
      .limit(500)

    if (agentsError) {
      console.error('[matchBuyerListings] Failed to fetch agents:', agentsError)
      throw new Error(`Failed to fetch RE agents: ${agentsError.message}`)
    }

    if (!agents || agents.length === 0) {
      console.log('[matchBuyerListings] No RE agents found')
      return { matchesCreated: 0, agentsProcessed: 0, errors: [] }
    }

    console.log(`[matchBuyerListings] Processing ${agents.length} agents`)

    for (const agent of agents as Agent[]) {
      try {
        // Get new MLS listings synced since yesterday
        const { data: listings, error: listingsError } = await supabase
          .from('vehicles')
          .select(
            'id, address, city, bedrooms, bathrooms, price, sqft, year_built, property_type, hoa_amenities, mls_number'
          )
          .eq('user_id', agent.id) // agent_id field
          .eq('org_id', agent.org_id)
          .not('mls_number', 'is', null)
          .gte('mls_synced_at', yesterdayISO)
          .limit(500)

        if (listingsError) {
          console.error(`[matchBuyerListings] Agent ${agent.id} listings error:`, listingsError)
          errors.push({ agent_id: agent.id, error: listingsError.message })
          continue
        }

        if (!listings || listings.length === 0) {
          continue // No new listings for this agent
        }

        // Get active buyer profiles for this agent
        const { data: profiles, error: profilesError } = await supabase
          .from('buyer_profiles')
          .select(
            'id, buyer_name, bedrooms_min, bedrooms_max, bathrooms_min, bathrooms_max, price_min, price_max, sqft_min, sqft_max, location, year_built_min, year_built_max, property_type, hoa_allowed'
          )
          .eq('agent_id', agent.id)
          .eq('active', true)
          .limit(500)

        if (profilesError) {
          console.error(`[matchBuyerListings] Agent ${agent.id} profiles error:`, profilesError)
          errors.push({ agent_id: agent.id, error: profilesError.message })
          continue
        }

        if (!profiles || profiles.length === 0) {
          continue // No active profiles for this agent
        }

        // Track matches for this agent to queue notification
        const agentMatches: Array<{
          buyerName: string
          listingAddress: string
          listingPrice: number | null
          bedroomsBathrooms: string
        }> = []

        // For each profile, check all new listings
        for (const profile of profiles as BuyerProfileRow[]) {
          for (const listing of listings as VehicleRow[]) {
            try {
              const matches = matchesProfile(listing as Listing, profile as BuyerProfile)

              if (matches) {
                // Insert match (unique constraint prevents duplicates)
                const payload: MatchedOpportunityInsert = {
                  buyer_profile_id: profile.id,
                  listing_id: listing.id,
                  status: 'new',
                  matched_at: new Date().toISOString(),
                }

                const { error: insertError } = await supabase
                  .from('matched_opportunities')
                  .insert(payload)

                // Unique constraint violation = already matched (OK)
                if (insertError) {
                  if (insertError.code === '23505') {
                    continue
                  }
                  throw insertError
                }

                matchesCreated++
                agentMatches.push({
                  buyerName: profile.buyer_name,
                  listingAddress: listing.address,
                  listingPrice: listing.price,
                  bedroomsBathrooms: `${listing.bedrooms || '?'}bd/${listing.bathrooms || '?'}ba`,
                })

                console.log(
                  `[matchBuyerListings] Matched listing ${listing.id} to buyer ${profile.buyer_name}`
                )
              }
            } catch (err) {
              console.error(
                `[matchBuyerListings] Error matching listing ${listing.id} to profile ${profile.id}:`,
                err
              )
            }
          }
        }

        // Queue notification email if there are matches
        if (agentMatches.length > 0) {
          try {
            await queueMatchNotification(supabase, agent, agentMatches)
          } catch (err) {
            console.error(`[matchBuyerListings] Failed to queue notification for agent ${agent.id}:`, err)
          }
        }

        agentsProcessed++
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error'
        console.error(`[matchBuyerListings] Agent ${agent.id} failed:`, errorMsg)
        errors.push({ agent_id: agent.id, error: errorMsg })
      }
    }

    console.log(
      `[matchBuyerListings] Complete: ${matchesCreated} matches, ` +
        `${agentsProcessed} agents, ${errors.length} errors`
    )

    return { matchesCreated, agentsProcessed, errors }
  } catch (err) {
    console.error('[matchBuyerListings] Critical error:', err)
    throw err
  }
}

/**
 * Queue notification email for agent matches (deduplicated per day)
 */
async function queueMatchNotification(
  supabase: ReturnType<typeof createServiceClient>,
  agent: Agent,
  matches: Array<{
    buyerName: string
    listingAddress: string
    listingPrice: number | null
    bedroomsBathrooms: string
  }>
) {
  // Check if alert already sent today
  const today = new Date().toISOString().split('T')[0]
  const { data: existing } = await supabase
    .from('admin_alerts')
    .select('id')
    .eq('org_id', agent.org_id)
    .eq('event_type', 'buyer_match')
    .gte('created_at', `${today}T00:00:00Z`)
    .single()

  if (existing) {
    console.log(`[matchBuyerListings] Alert already sent to agent ${agent.id} today`)
    return
  }

  // Build email HTML
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://realtywyze.us'
  const html = buildMatchNotificationHtml(agent.full_name, appUrl, matches)

  // Send email
  await sendNotificationEmail({
    to: agent.email,
    subject: `You have ${matches.length} new buyer match${matches.length !== 1 ? 'es' : ''}`,
    html,
    org_id: agent.org_id,
    email_type: 'buyer_match_notification',
    vertical: 'real_estate',
  })

  // Log alert
  await supabase.from('admin_alerts').insert({
    org_id: agent.org_id,
    event_type: 'buyer_match',
    data: { match_count: matches.length, agent_id: agent.id },
  })

  console.log(`[matchBuyerListings] Notification queued for agent ${agent.id}`)
}

/**
 * Build buyer match notification email HTML
 */
function buildMatchNotificationHtml(
  agentName: string,
  appUrl: string,
  matches: Array<{
    buyerName: string
    listingAddress: string
    listingPrice: number | null
    bedroomsBathrooms: string
  }>
): string {
  const formattedPrice = (price: number | null) => {
    if (!price) return 'Price TBD'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(price)
  }

  const matchRows = matches
    .map(
      m => `
    <tr style="border-bottom:1px solid #F1F5F9">
      <td style="padding:16px 0;vertical-align:top">
        <table cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td>
              <p style="margin:0 0 4px;font-size:14px;font-weight:700;color:#0D2B55">${m.buyerName}</p>
              <p style="margin:0 0 2px;font-size:13px;color:#374151">${m.listingAddress}</p>
              <p style="margin:0 0 4px;font-size:13px;color:#64748B">${m.bedroomsBathrooms} &nbsp;|&nbsp; ${formattedPrice(m.listingPrice)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>`
    )
    .join('')

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:24px 16px">
  <tr><td>
    <div style="background:#0D2B55;border-radius:12px 12px 0 0;padding:24px 32px">
      <p style="margin:0;color:#F07018;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em">RealtyWyze</p>
      <h1 style="margin:8px 0 0;color:#FFFFFF;font-size:20px;font-weight:700">
        ${matches.length} new buyer match${matches.length !== 1 ? 'es' : ''}
      </h1>
    </div>
    <div style="background:#FFFFFF;padding:32px;border:1px solid #E2E8F0;border-top:none">
      <p style="margin:0 0 24px;color:#374151;font-size:15px;line-height:1.7">
        Hey ${agentName}, we found ${matches.length} listing${matches.length !== 1 ? 's' : ''} that match your buyer criteria.
        Review them below and reach out to your buyers who might be interested.
      </p>

      <div style="background:#F0F7FF;border:1px solid #BFE7FF;border-radius:8px;padding:24px;margin:0 0 28px">
        <p style="margin:0 0 16px;font-size:13px;font-weight:700;color:#0D2B55;text-transform:uppercase;letter-spacing:0.05em">
          New matches
        </p>
        <table cellpadding="0" cellspacing="0" width="100%">
          ${matchRows}
        </table>
      </div>

      <div style="text-align:center;margin-bottom:28px">
        <a href="${appUrl}/app/matches"
           style="display:inline-block;background:#F07018;color:#FFFFFF;font-weight:700;
                  font-size:15px;padding:14px 40px;border-radius:8px;text-decoration:none">
          Review Your Matches
        </a>
      </div>

      <p style="margin:0;font-size:14px;color:#374151;line-height:1.7">
        You can manage all your buyer matches and mark them as sent, reviewed, or closed from your dashboard.
        New listings will continue to match automatically throughout the day.
      </p>
    </div>
    <div style="padding:16px;text-align:center;color:#94A3B8;font-size:11px">
      RealtyWyze &nbsp;|&nbsp; <a href="${appUrl}" style="color:#94A3B8;text-decoration:underline">${appUrl.replace('https://', '')}</a>
    </div>
  </td></tr>
</table>
</body>
</html>`
}
