import type { SupabaseClient } from '@supabase/supabase-js'

/** Vehicle row for ownership checks (RLS also enforces org). */
export async function getVehicle(
  supabase: SupabaseClient,
  orgId: string,
  vehicleId: string,
) {
  return supabase
    .from('vehicles')
    .select('id, user_id, year, make, model, trim, price, mileage, vin, status')
    .eq('id', vehicleId)
    .eq('user_id', orgId)
    .maybeSingle()
}

/** Customer documents for a customer in this org (customers.user_id = org id). */
export async function getCustomerDocuments(
  supabase: SupabaseClient,
  orgId: string,
  customerId: string,
) {
  const { data: cust, error: custErr } = await supabase
    .from('customers')
    .select('id')
    .eq('id', customerId)
    .eq('user_id', orgId)
    .maybeSingle()

  if (custErr || !cust) {
    return { data: null, error: custErr }
  }

  return supabase
    .from('customer_documents')
    .select('id, name, storage_path, created_at')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
}

export async function getCustomerById(
  supabase: SupabaseClient,
  orgId: string,
  customerId: string,
) {
  return supabase
    .from('customers')
    .select('id, name, primary_phone, user_id')
    .eq('id', customerId)
    .eq('user_id', orgId)
    .maybeSingle()
}

export async function getBhphContractForOrg(
  supabase: SupabaseClient,
  orgId: string,
  contractId: string,
) {
  return supabase
    .from('bhph_payments')
    .select('id, customer_id, vehicle_id, status, monthly_payment, next_due_date')
    .eq('id', contractId)
    .eq('user_id', orgId)
    .maybeSingle()
}
