/** Distinguish a visit with confirmed zero vehicles from an unconfirmed checklist. */
export function vehicleChecklistResolved(
  enabled: boolean,
  attendedIds: string[] | null | undefined,
  draftIds?: string[] | null,
): boolean {
  if (!enabled) return true
  if (attendedIds == null) return false
  if (draftIds == null) return true
  if (draftIds.length !== attendedIds.length) return false
  const attended = new Set(attendedIds)
  return draftIds.every(id => attended.has(id))
}
