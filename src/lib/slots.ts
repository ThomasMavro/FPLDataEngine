import { POS_LABEL, SQUAD_SIZE } from '../fpl'

const POS_NOUN: Record<number, string> = { 1: 'goalkeeper', 2: 'defender', 3: 'midfielder', 4: 'forward' }
export const posNoun = (pos: number) => POS_NOUN[pos] ?? 'player'
export const posArticle = (pos: number) => `a ${posNoun(pos)}`

/** Number of empty squad slots left in a position (squad is 2/5/5/3). */
export function freeSlots(squad: { pos: number }[], pos: number): number {
  return Math.max(0, (SQUAD_SIZE[pos] ?? 0) - squad.filter((p) => p.pos === pos).length)
}

/** Message shown when a player is clicked but his position is full, or null if a slot is free. */
export function noSlotMessage(squad: { pos: number }[], pos: number): string | null {
  return freeSlots(squad, pos) > 0 ? null : `No free ${POS_LABEL[pos]} slot — remove ${posArticle(pos)} first`
}

/** Banner text while choosing a player for an empty slot. */
export const pickBanner = (pos: number) => `Choose ${posArticle(pos)} for your squad`

/** Rank (1 = best) of value `v` among `values` (higher is better), with the group size. */
export function rankOf(v: number, values: number[]): { rank: number; of: number } {
  return { rank: 1 + values.filter((x) => x > v).length, of: values.length }
}

