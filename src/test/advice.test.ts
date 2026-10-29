import { describe, expect, it } from 'vitest'
import type { Fixture, Player } from '../fpl'
import { benchSwaps, buildAdvice, generalSummary, recommendationSummary, rivalOwnership, captainPicks, effectiveOwnership, eoLabel, fixtureSwings, flags, miniLeagueScore, transferSuggestions, type AdviceInput } from '../lib/advice'
import type { GwXp } from '../lib/xp'

const pl = (id: number, pos: number, team: number, cost: number, over: Partial<Player> = {}): Player => ({
  id, name: `P${id}`, team, pos, cost, status: 'a', news: '', chance: null, starts: 10, stats: {}, ...over,
})
const gx = (...totals: number[]): GwXp[] => totals.map((total, i) => ({ gw: i + 1, total, parts: {} as never, fixtures: [] }))

// 2 GKP, 5 DEF, 5 MID, 3 FWD; teams 1..5
const squad: Player[] = [
  pl(1, 1, 1, 5), pl(2, 1, 2, 4),
  pl(3, 2, 1, 5), pl(4, 2, 2, 5), pl(5, 2, 3, 5), pl(6, 2, 4, 4.5), pl(7, 2, 5, 4),
  pl(8, 3, 1, 8), pl(9, 3, 2, 7), pl(10, 3, 3, 6), pl(11, 3, 4, 5), pl(12, 3, 5, 5),
  pl(13, 4, 6, 9), pl(14, 4, 5, 7), pl(15, 4, 3, 5),
]
const xpMap = (extra: Record<number, GwXp[]> = {}) => {
  const m = new Map<number, GwXp[]>()
  for (const p of squad) m.set(p.id, gx(3, 3))
  for (const [k, v] of Object.entries(extra)) m.set(Number(k), v)
  return m
}
const input = (over: Partial<AdviceInput> = {}): AdviceInput => ({
  squad, pool: [...squad], budget: 100, xp: xpMap(), xiIds: [1, 3, 4, 5, 6, 8, 9, 10, 11, 13, 14], fixtures: [], gws: [3, 4], ...over,
})

describe('transferSuggestions', () => {
  it('finds the best swap and respects position, budget and club cap', () => {
    const squadCost = squad.reduce((a, p) => a + p.cost, 0)
    const star = pl(100, 3, 7, 9) // +1.0m over p8 (8) -> needs bank
    const cheap = pl(101, 3, 7, 6)
    const wrongPos = pl(102, 2, 7, 5)
    const pool = [...squad, star, cheap, wrongPos]
    const xp = xpMap({ 8: gx(1, 1), 100: gx(6, 6), 101: gx(5, 5), 102: gx(5, 5) })
    const tight = transferSuggestions(input({ pool, xp, budget: squadCost })) // bank 0: star unaffordable for p8, fine for p9?
    const best = tight.one[0]
    expect(best.swaps[0].out.pos).toBe(best.swaps[0].inn.pos)
    expect(best.bankAfter).toBeGreaterThanOrEqual(0)
    const roomy = transferSuggestions(input({ pool, xp, budget: squadCost + 5 }))
    expect(roomy.one[0].swaps[0].inn.id).toBe(100)
    expect(roomy.one[0].swaps[0].out.id).toBe(8)
    expect(roomy.one[0].gain).toBeCloseTo(10)
    expect(roomy.one[0].hitWorth).toBe(true)
    expect(roomy.one[0].costChange).toBeCloseTo(1)
  })
  it('never exceeds 3 per club', () => {
    const s = [pl(1, 3, 1, 5), pl(2, 3, 1, 5), pl(3, 3, 1, 5), pl(4, 3, 2, 5)]
    const a = pl(10, 3, 1, 5), b = pl(11, 3, 3, 5)
    const xp = new Map<number, GwXp[]>([[1, gx(1)], [2, gx(1)], [3, gx(1)], [4, gx(1)], [10, gx(9)], [11, gx(5)]])
    const r = transferSuggestions({ squad: s, pool: [...s, a, b], budget: 20, xp, xiIds: [], fixtures: [], gws: [1] })
    // swapping p4 (club 2) for a (club 1) would make 4 from club 1; swapping a club-1 player for a is fine
    for (const plan of r.one) {
      const clubs = new Map<number, number>()
      const after = s.filter((p) => !plan.swaps.some((x) => x.out.id === p.id)).concat(plan.swaps.map((x) => x.inn))
      for (const p of after) clubs.set(p.team, (clubs.get(p.team) ?? 0) + 1)
      expect(Math.max(...clubs.values())).toBeLessThanOrEqual(3)
    }
    expect(r.one.find((x) => x.swaps[0].out.id === 4 && x.swaps[0].inn.id === 10)).toBeUndefined()
  })
  it('two-transfer plans use distinct players and sum gains', () => {
    const i1 = pl(100, 3, 7, 8), i2 = pl(101, 4, 8, 9)
    const xp = xpMap({ 8: gx(1), 13: gx(1), 100: gx(9, 9), 101: gx(10, 10) })
    const r = transferSuggestions(input({ pool: [...squad, i1, i2], xp, budget: 110 }))
    const top = r.two[0]
    expect(top.swaps).toHaveLength(2)
    expect(new Set(top.swaps.map((s) => s.inn.id)).size).toBe(2)
    expect(top.gain).toBeGreaterThan(r.one[0].gain)
  })
  it('skips flagged and unavailable targets', () => {
    const inj = pl(100, 3, 7, 8, { status: 'i', chance: 0 }), dbt = pl(101, 3, 7, 8, { chance: 50 })
    const xp = xpMap({ 100: gx(20, 20), 101: gx(20, 20) })
    const r = transferSuggestions(input({ pool: [...squad, inj, dbt], xp }))
    expect(r.one.every((p) => p.swaps[0].inn.id !== 100 && p.swaps[0].inn.id !== 101)).toBe(true)
  })
})

