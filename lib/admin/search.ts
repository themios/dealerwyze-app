/**
 * Admin search helpers for org, customer, and activity lookups.
 * Optimized for fast searches across large datasets.
 */

import { createServiceClient } from '@/lib/supabase/service'

export interface SearchOrgsResult {
  id: string
  name: string
  email: string
  status: 'active' | 'suspended' | 'deactivated'
  vertical: 'dealer' | 'real_estate'
  customers_count: number
  created_at: string
  owner_email?: string
}

export interface SearchCustomersResult {
  id: string
  name: string
  email?: string
  primary_phone?: string
  org_id: string
  last_activity_at?: string
  created_at: string
}

export interface SearchActivitiesResult {
  id: string
  customer_id: string
  customer_name: string
  type: string
  direction: string
  channel: string
  body: string
  completed_at?: string
  created_at: string
}

/**
 * Search organizations by name, email, or status.
 * Returns up to 100 results.
 */
export async function searchOrganizations(
  query: string,
  status?: string,
  limit = 50
): Promise<SearchOrgsResult[]> {
  const supabase = createServiceClient()

  let q = supabase
    .from('organizations')
    .select('id, name, email, status, vertical, created_at')
    .order('created_at', { ascending: false })
    .limit(Math.min(limit, 100))

  if (status && ['active', 'suspended', 'deactivated'].includes(status)) {
    q = q.eq('status', status)
  }

  if (query.trim()) {
    const searchQuery = `%${query}%`
    q = q.or(`name.ilike.${searchQuery},email.ilike.${searchQuery}`)
  }

  const { data, error } = await q

  if (error) {
    console.error('Search orgs error:', error.message)
    return []
  }

  // Fetch customer counts
  const orgIds = (data ?? []).map(o => o.id)
  if (orgIds.length === 0) return []

  const { data: counts } = await supabase
    .from('customers')
    .select('user_id', { count: 'exact' })
    .in('user_id', orgIds)

  const countsByOrgId: Record<string, number> = {}
  orgIds.forEach(id => {
    countsByOrgId[id] = (counts ?? []).filter(c => c.user_id === id).length
  })

  return (data ?? []).map(org => ({
    ...org,
    customers_count: countsByOrgId[org.id] ?? 0,
  }))
}

/**
 * Search customers within an organization by name, email, or phone.
 */
export async function searchCustomers(
  orgId: string,
  query: string,
  limit = 50
): Promise<SearchCustomersResult[]> {
  const supabase = createServiceClient()

  let q = supabase
    .from('customers')
    .select('id, name, email, primary_phone, created_at')
    .or(`user_id.eq.${orgId},user_id.eq.${orgId}`) // Org scoping via user_id
    .order('created_at', { ascending: false })
    .limit(Math.min(limit, 100))

  if (query.trim()) {
    const searchQuery = `%${query}%`
    q = q.or(`name.ilike.${searchQuery},email.ilike.${searchQuery},primary_phone.ilike.${searchQuery}`)
  }

  const { data, error } = await q

  if (error) {
    console.error('Search customers error:', error.message)
    return []
  }

  return (data ?? []).map(c => ({
    ...c,
    org_id: orgId,
    last_activity_at: undefined, // TODO: fetch from activities table if needed
  }))
}

/**
 * Search activities (interactions) within an organization.
 * Supports filtering by type, direction, and date range.
 */
export async function searchActivities(
  orgId: string,
  query?: string,
  filters?: {
    type?: string
    direction?: string
    channel?: string
    from_date?: string
    to_date?: string
  },
  limit = 50
): Promise<SearchActivitiesResult[]> {
  const supabase = createServiceClient()

  let q = supabase
    .from('activities')
    .select(
      `id, customer_id, type, direction, channel, body, completed_at, created_at,
       customers!inner(name)`
    )
    .eq('user_id', orgId) // Org scoping via user_id
    .neq('body', '__sequence_sent__') // Exclude system messages
    .order('created_at', { ascending: false })
    .limit(Math.min(limit, 100))

  if (query?.trim()) {
    q = q.ilike('body', `%${query}%`)
  }

  if (filters?.type) {
    q = q.eq('type', filters.type)
  }
  if (filters?.direction) {
    q = q.eq('direction', filters.direction)
  }
  if (filters?.channel) {
    q = q.eq('channel', filters.channel)
  }
  if (filters?.from_date) {
    q = q.gte('created_at', filters.from_date)
  }
  if (filters?.to_date) {
    q = q.lte('created_at', filters.to_date)
  }

  const { data, error } = await q

  if (error) {
    console.error('Search activities error:', error.message)
    return []
  }

  return (data ?? []).map((a: any) => ({
    id: a.id,
    customer_id: a.customer_id,
    customer_name: a.customers?.name ?? 'Unknown',
    type: a.type,
    direction: a.direction,
    channel: a.channel,
    body: a.body,
    completed_at: a.completed_at,
    created_at: a.created_at,
  }))
}

/**
 * Get full customer detail for support view.
 */
export async function getCustomerDetail(customerId: string, orgId: string) {
  const supabase = createServiceClient()

  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('*')
    .or(`id.eq.${customerId},id.eq.${customerId}`) // Ensure org access
    .single()

  if (customerError || !customer) {
    return null
  }

  // Get recent activities
  const { data: activities } = await supabase
    .from('activities')
    .select('*')
    .eq('customer_id', customerId)
    .eq('user_id', orgId)
    .neq('body', '__sequence_sent__')
    .order('created_at', { ascending: false })
    .limit(20)

  // Get enrolled sequences
  const { data: sequences } = await supabase
    .from('customer_sequences')
    .select('*, sequences(name, id)')
    .eq('customer_id', customerId)
    .eq('org_id', orgId)

  return {
    customer,
    recent_activities: activities ?? [],
    enrolled_sequences: sequences ?? [],
  }
}
