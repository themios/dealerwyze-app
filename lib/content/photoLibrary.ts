import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export interface BrandPhoto {
  id:         string
  org_id:     string
  url:        string
  filename:   string
  tags:       string[]
  active:     boolean
  sort_order: number
  created_at: string
}

// Returns a random active photo for the org, optionally filtered by tags
export async function getRandomBrandPhoto(
  supabase: SupabaseClient,
  orgId: string,
  tags?: string[],
): Promise<string | null> {
  let query = supabase
    .from('org_brand_photos')
    .select('url')
    .eq('org_id', orgId)
    .eq('active', true)

  if (tags && tags.length > 0) {
    query = query.overlaps('tags', tags)
  }

  const { data } = await query
  if (!data || data.length === 0) return null

  const pick = data[Math.floor(Math.random() * data.length)]
  return pick.url
}

// Returns all active photos for the org, ordered by sort_order then created_at
export async function listBrandPhotos(
  supabase: SupabaseClient,
  orgId: string,
): Promise<BrandPhoto[]> {
  const { data } = await supabase
    .from('org_brand_photos')
    .select('*')
    .eq('org_id', orgId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(500)

  return data ?? []
}

// Records a photo that was just uploaded to Supabase Storage
export async function registerBrandPhoto(
  supabase: SupabaseClient,
  orgId: string,
  url: string,
  filename: string,
  tags: string[] = [],
): Promise<BrandPhoto> {
  const { data, error } = await supabase
    .from('org_brand_photos')
    .insert({ org_id: orgId, url, filename, tags })
    .select()
    .single()

  if (error || !data) throw new Error(`Failed to register photo: ${error?.message}`)
  return data
}

export async function deleteBrandPhoto(
  supabase: SupabaseClient,
  orgId: string,
  photoId: string,
): Promise<void> {
  const { error } = await supabase
    .from('org_brand_photos')
    .delete()
    .eq('id', photoId)
    .eq('org_id', orgId)

  if (error) throw new Error(`Failed to delete photo: ${error.message}`)
}
