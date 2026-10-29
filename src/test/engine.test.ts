import { describe, expect, it } from 'vitest'
import { aggregatePlayer, seasonPlayer, SQUAD_SIZE, STATS } from '../fpl'
import { scorePlayers } from '../scoring'
import { generateSquad, pickLineup, canAdd, presetConstraint, FORMATION_PRESETS, type Cand } from '../squad'
import { addCriterion, baseCriteria, equalWeights, removeCriterion, setWeight, totalWeight } from '../lib/weights'
import { currentGameweek } from '../fpl'
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
  it('lower-is-better stats are inverted (price defaults to lower better)', () => {
    const s = scorePlayers(players, { now_cost: 100 })
    expect(s.get(23)!).toBe(0) // most expensive
    expect(s.get(4)!).toBeGreaterThan(s.get(14)!)
    expect(Math.max(...s.values())).toBe(100)
  })
  it('direction can be flipped per criterion', () => {
    const up = scorePlayers(players, { goals_scored: 50 }, false, { goals_scored: 'up' })
    const down = scorePlayers(players, { goals_scored: 50 }, false, { goals_scored: 'down' })
    const a = players[0].id
    expect(up.get(a)! + down.get(a)!).toBeCloseTo(50)
  })
  it('combines percentage weights into a 0-100 score', () => {
    const s = scorePlayers(players, { total_points: 60, goals_scored: 40 })
    expect(s.get(14)!).toBeGreaterThan(s.get(28)!)
    expect(Math.max(...s.values())).toBeLessThanOrEqual(100)
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
  it('respects exact and max formation constraints in the lineup', () => {
    const r = run(scoreWith({ total_points: 1 }))
    if (!r.ok) throw new Error(r.error)
    for (const f of FORMATION_PRESETS) {
      const [d, m, fw] = f.split('-').map(Number)
      const l = pickLineup(r.squad, presetConstraint(f))
      expect(l.formation).toEqual([d, m, fw])
      expect(l.xi.filter((c) => c.p.pos === 2)).toHaveLength(d)
      expect(l.xi.filter((c) => c.p.pos === 3)).toHaveLength(m)
      expect(l.xi.filter((c) => c.p.pos === 4)).toHaveLength(fw)
      expect(l.xi).toHaveLength(11)
    }
    const capped = pickLineup(r.squad, { max: { 3: 3, 4: 3 } })
    expect(capped.xi.filter((c) => c.p.pos === 3).length).toBeLessThanOrEqual(3)
    expect(capped.xi.filter((c) => c.p.pos === 2).length).toBeGreaterThanOrEqual(4)
  })
  it('generator keeps 2/5/5/3 squads under a formation', () => {
    const r = generateSquad({ pool: scoreWith({ total_points: 1 }), budget: 100, locked: new Set(), excluded: new Set(), formation: presetConstraint('5-4-1') })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    for (const pos of [1, 2, 3, 4]) expect(r.squad.filter((c) => c.p.pos === pos)).toHaveLength(SQUAD_SIZE[pos])
    expect(r.squad.reduce((a, c) => a + c.p.cost, 0)).toBeLessThanOrEqual(100)
    expect(pickLineup(r.squad, presetConstraint('5-4-1')).formation).toEqual([5, 4, 1])
  })
  it('validates manual adds', () => {
    const squad = [players[4], players[5], players[6]] // three Arsenal defenders
    expect(canAdd(squad, players[7], 100)).toMatch(/club/)
    expect(canAdd(squad, players[13], 5)).toMatch(/budget/)
    expect(canAdd(squad, players[13], 100)).toBeNull()
  })
})

describe('criteria weights', () => {
  it('base criteria are equal and sum to 100', () => {
    expect(baseCriteria(true)).toEqual({ goals_scored: 20, assists: 20, total_points: 20, clean_sheets: 20, defensive_contribution: 20 })
    expect(totalWeight(baseCriteria(false))).toBe(100)
    expect('form' in baseCriteria(true)).toBe(false)
  })
  it('form is not an available criterion', () => { expect(STATS.some((s) => s.key === 'form')).toBe(false) })
  it('rescales the others proportionally and keeps the total at 100', () => {
    const w = setWeight({ a: 50, b: 30, c: 20 }, 'a', 80)
    expect(w.a).toBe(80)
    expect(totalWeight(w)).toBe(100)
    expect(w.b).toBe(12); expect(w.c).toBe(8)
  })
  it('handles zero others, single criteria and clamping', () => {
    expect(setWeight({ a: 100, b: 0 }, 'a', 40)).toEqual({ a: 40, b: 60 })
    expect(setWeight({ a: 100 }, 'a', 30)).toEqual({ a: 100 })
    expect(totalWeight(setWeight({ a: 34, b: 33, c: 33 }, 'b', 250))).toBe(100)
    expect(setWeight({ a: 50, b: 50 }, 'a', -5).a).toBe(0)
  })
  it('equalises, adds and removes while summing to 100', () => {
    expect(totalWeight(equalWeights(['a', 'b', 'c']))).toBe(100)
    const added = addCriterion({ a: 50, b: 50 }, 'c')
    expect(totalWeight(added)).toBe(100); expect(added.c).toBe(33)
    const removed = removeCriterion(added, 'c')
    expect(totalWeight(removed)).toBe(100)
    expect(removeCriterion({ a: 100 }, 'a')).toEqual({})
  })
})

describe('current gameweek', () => {
  const ev = (id: number, o: object = {}) => ({ id, name: `GW${id}`, finished: false, is_current: false, ...o })
  it('prefers is_current, then is_next, then last finished', () => {
    expect(currentGameweek([ev(1, { finished: true }), ev(2, { is_current: true }), ev(3, { is_next: true })])).toEqual({ id: 2, isNext: false })
    expect(currentGameweek([ev(1, { finished: true }), ev(2, { is_next: true })])).toEqual({ id: 2, isNext: true })
    expect(currentGameweek([ev(1, { finished: true }), ev(2, { finished: true })])).toEqual({ id: 2, isNext: false })
    expect(currentGameweek([])).toBeNull()
  })
})
