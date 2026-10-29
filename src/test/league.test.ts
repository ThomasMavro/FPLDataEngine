import { describe, expect, it } from 'vitest'
import { effectiveOwnership } from '../lib/advice'
import { defaultStrategy, leagueErrorMessage, parsePicks, parseStandings, selectRivals, squadFromPicks, standingsGaps, toRival } from '../lib/league'
import { proxyUrl } from '../api'

const standingsRaw = (from: number, to: number, hasNext = false) => ({
  league: { id: 1, name: 'Test League' },
  standings: { has_next: hasNext, page: 1, results: Array.from({ length: to - from + 1 }, (_, i) => ({
    entry: 1000 + from + i, entry_name: `Team ${from + i}`, player_name: `Mgr ${from + i}`, rank: from + i, event_total: 50, total: 1000 - (from + i) * 5,
  })) },
})
const picksRaw = (ids: number[], cap: number, bank = 5, value = 1000) => ({
  active_chip: null, entry_history: { bank, value, event: 10 },
  picks: ids.map((e, i) => ({ element: e, position: i + 1, multiplier: 1, is_captain: e === cap, is_vice_captain: false })),
})
const ids15 = Array.from({ length: 15 }, (_, i) => i + 1)

describe('league parsing', () => {
  it('parses standings and rejects bad shapes', () => {
    const s = parseStandings(standingsRaw(1, 3, true))
    expect(s.leagueName).toBe('Test League'); expect(s.hasNext).toBe(true)
    expect(s.rows[0]).toMatchObject({ entry: 1001, manager: 'Mgr 1', entryName: 'Team 1', rank: 1, total: 995 })
    expect(() => parseStandings({})).toThrow(); expect(() => parseStandings(null)).toThrow()
  })
  it('parses picks (bank/value in £m, starters, captain)', () => {
    const p = parsePicks(picksRaw(ids15, 3, 12, 1003))
    expect(p.bank).toBe(1.2); expect(p.value).toBe(100.3); expect(p.captain).toBe(3)
    expect(p.starters).toHaveLength(11); expect(p.ids).toHaveLength(15)
    expect(() => parsePicks({ picks: [] })).toThrow()
  })
  it('builds the proxy URL with extra params', () => {
    expect(proxyUrl('leagues-classic/5/standings/', { page_standings: 2 })).toBe('/api/fpl?path=leagues-classic%2F5%2Fstandings%2F&page_standings=2')
  })
})

describe('rival selection and gaps', () => {
  const rows = parseStandings(standingsRaw(1, 60)).rows
  it('picks the nearest rivals within the window, max 20, excluding the user', () => {
    const sel = selectRivals(rows, 1000 + 30)
    expect(sel).toHaveLength(20)
    expect(sel.some((r) => r.entry === 1030)).toBe(false)
    expect(sel.every((r) => Math.abs(r.rank - 30) <= 10)).toBe(true)
    expect(sel.map((r) => r.rank)).toEqual([...sel.map((r) => r.rank)].sort((a, b) => a - b))
    expect(selectRivals(rows, 1002).map((r) => r.rank)).toEqual([1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
    expect(selectRivals(rows, 9999)).toEqual([])
  })
  it('computes gaps to leader and rival above', () => {
    const g = standingsGaps(rows, 1000 + 4)!
    expect(g.leaderGap).toBe(15); expect(g.aboveGap).toBe(5); expect(g.above?.rank).toBe(3)
    const lead = standingsGaps(rows, 1001)!
    expect(lead.leaderGap).toBe(0); expect(lead.above).toBeNull()
  })
  it('defaults strategy', () => { expect(defaultStrategy(1)).toBe('protecting'); expect(defaultStrategy(2)).toBe('chasing') })
})

describe('EO wiring', () => {
  it('turns picks into rivals whose EO counts starters and double-counts the captain', () => {
    const a = toRival(parsePicks(picksRaw(ids15, 1)))
    const b = toRival(parsePicks(picksRaw([...ids15.slice(1, 11), 99, 12, 13, 14, 15, 2], 2)))
    expect(a.ids).toHaveLength(11)
    const eo = effectiveOwnership([a, b])
    expect(eo.get(1)).toBe(1)        // a owns + captains
    expect(eo.get(2)).toBe(1.5)      // a owns; b owns and captains (EO can exceed 100%)
    expect(eo.get(12)).toBeUndefined() // bench for a, not a starter for b
    expect(eo.get(99)).toBe(0.5)
  })
  it('squadFromPicks sets budget so remaining equals the bank', () => {
    const p = parsePicks(picksRaw(ids15, 1, 7))
    const r = squadFromPicks(p, (id) => (id === 15 ? undefined : 5))
    expect(r.ids).toHaveLength(14); expect(r.budget).toBe(70.7)
  })
})

describe('errors', () => {
  it('maps statuses to clear messages', () => {
    expect(leagueErrorMessage(404, 'league')).toMatch(/not found/i)
    expect(leagueErrorMessage(403, 'league')).toMatch(/private/i)
    expect(leagueErrorMessage(503, 'team')).toMatch(/down/i)
  })
})
