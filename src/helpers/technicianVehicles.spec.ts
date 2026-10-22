import { describe, expect, it } from 'vitest'
import { vehicleChecklistResolved } from './technicianVehicles'

describe('vehicleChecklistResolved', () => {
  it('does not require vehicles in residential or reinforcement visits', () => {
    expect(vehicleChecklistResolved(false, null)).toBe(true)
  })
  it('does not confuse unconfirmed and explicitly confirmed zero vehicles', () => {
    expect(vehicleChecklistResolved(true, null)).toBe(false)
    expect(vehicleChecklistResolved(true, [])).toBe(true)
  })
  it('keeps a confirmed selection resolved after reloading a server package without a local draft', () => {
    expect(vehicleChecklistResolved(true, ['one'], undefined)).toBe(true)
    expect(vehicleChecklistResolved(true, ['one', 'two'], ['two', 'one'])).toBe(true)
  })
  it('requires confirmation of changes made after a previous selection', () => {
    expect(vehicleChecklistResolved(true, ['one'], ['one', 'two'])).toBe(false)
    expect(vehicleChecklistResolved(true, ['one', 'two'], ['one'])).toBe(false)
  })
})
