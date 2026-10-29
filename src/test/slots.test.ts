import { describe, expect, it } from 'vitest'
import { freeSlots, noSlotMessage, pickBanner, rankOf } from '../lib/slots'

const sq = (...pos: number[]) => pos.map((p) => ({ pos: p }))
describe('slots', () => {
  it('counts free slots', () => {
    expect(freeSlots(sq(2, 2, 3), 2)).toBe(3)
    expect(freeSlots(sq(2, 2, 2, 2, 2), 2)).toBe(0)
    expect(freeSlots([], 1)).toBe(2)
  })
  it('explains a full position', () => {
    expect(noSlotMessage(sq(2, 2, 2, 2, 2), 2)).toBe('No free DEF slot — remove a defender first')
    expect(noSlotMessage(sq(2), 2)).toBeNull()
  })
  it('banner text', () => { expect(pickBanner(2)).toBe('Choose a defender for your squad') })
  it('ranks within a group', () => {
    expect(rankOf(5, [9, 5, 1, 5])).toEqual({ rank: 2, of: 4 })
  })
})
