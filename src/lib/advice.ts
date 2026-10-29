/**
 * Advice engine for the current squad. Pure functions only; the UI passes in data.
 *
 * Inputs are the squad, the full player pool, per-player per-GW xP (src/lib/xp.ts) and fixtures.
 * "bank" = budget - squad cost (GBP m).
 *
 * Transfers: a swap replaces a player with one of the same position who is not already owned. A plan of k (1 or 2)
 * swaps must keep the bank >= 0 and max 3 players per club. Plans are ranked by `score` gain, which equals the raw
 * xP gain over the next N GWs unless mini-league mode is on. `hitWorth` is true when the raw xP gain > HIT_COST (4),
 * i.e. the gain beats the -4 points of one extra transfer.
 *
 * Mini-league mode (rival data wired later): rival squads are { ids, captain }. Effective ownership (EO) of a player
 * = (rivals owning him + rivals captaining him) / rivals. A captain counts twice, so EO can exceed 1; scoring clamps it to 1.
 *   label: EO < DIFFERENTIAL_EO (0.2) -> "differential", EO >= COVER_EO (0.5) -> "cover", else "neutral".
 *   transfer score of a player:  chasing    -> xP * (1 - EO)   rewards players rivals lack (gain ground)
 *                                protecting -> xP * (1 + EO)   rewards players rivals own (cover). The brief says
 *     "xP * EO bias"; a pure xP * EO would zero out every unowned player, so it is applied as a 1+EO boost instead.
 * Plan gain in mini-league mode is sum(score(in)) - sum(score(out)); the displayed xP gain stays raw.
 */
import { MAX_PER_CLUB, type Fixture, type HistoryRow, type Player } from '../fpl'
import { expectedMinutes, sumXp, type GwXp } from './xp'

export const HIT_COST = 4
export const DIFFERENTIAL_EO = 0.2, COVER_EO = 0.5
export const LOW_MINUTES = 60
export const SWING_THRESHOLD = 0.75

export type Strategy = 'chasing' | 'protecting'
export type EoLabel = 'differential' | 'cover' | 'neutral'
export interface RivalSquad { ids: number[]; captain: number }

export function effectiveOwnership(rivals: RivalSquad[]): Map<number, number> {
  const eo = new Map<number, number>()
  if (rivals.length === 0) return eo
  for (const r of rivals) {
    for (const id of new Set(r.ids)) eo.set(id, (eo.get(id) ?? 0) + 1)
    eo.set(r.captain, (eo.get(r.captain) ?? 0) + 1)
  }
  for (const [id, v] of eo) eo.set(id, v / rivals.length)
  return eo
}
export function eoLabel(eo: number): EoLabel { return eo < DIFFERENTIAL_EO ? 'differential' : eo >= COVER_EO ? 'cover' : 'neutral' }
export function miniLeagueScore(xp: number, eo: number, strategy: Strategy): number {
  const e = Math.min(1, Math.max(0, eo))
  return strategy === 'chasing' ? xp * (1 - e) : xp * (1 + e)
}

export interface MiniLeague { eo: Map<number, number>; strategy: Strategy }

export interface AdviceInput {
  squad: Player[]
  pool: Player[]
  budget: number
  xp: Map<number, GwXp[]>
  /** squad ids in the current starting XI (for captain, bench and low-minutes advice). */
  xiIds: number[]
  fixtures: Fixture[]
  /** upcoming gameweek ids the xP covers (first one = next GW). */
  gws: number[]
  finishedGws?: number
  getHistory?: (id: number) => HistoryRow[] | undefined
  miniLeague?: MiniLeague
}

export const isFlagged = (p: Player) => p.status !== 'a' || (p.chance != null && p.chance < 75)
const total = (m: Map<number, GwXp[]>, id: number) => sumXp(m.get(id) ?? [])
const nextGw = (m: Map<number, GwXp[]>, id: number) => m.get(id)?.[0]?.total ?? 0

export interface Swap { out: Player; inn: Player }
export interface TransferPlan { swaps: Swap[]; gain: number; score: number; costChange: number; bankAfter: number; hitWorth: boolean }

