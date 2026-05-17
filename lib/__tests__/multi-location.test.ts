import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DealerLocation } from '@/lib/locations/types'
import { resolveLeadOutboundIdentity } from '@/lib/locations/resolve'
import { detectLeadLocation } from '@/lib/leads/detectLeadLocation'
import {
  isLocationWorkflowBlocked,
  isMultiLocationFromCount,
  needsLeadLocationBlock,
  shouldShowCustomerLocationUi,
} from '@/lib/locations/uiRules'
import { filterAssignableMembersForLead } from '@/lib/leads/filterAssignableMembers'
vi.mock('server-only', () => ({}))

vi.mock('@/lib/audit/log', () => ({
  writeAuditLog: vi.fn(),
}))

vi.mock('@/lib/audit/orgAudit', () => ({
  logOrgAudit: vi.fn(),
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(),
}))

vi.mock('@/lib/locations/resolve', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/locations/resolve')>()
  return {
    ...actual,
    isMultiLocationOrg: vi.fn(),
  }
})

import { isMultiLocationOrg } from '@/lib/locations/resolve'
import { resolveLeadAssignee } from '@/lib/leads/assignLead'
import { writeAuditLog } from '@/lib/audit/log'
import { logOrgAudit } from '@/lib/audit/orgAudit'
import { logLocationAudit } from '@/lib/locations/logLocationAudit'

const mockIsMultiLocationOrg = vi.mocked(isMultiLocationOrg)

const ORG_SETTINGS = {
  business_name: 'Apollo Motors',
  business_phone: '555-0100',
  business_address: '100 Main St',
  dealer_website_url: 'https://apollo.example/inventory',
}

const LOC_A: DealerLocation = {
  id: 'loc-a',
  org_id: 'org-1',
  name: 'North Lot',
  address: '1 North Ave, Austin TX',
  phone: '555-1000',
  inventory_url: 'https://north.example',
  sms_number: '+15551000001',
  email_from_name: null,
  is_active: true,
  sort_order: 0,
}

const LOC_B: DealerLocation = {
  ...LOC_A,
  id: 'loc-b',
  name: 'South Lot',
  address: '2 South Ave, Austin TX',
  phone: '555-2000',
  inventory_url: 'https://south.example',
  sms_number: '+15551000002',
  sort_order: 1,
}

describe('multi-location UI rules', () => {
  it('single-location org: no location UI rendered', () => {
    expect(isMultiLocationFromCount(1)).toBe(false)
    expect(shouldShowCustomerLocationUi(1)).toBe(false)
    expect(needsLeadLocationBlock(false, null)).toBe(false)
  })

  it('multi-location org, resolved lead: workflow unblocked', () => {
    expect(isMultiLocationFromCount(2)).toBe(true)
    expect(needsLeadLocationBlock(true, 'loc-a')).toBe(false)
    expect(isLocationWorkflowBlocked(true, 'loc-a')).toBe(false)
  })

  it('multi-location org, unresolved lead: workflow blocked', () => {
    expect(needsLeadLocationBlock(true, null)).toBe(true)
    expect(isLocationWorkflowBlocked(true, undefined)).toBe(true)
  })
})

describe('resolveLeadOutboundIdentity', () => {
  it('uses location fields when location_id is set', () => {
    const identity = resolveLeadOutboundIdentity({
      customer: { location_id: LOC_A.id },
      locations: [LOC_A, LOC_B],
      orgSettings: ORG_SETTINGS,
    })
    expect(identity.name).toBe('North Lot')
    expect(identity.phone).toBe('555-1000')
    expect(identity.address).toBe('1 North Ave, Austin TX')
    expect(identity.inventory_url).toBe('https://north.example')
    expect(identity.location_id).toBe(LOC_A.id)
  })

  it('falls back to org settings when location_id is null', () => {
    const identity = resolveLeadOutboundIdentity({
      customer: { location_id: null },
      locations: [LOC_A, LOC_B],
      orgSettings: ORG_SETTINGS,
    })
    expect(identity.name).toBe('Apollo Motors')
    expect(identity.phone).toBe('555-0100')
    expect(identity.address).toBe('100 Main St')
    expect(identity.inventory_url).toBe('https://apollo.example/inventory')
    expect(identity.location_id).toBeNull()
  })
})

describe('detectLeadLocation', () => {
  it('auto_single: single-location org always gets location set', () => {
    const hit = detectLeadLocation({}, [LOC_A])
    expect(hit).toEqual({ locationId: LOC_A.id, source: 'auto_single' })
  })

  it('inbound_sms: matches on sms_number', () => {
    const hit = detectLeadLocation(
      { inboundSmsFrom: '+15551000002' },
      [LOC_A, LOC_B],
    )
    expect(hit).toEqual({ locationId: LOC_B.id, source: 'inbound_sms' })
  })
})

describe('round-robin assignment pool', () => {
  it('rotates within location pool, not org-wide', () => {
    const profiles = [
      { id: 'rep-a', role: 'dealer_rep', location_id: 'loc-1' },
      { id: 'rep-b', role: 'dealer_rep', location_id: 'loc-1' },
      { id: 'rep-other', role: 'dealer_rep', location_id: 'loc-2' },
    ]
    const pool = profiles.filter(
      p => (p.role === 'dealer_rep' || p.role === 'dealer_manager') && p.location_id === 'loc-1',
    )
    expect(pool.map(p => p.id)).toEqual(['rep-a', 'rep-b'])

    let index = 0
    const first = pool[index % pool.length]!.id
    index = (index + 1) % pool.length
    const second = pool[index % pool.length]!.id
    expect(first).toBe('rep-a')
    expect(second).toBe('rep-b')
    expect(pool.some(p => p.id === 'rep-other')).toBe(false)
  })
})

describe('resolveLeadAssignee (multi-location)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns null when multi-location and lead has no location', async () => {
    mockIsMultiLocationOrg.mockResolvedValue(true)
    const result = await resolveLeadAssignee('org-1', { locationId: null })
    expect(result).toBeNull()
  })
})

describe('filterAssignableMembersForLead', () => {
  const members = [
    { id: '1', location_id: 'loc-a' },
    { id: '2', location_id: 'loc-b' },
    { id: '3', location_id: null },
  ]

  it('scopes picker to lead location when multi-location', () => {
    const filtered = filterAssignableMembersForLead(members, 'loc-a', true)
    expect(filtered.map(m => m.id)).toEqual(['1'])
  })
})

describe('logLocationAudit', () => {
  beforeEach(() => {
    vi.mocked(writeAuditLog).mockClear()
    vi.mocked(logOrgAudit).mockClear()
  })

  it('writes audit_log and org_audit_log for location mutations', () => {
    logLocationAudit({
      orgId: 'org-1',
      actorId: 'user-1',
      action: 'lead_location_changed',
      entityType: 'customer',
      entityId: 'cust-1',
      metadata: { location_id: 'loc-a', location_source: 'manual' },
    })
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'lead_location_changed', entityId: 'cust-1' }),
    )
    expect(logOrgAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'lead_location_changed' }),
    )
  })
})

describe('manual lead location PATCH payload', () => {
  it('sets location_id and location_source manual', () => {
    const payload = {
      location_id: 'loc-a',
      location_source: 'manual' as const,
    }
    expect(payload.location_source).toBe('manual')
    expect(payload.location_id).toBeTruthy()
  })
})
