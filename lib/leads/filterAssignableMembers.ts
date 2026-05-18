/** Client-safe helper for location-scoped manual assignment pickers (Phase 4). */
export function filterAssignableMembersForLead<T extends { location_id?: string | null }>(
  members: T[],
  leadLocationId: string | null | undefined,
  isMultiLocation: boolean,
): T[] {
  if (!isMultiLocation || !leadLocationId) return members
  return members.filter(m => m.location_id === leadLocationId)
}
