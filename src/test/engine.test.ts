import { describe, expect, it } from 'vitest'
import { aggregatePlayer, seasonPlayer, SQUAD_SIZE, STATS } from '../fpl'
import { scorePlayers } from '../scoring'
import { generateSquad, pickLineup, canAdd, type Cand } from '../squad'
import { elements, history } from './fixture'

const players = elements.map(seasonPlayer)
const scoreWith = (w: Record<string, number>, perPos = false) => {
  const s = scorePlayers(players, w, perPos)
  return players.map((p): Cand => ({ p, score: s.get(p.id)! }))
}

describe('player stats', () => {
  it('converts price and computes value', () => {
    const p = players.find((x) => x.id === 14)!
    expect(p.cost).toBe(13)
    expect(p.stats.value).toBeCloseTo(150 / 13)
  })
  it('includes the required stat keys', () => {
    for (const k of ['total_points', 'value', 'expected_goals_per_90', 'transfers_in_event']) expect(STATS.some((s) => s.key === k)).toBe(true)
  })
  it('aggregates history rows', () => {
    const a = aggregatePlayer(players[0], history)
    expect(a.stats.total_points).toBe(12)
    expect(a.stats.minutes).toBe(180)
    expect(a.stats.points_per_game).toBe(6)
    expect(a.stats.expected_goals_per_90).toBeCloseTo(0.9)
  })
})

describe('scoring', () => {
  it('min-max normalises and weights', () => {
    const s = scorePlayers(players, { total_points: 1 })
    expect(s.get(14)).toBe(1) // top scorer
    expect(s.get(28)).toBe(0) // lowest
  })
  it('negative weights penalise', () => {
    const s = scorePlayers(players, { now_cost: -1 })
    expect(s.get(23)!).toBeLessThan(s.get(4)!)
  })
  it('can normalise per position', () => {
    const s = scorePlayers(players, { total_points: 1 }, true)
    expect(s.get(1)).toBe(1) // best keeper is 1.0 within GKPs
  })
})

describe('squad generator', () => {
  const run = (cands: Cand[], budget = 100, locked: number[] = [], excluded: number[] = []) =>
    generateSquad({ pool: cands, budget, locked: new Set(locked), excluded: new Set(excluded) })

  it('builds a legal squad', () => {
    const r = run(scoreWith({ total_points: 1 }))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.squad).toHaveLength(15)
    for (const pos of [1, 2, 3, 4]) expect(r.squad.filter((c) => c.p.pos === pos)).toHaveLength(SQUAD_SIZE[pos])
    expect(r.squad.reduce((a, c) => a + c.p.cost, 0)).toBeLessThanOrEqual(100)
    const counts = new Map<number, number>()
    r.squad.forEach((c) => counts.set(c.p.team, (counts.get(c.p.team) ?? 0) + 1))
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(3)
  })
  it('respects a tight budget', () => {
    const r = run(scoreWith({ total_points: 1 }), 72)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.squad.reduce((a, c) => a + c.p.cost, 0)).toBeLessThanOrEqual(72)
  })
  it('fails clearly when the budget is impossible', () => {
    expect(run(scoreWith({ total_points: 1 }), 10).ok).toBe(false)
  })
  it('keeps locked and drops excluded players', () => {
    const r = run(scoreWith({ total_points: 1 }), 100, [28], [14])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    const ids = r.squad.map((c) => c.p.id)
    expect(ids).toContain(28)
    expect(ids).not.toContain(14)
  })
  it('picks a valid XI and captain', () => {
    const r = run(scoreWith({ total_points: 1 }))
    if (!r.ok) throw new Error(r.error)
    const l = pickLineup(r.squad)
    expect(l.xi).toHaveLength(11)
    expect(l.bench).toHaveLength(4)
    expect(l.xi.filter((c) => c.p.pos === 1)).toHaveLength(1)
    expect(l.xi.filter((c) => c.p.pos === 2).length).toBeGreaterThanOrEqual(3)
    expect(l.captain!.score).toBe(Math.max(...l.xi.map((c) => c.score)))
  })
  it('validates manual adds', () => {
    const squad = [players[4], players[5], players[6]] // three Arsenal defenders
    expect(canAdd(squad, players[7], 100)).toMatch(/club/)
    expect(canAdd(squad, players[13], 5)).toMatch(/budget/)
    expect(canAdd(squad, players[13], 100)).toBeNull()
  })
})
