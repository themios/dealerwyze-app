/**
 * Bulk operations helper for admin actions.
 * Processes batch updates with partial failure support and audit logging.
 */

import { createServiceClient } from '@/lib/supabase/service'
import { writeAuditLog } from '@/lib/audit/log'

export interface BulkResult<T = unknown> {
  succeeded: number
  failed: number
  details: Array<{
    id: string
    success: boolean
    message?: string
    data?: T
  }>
}

/**
 * Bulk change org status (activate, suspend, deactivate).
 */
export async function bulkChangeOrgStatus(
  orgIds: string[],
  newStatus: 'active' | 'suspended' | 'deactivated',
  actorId: string,
  ipAddress: string | null
): Promise<BulkResult> {
  const supabase = createServiceClient()
  const details: BulkResult['details'] = []
  let succeeded = 0
  let failed = 0

  for (const orgId of orgIds) {
    try {
      const { error } = await supabase
        .from('organizations')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', orgId)

      if (error) {
        details.push({ id: orgId, success: false, message: error.message })
        failed++
      } else {
        details.push({ id: orgId, success: true })
        succeeded++

        await writeAuditLog({
          orgId: orgId,
          actorId: actorId,
          actorType: 'staff',
          action: 'org_status_changed',
          metadata: { new_status: newStatus },
          ipAddress: ipAddress,
        })
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e)
      details.push({ id: orgId, success: false, message: err.slice(0, 200) })
      failed++
    }
  }

  // Log bulk action
  await writeAuditLog({
    orgId: null,
    actorId: actorId,
    actorType: 'staff',
    action: 'bulk_org_status_changed',
    metadata: { new_status: newStatus, total: orgIds.length, succeeded, failed },
    ipAddress: ipAddress,
  })

  return { succeeded, failed, details }
}

/**
 * Bulk send SMS to customers (via sequence or direct message).
 */
export async function bulkSendSms(
  orgId: string,
  customerIds: string[],
  messageBody: string,
  actorId: string,
  ipAddress: string | null
): Promise<BulkResult> {
  const supabase = createServiceClient()
  const details: BulkResult['details'] = []
  let succeeded = 0
  let failed = 0

  for (const customerId of customerIds) {
    try {
      // Get customer phone
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('id, primary_phone')
        .eq('id', customerId)
        .single()

      if (customerError || !customer?.primary_phone) {
        details.push({
          id: customerId,
          success: false,
          message: 'No phone number',
        })
        failed++
        continue
      }

      // In production, this would call Twilio SMS API
      // For now, we log the intent
      details.push({ id: customerId, success: true })
      succeeded++

      await writeAuditLog({
        orgId: orgId,
        actorId: actorId,
        actorType: 'staff',
        action: 'bulk_sms_sent',
        entityType: 'customer',
        entityId: customerId,
        metadata: { phone: customer.primary_phone.slice(-4) }, // Log last 4 digits only
        ipAddress: ipAddress,
      })
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e)
      details.push({ id: customerId, success: false, message: err.slice(0, 200) })
      failed++
    }
  }

  // Log bulk action
  await writeAuditLog({
    orgId: orgId,
    actorId: actorId,
    actorType: 'staff',
    action: 'bulk_sms_sent',
    metadata: { total: customerIds.length, succeeded, failed, preview: messageBody.slice(0, 50) },
    ipAddress: ipAddress,
  })

  return { succeeded, failed, details }
}

/**
 * Bulk send email to customers (via template).
 */
export async function bulkSendEmail(
  orgId: string,
  customerIds: string[],
  templateId: string,
  actorId: string,
  ipAddress: string | null
): Promise<BulkResult> {
  const supabase = createServiceClient()
  const details: BulkResult['details'] = []
  let succeeded = 0
  let failed = 0

  for (const customerId of customerIds) {
    try {
      // Get customer email
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('id, email')
        .eq('id', customerId)
        .single()

      if (customerError || !customer?.email) {
        details.push({
          id: customerId,
          success: false,
          message: 'No email address',
        })
        failed++
        continue
      }

      // In production, this would call Resend or email service
      // For now, we log the intent
      details.push({ id: customerId, success: true })
      succeeded++

      await writeAuditLog({
        orgId: orgId,
        actorId: actorId,
        actorType: 'staff',
        action: 'bulk_email_sent',
        entityType: 'customer',
        entityId: customerId,
        metadata: { email: customer.email },
        ipAddress: ipAddress,
      })
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e)
      details.push({ id: customerId, success: false, message: err.slice(0, 200) })
      failed++
    }
  }

  // Log bulk action
  await writeAuditLog({
    orgId: orgId,
    actorId: actorId,
    actorType: 'staff',
    action: 'bulk_email_sent',
    metadata: { total: customerIds.length, succeeded, failed, template_id: templateId },
    ipAddress: ipAddress,
  })

  return { succeeded, failed, details }
}

/**
 * Bulk update user permissions (change role).
 */
export async function bulkChangeUserRoles(
  orgId: string,
  userIds: string[],
  newRole: 'agent' | 'admin' | 'dealer_admin',
  actorId: string,
  ipAddress: string | null
): Promise<BulkResult> {
  const supabase = createServiceClient()
  const details: BulkResult['details'] = []
  let succeeded = 0
  let failed = 0

  for (const userId of userIds) {
    try {
      const { data: profile, error: getError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .eq('org_id', orgId)
        .single()

      if (getError) {
        details.push({ id: userId, success: false, message: 'User not found' })
        failed++
        continue
      }

      const oldRole = profile.role

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', userId)
        .eq('org_id', orgId)

      if (updateError) {
        details.push({ id: userId, success: false, message: updateError.message })
        failed++
      } else {
        details.push({ id: userId, success: true })
        succeeded++

        await writeAuditLog({
          orgId: orgId,
          actorId: actorId,
          actorType: 'staff',
          action: 'role_changed',
          entityType: 'profile',
          entityId: userId,
          metadata: { from_role: oldRole, to_role: newRole },
          ipAddress: ipAddress,
        })
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e)
      details.push({ id: userId, success: false, message: err.slice(0, 200) })
      failed++
    }
  }

  // Log bulk action
  await writeAuditLog({
    orgId: orgId,
    actorId: actorId,
    actorType: 'staff',
    action: 'bulk_role_changed',
    metadata: { new_role: newRole, total: userIds.length, succeeded, failed },
    ipAddress: ipAddress,
  })

  return { succeeded, failed, details }
}
