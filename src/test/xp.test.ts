import { describe, expect, it } from 'vitest'
import { seasonPlayer, type Fixture, type Player, type Team } from '../fpl'
import { buildContext, clampN, expectedMinutes, fixtureXp, fixturesByTeam, playerXp, sumXp, upcomingGws } from '../lib/xp'
import { elements } from './fixture'

const mk = (id: number, atk: number, def: number): Team => ({
  id, name: `T${id}`, short_name: `T${id}`, code: id,
  strength_attack_home: atk, strength_attack_away: atk, strength_defence_home: def, strength_defence_away: def,
})
const teams = [mk(1, 1200, 1200), mk(2, 1000, 1000), mk(3, 1400, 1400)] // 2 weak, 3 strong
const base = (pos: number, over: Record<string, number> = {}): Player => {
  const p = seasonPlayer({ ...elements.find((e) => e.element_type === pos)!, team: 1 })
  p.chance = null; p.starts = 10
  p.stats = { ...p.stats, minutes: 900, starts: 10, expected_goals_per_90: 0.4, expected_assists_per_90: 0.2, expected_goals_conceded_per_90: 1, saves_per_90: 3, bonus: 10, defensive_contribution_per_90: 0, ...over }
  return p
}
const ctx = (ps: Player[] = []) => buildContext(teams, ps, false)

describe('expectedMinutes', () => {
  it('uses last 5 GWs of history when loaded', () => {
    const rows = [1, 2, 3, 4, 5, 6].map((r) => ({ round: r, was_home: true, minutes: r === 1 ? 0 : 90 }))
    expect(expectedMinutes(base(3), rows)).toBe(90)
    expect(expectedMinutes(base(3), [{ round: 1, was_home: true, minutes: 90 }, { round: 2, was_home: true, minutes: 0 }])).toBe(45)
  })
  it('falls back to season minutes per start and scales by chance (null = 100)', () => {
    const p = base(3); p.starts = 10
    expect(expectedMinutes(p)).toBe(90)
    p.chance = 50
    expect(expectedMinutes(p)).toBe(45)
    p.chance = 0
    expect(expectedMinutes(p)).toBe(0)
  })
})

describe('fixtureXp', () => {
  const fx = (opp: number) => ({ gw: 1, opp, home: true })
  it('gives 2 appearance points for a nailed starter and 0 for no minutes', () => {
    expect(fixtureXp(base(3), 90, fx(2), ctx()).appearance).toBe(2)
    expect(fixtureXp(base(3), 0, fx(2), ctx()).total).toBeCloseTo(0)
  })
  it('scales attacking terms by opponent defence', () => {
    const weak = fixtureXp(base(4), 90, fx(2), ctx()), strong = fixtureXp(base(4), 90, fx(3), ctx())
    expect(weak.goals).toBeGreaterThan(strong.goals)
    expect(weak.goals / strong.goals).toBeCloseTo(1400 / 1000)
  })
  it('uses exp(-lambda) clean sheet probability with opponent attack', () => {
    const p = base(2)
    const c = buildContext(teams, [{ ...base(1), team: 1, stats: { ...base(1).stats, expected_goals_conceded: 9, minutes: 900 } }], false)
    // team xGC90 = 0.9; opp attack 1000 vs mean 1200 -> lambda = 0.9*1000/1200
    const x = fixtureXp(p, 90, fx(2), c)
    expect(x.cleanSheet).toBeCloseTo(Math.exp(-0.75) * 4)
    expect(x.goalsConceded).toBeCloseTo(-0.5 * 0.75)
  })
  it('awards clean sheet points per position: GK/DEF 4, MID 1, FWD 0', () => {
    expect(fixtureXp(base(3), 90, fx(2), ctx()).cleanSheet).toBeCloseTo(fixtureXp(base(2), 90, fx(2), ctx()).cleanSheet / 4)
    expect(fixtureXp(base(4), 90, fx(2), ctx()).cleanSheet).toBe(0)
  })
  it('only goalkeepers earn save points; goal points differ by position', () => {
    expect(fixtureXp(base(1), 90, fx(2), ctx()).saves).toBeGreaterThan(0)
    expect(fixtureXp(base(2), 90, fx(2), ctx()).saves).toBe(0)
    const d = fixtureXp(base(2), 90, fx(2), ctx()).goals, f = fixtureXp(base(4), 90, fx(2), ctx()).goals
    expect(d / f).toBeCloseTo(6 / 4)
  })
  it('adds defensive contribution only when the field exists', () => {
    const p = base(2, { defensive_contribution_per_90: 12 })
    expect(fixtureXp(p, 90, fx(2), ctx()).defCon).toBe(0)
    const x = fixtureXp(p, 90, fx(2), buildContext(teams, [], true)).defCon
    expect(x).toBeGreaterThan(1) // above threshold 10 -> logistic > 0.5
  })
})

describe('gameweek aggregation', () => {
  const fixtures: Fixture[] = [
    { id: 1, event: 10, team_h: 1, team_a: 2, finished: false },
    { id: 2, event: 11, team_h: 3, team_a: 2, finished: false },
    { id: 3, event: 12, team_h: 1, team_a: 3, finished: false },
    { id: 4, event: 12, team_h: 2, team_a: 1, finished: false },
    { id: 5, event: null, team_h: 1, team_a: 2, finished: false },
  ]
  const events = [9, 10, 11, 12, 13].map((id) => ({ id, finished: id < 10 }))
  it('picks the next N unfinished GWs and clamps N to 1-8', () => {
    expect(upcomingGws(events, 3)).toEqual([10, 11, 12])
    expect(clampN(0)).toBe(1); expect(clampN(99)).toBe(8); expect(clampN(NaN)).toBe(5)
  })
  it('blank GW gives 0 and double GW sums both fixtures', () => {
    const gws = [10, 11, 12]
    const byTeam = fixturesByTeam(fixtures, gws)
    const out = playerXp(base(3), gws, byTeam.get(1), ctx())
    expect(out[0].total).toBeGreaterThan(0)
    expect(out[1].total).toBe(0) // team 1 blank in GW11
    expect(out[2].fixtures).toHaveLength(2)
    const single = fixtureXp(base(3), 90, { gw: 12, opp: 3, home: true }, ctx()).total + fixtureXp(base(3), 90, { gw: 12, opp: 2, home: false }, ctx()).total
    expect(out[2].total).toBeCloseTo(single)
    expect(sumXp(out)).toBeCloseTo(out[0].total + out[2].total)
  })
})
