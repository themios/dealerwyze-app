/** Multi-location UI gates (Phase 6–7 visibility rules). */
export function isMultiLocationFromCount(activeLocationCount: number): boolean {
  return activeLocationCount >= 2
}

export function shouldShowCustomerLocationUi(activeLocationCount: number): boolean {
  return isMultiLocationFromCount(activeLocationCount)
}

export function needsLeadLocationBlock(
  isMultiLocation: boolean,
  locationId: string | null | undefined,
): boolean {
  return isMultiLocation && !locationId
}

export function isLocationWorkflowBlocked(
  isMultiLocation: boolean,
  locationId: string | null | undefined,
): boolean {
  return needsLeadLocationBlock(isMultiLocation, locationId)
}
