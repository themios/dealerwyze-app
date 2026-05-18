'use client'

import { useState, useEffect, useMemo } from 'react'
import type { Customer, Vehicle } from '@/types'
import { useOrgSettings } from '@/hooks/useOrgSettings'

/**
 * Location-aware template variables for a lead (SMS/email compose).
 * Falls back to org settings until per-customer vars load.
 */
export function useLeadTemplateVars(customer: Customer, vehicle?: Vehicle): Record<string, string> {
  const orgSettings = useOrgSettings()
  const [outboundVars, setOutboundVars] = useState<Record<string, string> | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/customers/${customer.id}/outbound-vars`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!cancelled && data?.vars) setOutboundVars(data.vars as Record<string, string>)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [customer.id])

  return useMemo(() => {
    const firstName = customer.name.split(' ')[0] || customer.name
    const baseUrl = (outboundVars?.inventory_link ?? orgSettings.dealerWebsiteUrl ?? '').replace(/\/$/, '')
    const inventoryPath = orgSettings.dealerWebsiteInventoryPath ?? '/cars-for-sale'

    let link = outboundVars?.inventory_link ?? outboundVars?.link ?? ''
    if (vehicle?.listing_url) {
      link = vehicle.listing_url.startsWith('http')
        ? vehicle.listing_url
        : baseUrl
          ? `${baseUrl}${vehicle.listing_url.startsWith('/') ? '' : '/'}${vehicle.listing_url}`
          : vehicle.listing_url
    }
    if (!link && baseUrl) {
      link = `${baseUrl}${inventoryPath.startsWith('/') ? '' : '/'}${inventoryPath}`
    }
    if (!link) link = outboundVars?.inventory_link ?? ''

    const dealerName = outboundVars?.dealerName ?? outboundVars?.business_name ?? orgSettings.dealerName
    const dealerPhone = outboundVars?.dealerPhone ?? outboundVars?.business_phone ?? orgSettings.dealerPhone

    return {
      firstName,
      first_name: firstName,
      vehicle: vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : '{vehicle}',
      price: vehicle?.price ? `$${vehicle.price.toLocaleString()}` : '{price}',
      date: '{date}',
      time: '{time}',
      document: '{document}',
      link,
      inventory_link: link,
      dealerName,
      dealerPhone,
      dealerAddress: outboundVars?.dealerAddress ?? outboundVars?.business_address ?? orgSettings.dealerAddress,
      business_name: outboundVars?.business_name ?? dealerName,
      business_phone: outboundVars?.business_phone ?? dealerPhone,
      business_address: outboundVars?.business_address ?? orgSettings.dealerAddress,
    }
  }, [customer.name, vehicle, orgSettings, outboundVars])
}