describe('mini-league', () => {
  const rivals = [{ ids: [1, 2, 3], captain: 3 }, { ids: [1, 4], captain: 1 }]
  it('computes effective ownership with captains counted twice', () => {
    const eo = effectiveOwnership(rivals)
    expect(eo.get(1)).toBe(1.5) // owned by both + captained once
    expect(eo.get(3)).toBe(1)
    expect(eo.get(4)).toBe(0.5)
    expect(eo.get(99)).toBeUndefined()
    expect(effectiveOwnership([]).size).toBe(0)
  })
  it('labels differential / cover / neutral', () => {
    expect(eoLabel(0.1)).toBe('differential'); expect(eoLabel(0.3)).toBe('neutral'); expect(eoLabel(0.5)).toBe('cover')
  })
  it('scores by strategy', () => {
    expect(miniLeagueScore(10, 0.8, 'chasing')).toBeCloseTo(2)
    expect(miniLeagueScore(10, 0.8, 'protecting')).toBeCloseTo(18)
    expect(miniLeagueScore(10, 1.5, 'chasing')).toBe(0)
  })
  it('chasing prefers the differential, protecting the covered player', () => {
    const diff = pl(100, 3, 7, 8), popular = pl(101, 3, 8, 8)
    const xp = xpMap({ 8: gx(1), 100: gx(5), 101: gx(6) })
    const eo = new Map([[101, 0.9], [100, 0]])
    const pool = [...squad, diff, popular]
    const chase = transferSuggestions(input({ pool, xp, budget: 110, miniLeague: { eo, strategy: 'chasing' } }))
    const prot = transferSuggestions(input({ pool, xp, budget: 110, miniLeague: { eo, strategy: 'protecting' } }))
    expect(chase.one[0].swaps[0].inn.id).toBe(100)
    expect(prot.one[0].swaps[0].inn.id).toBe(101)
    expect(buildAdvice(input(), rivals).miniLeague).toHaveLength(15)
    expect(buildAdvice(input()).miniLeague).toBeUndefined()
  })
})

describe('captain, bench, flags', () => {
  it('top 3 starters by next-GW xP', () => {
    const xp = xpMap({ 8: gx(9, 0), 9: gx(7, 0), 10: gx(6, 0), 15: gx(20, 0) }) // 15 is on the bench
    const c = captainPicks(input({ xp }))
    expect(c.map((x) => x.player.id)).toEqual([8, 9, 10])
    expect(c.map((x) => x.role)).toEqual(['captain', 'vice', 'option'])
  })
  it('suggests bench swap only when formation stays valid', () => {
    // xi has 1 GK, 4 DEF? ids 3,4,5,6 = 4 DEF, 4 MID (8,9,10,11), 2 FWD (13,14)
    const xp = xpMap({ 12: gx(8), 11: gx(2), 7: gx(9), 2: gx(50) })
    const s = benchSwaps(input({ xp }))
    const mid = s.find((x) => x.bench.id === 12)!
    expect(mid.starter.id).toBe(11); expect(mid.gain).toBeCloseTo(6)
    expect(s.find((x) => x.bench.id === 2)!.starter.id).toBe(1) // keeper only swaps with the keeper
    expect(s.find((x) => x.bench.id === 7)!.starter.id).toBe(11) // DEF may replace a MID while 4-3-3 style limits hold
  })
  it('does not break minimum formation', () => {
    const xi = [1, 3, 4, 5, 8, 9, 10, 11, 12, 13, 14] // 3 DEF, 5 MID, 2 FWD
    const xp = xpMap({ 6: gx(9), 3: gx(1), 8: gx(1), 7: gx(9), 15: gx(9) })
    const s = benchSwaps(input({ xiIds: xi, xp }))
    const d = s.find((x) => x.bench.id === 6)!
    expect(d.starter.id).toBe(3) // DEF for DEF keeps 3 DEF; swapping a MID/FWD out would also be legal but gains less
  })
  it('flags injured, doubtful and low-minutes starters', () => {
    const s = squad.map((p) => (p.id === 3 ? { ...p, status: 'd', chance: 50, news: 'Knock' } : p.id === 4 ? { ...p, chance: 75 } : p.id === 8 ? { ...p, status: 'i', chance: 0 } : p.id === 9 ? { ...p, starts: 1, stats: { minutes: 90 } } : p))
    const f = flags(input({ squad: s, finishedGws: 10 }))
    expect(f.filter((x) => x.reason === 'injury').map((x) => x.player.id).sort()).toEqual([3, 8])
    expect(f.find((x) => x.reason === 'minutes' && x.player.id === 9)).toBeDefined()
    expect(f.find((x) => x.player.id === 4)).toBeUndefined()
  })
})