export function transferSuggestions(inp: AdviceInput, perCount = 3): { one: TransferPlan[]; two: TransferPlan[] } {
  const { squad, pool, xp, budget, miniLeague: ml } = inp
  const bank = budget - squad.reduce((a, p) => a + p.cost, 0)
  const owned = new Set(squad.map((p) => p.id))
  const sc = (p: Player) => ml ? miniLeagueScore(total(xp, p.id), ml.eo.get(p.id) ?? 0, ml.strategy) : total(xp, p.id)
  const clubCount = new Map<number, number>()
  for (const p of squad) clubCount.set(p.team, (clubCount.get(p.team) ?? 0) + 1)
  const buyable = pool.filter((p) => !owned.has(p.id) && p.status !== 'u' && p.status !== 'n' && p.status !== 's' && (p.chance == null || p.chance >= 75))

  const make = (swaps: Swap[]): TransferPlan | null => {
    const clubs = new Map(clubCount)
    let cost = 0
    for (const s of swaps) {
      clubs.set(s.out.team, (clubs.get(s.out.team) ?? 0) - 1)
      clubs.set(s.inn.team, (clubs.get(s.inn.team) ?? 0) + 1)
      cost += s.inn.cost - s.out.cost
    }
    if (bank - cost < -1e-9 || [...clubs.values()].some((v) => v > MAX_PER_CLUB)) return null
    const gain = swaps.reduce((a, s) => a + total(xp, s.inn.id) - total(xp, s.out.id), 0)
    const score = swaps.reduce((a, s) => a + sc(s.inn) - sc(s.out), 0)
    return { swaps, gain, score, costChange: cost, bankAfter: bank - cost, hitWorth: gain > HIT_COST }
  }

  // Candidate single swaps; keep a shortlist of ins per out so pair search stays small.
  const singles: TransferPlan[] = []
  const shortlist = new Map<number, Swap[]>()
  for (const out of squad) {
    const ins = buyable.filter((p) => p.pos === out.pos).sort((a, b) => sc(b) - sc(a)).slice(0, 40)
    const keep: TransferPlan[] = []
    for (const inn of ins) { const pl = make([{ out, inn }]); if (pl) { singles.push(pl); keep.push(pl) } }
    shortlist.set(out.id, keep.sort((a, b) => b.score - a.score).slice(0, 8).map((k) => k.swaps[0]))
  }
  const rank = (a: TransferPlan, b: TransferPlan) => b.score - a.score || b.gain - a.gain
  // Show distinct outs where possible: best plan per out first, then the rest.
  const one = singles.sort(rank).slice(0, perCount)

  const pairs: TransferPlan[] = []
  const outs = squad.filter((p) => shortlist.get(p.id)?.length)
  for (let i = 0; i < outs.length; i++) for (let j = i + 1; j < outs.length; j++) {
    for (const a of shortlist.get(outs[i].id)!) for (const b of shortlist.get(outs[j].id)!) {
      if (a.inn.id === b.inn.id) continue
      const pl = make([a, b]); if (pl) pairs.push(pl)
    }
  }
  return { one, two: pairs.sort(rank).slice(0, perCount) }
}

export interface CaptainPick { player: Player; xp: number; role: 'captain' | 'vice' | 'option' }
export function captainPicks(inp: AdviceInput): CaptainPick[] {
  const xi = new Set(inp.xiIds)
  return inp.squad.filter((p) => xi.has(p.id)).map((p) => ({ player: p, xp: nextGw(inp.xp, p.id) }))
    .sort((a, b) => b.xp - a.xp).slice(0, 3)
    .map((c, i): CaptainPick => ({ ...c, role: i === 0 ? 'captain' : i === 1 ? 'vice' : 'option' }))
}

export interface FixtureSwing { player: Player; before: number; after: number; swing: number }
export interface EasyRun { team: number; avg: number; fixtures: number }

function teamDifficulties(fixtures: Fixture[]): Map<number, { event: number; d: number }[]> {
  const m = new Map<number, { event: number; d: number }[]>()
  const push = (t: number, event: number, d: number | undefined) => { if (d == null) return; if (!m.has(t)) m.set(t, []); m.get(t)!.push({ event, d }) }
  for (const f of fixtures) {
    if (f.event == null) continue
    push(f.team_h, f.event, f.team_h_difficulty); push(f.team_a, f.event, f.team_a_difficulty)
  }
  for (const v of m.values()) v.sort((a, b) => a.event - b.event)
  return m
}
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

