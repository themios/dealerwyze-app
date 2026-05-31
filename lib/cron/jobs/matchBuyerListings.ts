/**
 * Daily Buyer Listing Matching Cron Job
 *
 * Runs daily at 7 AM UTC (after MLS sync at 6 AM)
 * For each agent: gets new MLS listings and matches against buyer profiles
 * Creates matched_opportunities records for new matches
 *
 * Idempotent: uses unique index to prevent duplicate matches
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { matchesProfile, type BuyerProfile, type Listing } from '@/lib/matching/matchListing';

interface Agent {
  id: string;
  org_id: string;
}

interface VehicleRow {
  id: string;
  address: string;
  bedrooms: number | null;
  bathrooms: number | null;
  price: number | null;
  sqft: number | null;
  year_built: number | null;
  property_type: string | null;
  hoa_amenities: boolean | null;
  mls_number: string | null;
  mls_synced_at: string | null;
}

interface BuyerProfileRow {
  id: string;
  buyer_name: string;
  bedrooms_min: number | null;
  bedrooms_max: number | null;
  bathrooms_min: number | null;
  bathrooms_max: number | null;
  price_min: number | null;
  price_max: number | null;
  sqft_min: number | null;
  sqft_max: number | null;
  location: string | null;
  year_built_min: number | null;
  year_built_max: number | null;
  property_type: string;
  hoa_allowed: boolean;
  active: boolean;
}

export async function runMatchBuyerListings(client: SupabaseClient) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayISO = yesterday.toISOString();

  let matchCount = 0;
  let errorCount = 0;

  try {
    // Get all agents (service role query)
    const { data: agents, error: agentsError } = await client
      .from('profiles')
      .select('id, org_id')
      .eq('vertical', 'real_estate')
      .gt('org_id', 'null'); // Filter to agents with orgs

    if (agentsError) {
      console.error('Error fetching agents:', agentsError);
      throw agentsError;
    }

    if (!agents || agents.length === 0) {
      console.log('No real estate agents found');
      return { success: true, matchCount: 0, errorCount: 0 };
    }

    // For each agent
    for (const agent of agents as Agent[]) {
      try {
        // Get new MLS listings synced since yesterday
        const { data: listings, error: listingsError } = await client
          .from('vehicles')
          .select(
            'id, address, bedrooms, bathrooms, price, sqft, year_built, property_type, hoa_amenities, mls_number, mls_synced_at'
          )
          .eq('agent_id', agent.id)
          .eq('org_id', agent.org_id)
          .not('mls_number', 'is', null) // MLS listings only
          .gte('mls_synced_at', yesterdayISO)
          .order('mls_synced_at', { ascending: false });

        if (listingsError) {
          console.error(`Error fetching listings for agent ${agent.id}:`, listingsError);
          errorCount++;
          continue;
        }

        if (!listings || listings.length === 0) {
          continue; // No new listings for this agent
        }

        // Get active buyer profiles for this agent
        const { data: profiles, error: profilesError } = await client
          .from('buyer_profiles')
          .select(
            'id, buyer_name, bedrooms_min, bedrooms_max, bathrooms_min, bathrooms_max, price_min, price_max, sqft_min, sqft_max, location, year_built_min, year_built_max, property_type, hoa_allowed, active'
          )
          .eq('agent_id', agent.id)
          .eq('active', true);

        if (profilesError) {
          console.error(`Error fetching profiles for agent ${agent.id}:`, profilesError);
          errorCount++;
          continue;
        }

        if (!profiles || profiles.length === 0) {
          continue; // No active profiles for this agent
        }

        // For each profile, check all new listings
        for (const profile of profiles as BuyerProfileRow[]) {
          for (const listing of listings as VehicleRow[]) {
            try {
              const matches = matchesProfile(listing as Listing, profile as BuyerProfile);

              if (matches) {
                // Insert match (unique constraint prevents duplicates)
                const { error: insertError } = await client
                  .from('matched_opportunities')
                  .insert({
                    buyer_profile_id: profile.id,
                    listing_id: listing.id,
                    status: 'new',
                  })
                  .select()
                  .single();

                // Unique constraint violation = already matched (OK)
                if (insertError) {
                  if (insertError.code === '23505') {
                    // Unique constraint: already matched
                    continue;
                  }
                  throw insertError;
                }

                matchCount++;
                console.log(
                  `Matched listing ${listing.id} to profile ${profile.id} (${profile.buyer_name})`
                );
              }
            } catch (err) {
              console.error(
                `Error matching listing ${listing.id} to profile ${profile.id}:`,
                err
              );
              errorCount++;
            }
          }
        }
      } catch (err) {
        console.error(`Error processing agent ${agent.id}:`, err);
        errorCount++;
      }
    }

    console.log(`Matching complete: ${matchCount} new matches, ${errorCount} errors`);
    return { matchesCreated: matchCount };
  } catch (err) {
    console.error('Critical error in matching job:', err);
    throw err;
  }
}