describe('fixtureSwings', () => {
  const fx = (id: number, event: number, h: number, a: number, hd: number, ad: number, finished = false): Fixture =>
    ({ id, event, team_h: h, team_a: a, finished, team_h_difficulty: hd, team_a_difficulty: ad })
  it('detects sharp worsening and ranks easiest runs', () => {
    const fixtures = [
      fx(1, 1, 1, 9, 2, 4, true), fx(2, 2, 1, 8, 2, 4, true), // team 1: easy past (2,2)
      fx(3, 3, 1, 7, 5, 2), fx(4, 4, 6, 1, 2, 5), // team 1: hard next (5,5)
      fx(5, 3, 2, 8, 2, 4), fx(6, 4, 2, 9, 2, 4), // team 2: easy
    ]
    const s = [pl(1, 1, 1, 5), pl(2, 1, 2, 5)]
    const r = fixtureSwings(input({ squad: s, fixtures, gws: [3, 4] }))
    expect(r.worsening.map((x) => x.player.id)).toEqual([1])
    expect(r.worsening[0].swing).toBeCloseTo(3)
    expect(r.easiest[0].team).toBe(2)
  })
})

describe('formation-aware bench advice', () => {
  it('rejects bench swaps that break an exact formation', () => {
    // XI is 4-4-2 (ids 3-6 DEF, 8-11 MID, 13-14 FWD); bench MID 12 would replace a FWD (3-5-1... invalid) or a DEF
    const xp = xpMap({ 12: gx(9, 9), 13: gx(1, 1), 14: gx(1, 1) })
    const free = benchSwaps(input({ xp }))
    expect(free.some((b) => b.bench.id === 12)).toBe(true)
    const exact = benchSwaps(input({ xp, formation: { max: { 2: 4, 3: 4, 4: 2 }, exact: true } }))
    expect(exact.some((b) => b.bench.id === 12 && b.starter.pos !== 3)).toBe(false)
  })
})

describe('summaries', () => {
  const squadCost = squad.reduce((a, p) => a + p.cost, 0)
  const star = pl(100, 3, 7, 8)
  const mk = (rivals: { ids: number[]; captain: number }[]) => {
    const xp = xpMap({ 8: gx(1, 1), 100: gx(4, 4), 14: gx(6, 6) })
    const inp = input({ pool: [...squad, star], xp, budget: squadCost + 1, miniLeague: { eo: effectiveOwnership(rivals), strategy: 'chasing' } })
    return buildAdvice(inp, rivals)
  }
  it('computes plain rival ownership', () => {
    expect(rivalOwnership([{ ids: [1, 2], captain: 1 }, { ids: [2], captain: 2 }], 1)).toBe(0.5)
    expect(rivalOwnership([], 1)).toBe(0)
  })
  it('general summary names the best transfer and captain', () => {
    const t = generalSummary(mk([]), 2)
    expect(t).toMatch(/P8 → P100/)
    expect(t).toMatch(/P14 is the top captain/)
  })
  it('general summary handles no useful transfer', () => {
    expect(generalSummary(buildAdvice(input()), 2)).toMatch(/No single transfer/)
  })
  it('recommendation summary reports gap, differential move and captain EO', () => {
    const rivals = [{ ids: [14, 1], captain: 14 }, { ids: [14], captain: 14 }, { ids: [14], captain: 14 }, { ids: [14], captain: 14 }, { ids: [14, 100], captain: 14 }, { ids: [14], captain: 14 }]
    const t = recommendationSummary({ advice: mk(rivals), rivals, strategy: 'chasing', n: 2, leaderGap: 23 })
    expect(t).toMatch(/^You're 23 pts behind the leader\./)
    expect(t).toMatch(/P8 → P100 \(\+6\.0 xP over 2 GWs\), a differential owned by 17% of rivals/)
    expect(t).toMatch(/Captain P14; 100% of rivals own him/)
    expect(t.split(/(?<=\.) /).length).toBeLessThanOrEqual(3)
  })
  it('recommendation summary says when you lead and protecting wording', () => {
    const rivals = [{ ids: [14], captain: 14 }]
    const t = recommendationSummary({ advice: mk(rivals), rivals, strategy: 'protecting', n: 1, leaderGap: 0 })
    expect(t).toMatch(/^You lead the league\./)
    expect(t).toMatch(/protects you/)
  })
})