/** Swing = mean FDR of the next N GWs minus mean FDR of the team's last N played fixtures; >= SWING_THRESHOLD is "sharp". */
export function fixtureSwings(inp: AdviceInput, easiestCount = 5): { worsening: FixtureSwing[]; easiest: EasyRun[] } {
  const diff = teamDifficulties(inp.fixtures)
  const next = new Set(inp.gws), n = inp.gws.length
  const nextAvg = (t: number) => { const xs = (diff.get(t) ?? []).filter((f) => next.has(f.event)).map((f) => f.d); return xs.length ? avg(xs) : null }
  const prevAvg = (t: number) => {
    const first = Math.min(...inp.gws)
    const xs = (diff.get(t) ?? []).filter((f) => f.event < first).slice(-n).map((f) => f.d)
    return xs.length ? avg(xs) : null
  }
  const worsening: FixtureSwing[] = []
  if (n > 0) for (const p of inp.squad) {
    const a = nextAvg(p.team), b = prevAvg(p.team)
    if (a == null || b == null) continue
    if (a - b >= SWING_THRESHOLD) worsening.push({ player: p, before: b, after: a, swing: a - b })
  }
  const teams = new Set<number>(diff.keys())
  const easiest: EasyRun[] = [...teams].map((t) => ({ team: t, avg: nextAvg(t), fixtures: (diff.get(t) ?? []).filter((f) => next.has(f.event)).length }))
    .filter((e): e is EasyRun => e.avg != null).sort((a, b) => a.avg - b.avg || b.fixtures - a.fixtures).slice(0, easiestCount)
  return { worsening: worsening.sort((a, b) => b.swing - a.swing), easiest }
}

export interface BenchSwap { bench: Player; starter: Player; gain: number }
/** For each bench outfielder/keeper, the best same-or-compatible starter to replace if next-GW xP is higher and the formation stays valid. */
export function benchSwaps(inp: AdviceInput): BenchSwap[] {
  const xi = new Set(inp.xiIds)
  const starters = inp.squad.filter((p) => xi.has(p.id)), bench = inp.squad.filter((p) => !xi.has(p.id))
  const counts = (ps: Player[]) => [1, 2, 3, 4].map((pos) => ps.filter((p) => p.pos === pos).length)
  const valid = (ps: Player[]) => { const [g, d, m, f] = counts(ps); return ps.length === 11 && g === 1 && d >= 3 && m >= 2 && f >= 1 }
  const out: BenchSwap[] = []
  for (const b of bench) {
    let best: BenchSwap | null = null
    for (const s of starters) {
      const gain = nextGw(inp.xp, b.id) - nextGw(inp.xp, s.id)
      if (gain <= 1e-9 || (best && gain <= best.gain)) continue
      if (!valid([...starters.filter((x) => x.id !== s.id), b])) continue
      best = { bench: b, starter: s, gain }
    }
    if (best) out.push(best)
  }
  return out.sort((a, b) => b.gain - a.gain)
}

export interface Flag { player: Player; reason: 'injury' | 'minutes'; detail: string }
export function flags(inp: AdviceInput): Flag[] {
  const xi = new Set(inp.xiIds), out: Flag[] = []
  for (const p of inp.squad) {
    if (isFlagged(p)) {
      const parts = [p.status !== 'a' ? `status ${p.status}` : '', p.chance != null ? `${p.chance}% to play` : '', p.news].filter(Boolean)
      out.push({ player: p, reason: 'injury', detail: parts.join(', ') })
    }
    const m = expectedMinutes(p, inp.getHistory?.(p.id), inp.finishedGws ?? 0)
    if (xi.has(p.id) && m < LOW_MINUTES && !isFlagged(p)) out.push({ player: p, reason: 'minutes', detail: `~${Math.round(m)} expected minutes` })
  }
  return out
}

export interface MiniLeagueRow { player: Player; eo: number; label: EoLabel }
export function miniLeagueView(squad: Player[], rivals: RivalSquad[]): MiniLeagueRow[] {
  const eo = effectiveOwnership(rivals)
  return squad.map((player) => ({ player, eo: eo.get(player.id) ?? 0, label: eoLabel(eo.get(player.id) ?? 0) })).sort((a, b) => a.eo - b.eo)
}

export interface Advice {
  transfers: ReturnType<typeof transferSuggestions>
  captains: CaptainPick[]
  swings: ReturnType<typeof fixtureSwings>
  bench: BenchSwap[]
  flags: Flag[]
  miniLeague?: MiniLeagueRow[]
}
export function buildAdvice(inp: AdviceInput, rivals?: RivalSquad[]): Advice {
  return {
    transfers: transferSuggestions(inp), captains: captainPicks(inp), swings: fixtureSwings(inp),
    bench: benchSwaps(inp), flags: flags(inp), miniLeague: rivals && rivals.length ? miniLeagueView(inp.squad, rivals) : undefined,
  }
}
