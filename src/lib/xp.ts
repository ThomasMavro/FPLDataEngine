/**
 * Expected points (xP) model. All formulas live here.
 *
 * For one player and one fixture (m = expected minutes, already scaled by availability):
 *
 *   p60  = clamp((m - 30) / 50, 0, 1)            P(plays 60+)
 *   pAny = clamp(m / 45, 0, 1)                   P(plays at all)
 *   p1   = max(0, pAny - p60)                    P(plays 1-59)
 *   appearance = 2*p60 + 1*p1
 *   atk  = leagueMeanDefence / opponentDefence   (opp strength_defence_away if we are home, else _home)
 *   def  = opponentAttack / leagueMeanAttack     (opp strength_attack_away if we are home, else _home)
 *   goals   = xG90 * m/90 * goalPts[pos] * atk   (GK/DEF 6, MID 5, FWD 4)
 *   assists = xA90 * m/90 * 3 * atk
 *   lambda  = teamXGC90 * def                    expected goals conceded by the player's team
 *   cs      = exp(-lambda) * p60 * csPts[pos]    (GK/DEF 4, MID 1, FWD 0)
 *   gc      = -0.5 * lambda * m/90               (GK/DEF only; -1 per 2 goals conceded)
 *   saves   = saves90 * m/90 / 3 * def           (GK only; 1 pt per 3 saves)
 *   bonus   = bonus90 * m/90                     (season bonus per 90)
 *   defcon  = 2 * logistic((dc90 - thr) / 2) * m/90   (only if the field exists; thr 10 DEF, 12 MID/FWD)
 *
 * xP of a gameweek is the sum over that GW's fixtures (double GW = two terms, blank GW = 0).
 * Expected minutes: mean of the last 5 GWs' minutes (incl. 0) when history is loaded, otherwise
 * season minutes per start scaled by start share; then times chance_of_playing_next_round/100 (null = 100).
 * Team xGC/90 is estimated from the team's goalkeepers (sum xGC / sum minutes * 90).
 */
import type { Fixture, HistoryRow, Player, SummaryFixture, Team } from '../fpl'

export const GOAL_PTS: Record<number, number> = { 1: 6, 2: 6, 3: 5, 4: 4 }
export const CS_PTS: Record<number, number> = { 1: 4, 2: 4, 3: 1, 4: 0 }
export const DC_THRESHOLD: Record<number, number> = { 1: Infinity, 2: 10, 3: 12, 4: 12 }
export const DEFAULT_XGC90 = 1.3
export const DEFAULT_N = 5, MIN_N = 1, MAX_N = 8

export interface XpParts { appearance: number; goals: number; assists: number; cleanSheet: number; goalsConceded: number; saves: number; bonus: number; defCon: number; total: number }
export interface XpFixture { gw: number; opp: number; home: boolean }
export interface XpContext {
  teams: Map<number, Team>
  meanAtk: { home: number; away: number }; meanDef: { home: number; away: number }
  teamXgc90: Map<number, number>
  hasDefCon: boolean
}
export interface GwXp { gw: number; total: number; parts: XpParts; fixtures: XpFixture[] }

const num = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0 }
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
const emptyParts = (): XpParts => ({ appearance: 0, goals: 0, assists: 0, cleanSheet: 0, goalsConceded: 0, saves: 0, bonus: 0, defCon: 0, total: 0 })
export const clampN = (n: number) => (Number.isFinite(n) ? clamp(Math.round(n), MIN_N, MAX_N) : DEFAULT_N)

export function buildContext(teams: Team[], players: Player[], hasDefCon: boolean): XpContext {
  const m = (f: (t: Team) => number | undefined) => mean(teams.map(f).filter((v): v is number => typeof v === 'number' && v > 0)) || 1
  const xgc = new Map<number, number>()
  const gk = new Map<number, { x: number; min: number }>()
  for (const p of players) if (p.pos === 1) {
    const e = gk.get(p.team) ?? { x: 0, min: 0 }
    e.x += num(p.stats.expected_goals_conceded); e.min += num(p.stats.minutes); gk.set(p.team, e)
  }
  for (const [t, e] of gk) if (e.min > 0) xgc.set(t, (e.x / e.min) * 90)
  return {
    teams: new Map(teams.map((t) => [t.id, t])),
    meanAtk: { home: m((t) => t.strength_attack_home), away: m((t) => t.strength_attack_away) },
    meanDef: { home: m((t) => t.strength_defence_home), away: m((t) => t.strength_defence_away) },
    teamXgc90: xgc, hasDefCon,
  }
}

/** ids of the next n unfinished gameweeks. */
export function upcomingGws(events: { id: number; finished: boolean }[], n: number): number[] {
  return events.filter((e) => !e.finished).map((e) => e.id).sort((a, b) => a - b).slice(0, clampN(n))
}

/** Group fixtures by team for the given gameweeks (postponed fixtures with no event are ignored). */
export function fixturesByTeam(fixtures: Fixture[], gws: number[]): Map<number, XpFixture[]> {
  const set = new Set(gws), out = new Map<number, XpFixture[]>()
  const push = (t: number, f: XpFixture) => { if (!out.has(t)) out.set(t, []); out.get(t)!.push(f) }
  for (const f of fixtures) {
    if (f.event == null || !set.has(f.event)) continue
    push(f.team_h, { gw: f.event, opp: f.team_a, home: true })
    push(f.team_a, { gw: f.event, opp: f.team_h, home: false })
  }
  return out
}

/** Convert element-summary fixtures to the bootstrap Fixture shape and merge with `base`, deduplicating by event+home+away (base wins). */
export function mergeFixtures(base: Fixture[], summary: SummaryFixture[]): Fixture[] {
  const key = (e: number | null, h: number, a: number) => `${e}-${h}-${a}`
  const seen = new Set(base.map((f) => key(f.event, f.team_h, f.team_a)))
  const out = [...base]
  for (const s of summary) {
    const k = key(s.event, s.team_h, s.team_a)
    if (s.event == null || seen.has(k)) continue
    seen.add(k)
    out.push({
      id: -out.length - 1, event: s.event, team_h: s.team_h, team_a: s.team_a, finished: false,
      team_h_difficulty: s.is_home ? s.difficulty : undefined, team_a_difficulty: s.is_home ? undefined : s.difficulty,
    })
  }
  return out
}

/** Expected minutes in a future match. */
export function expectedMinutes(p: Player, history?: HistoryRow[], finishedGws = 0): number {
  let base: number
  if (history && history.length) {
    const last = [...history].sort((a, b) => a.round - b.round).slice(-5)
    base = mean(last.map((r) => Number(r.minutes) || 0))
  } else {
    const minutes = Number(p.stats.minutes), starts = Number(p.starts)
    if (starts > 0) {
      const share = finishedGws > 0 ? clamp(starts / (0.6 * finishedGws), 0, 1) : 1
      base = Math.min(90, minutes / starts) * share
    } else base = finishedGws > 0 ? Math.min(90, minutes / finishedGws) : 0
  }
  return clamp(base, 0, 90) * (p.chance == null || !Number.isFinite(Number(p.chance)) ? 1 : clamp(Number(p.chance), 0, 100) / 100)
}

/** xP breakdown for one fixture given expected minutes m. */
export function fixtureXp(p: Player, m: number, fx: XpFixture, ctx: XpContext): XpParts {
  const parts = emptyParts()
  // FPL returns many stats as strings ("2.16"); coerce everything we read.
  const s = new Proxy(p.stats, { get: (t, k) => num((t as Record<string | symbol, unknown>)[k]) }) as Record<string, number>
  const opp = ctx.teams.get(fx.opp)
  const oppDef = (fx.home ? opp?.strength_defence_away : opp?.strength_defence_home) ?? 0
  const oppAtk = (fx.home ? opp?.strength_attack_away : opp?.strength_attack_home) ?? 0
  const meanDef = fx.home ? ctx.meanDef.away : ctx.meanDef.home
  const meanAtk = fx.home ? ctx.meanAtk.away : ctx.meanAtk.home
  const atk = oppDef > 0 ? meanDef / oppDef : 1
  const def = oppAtk > 0 ? oppAtk / meanAtk : 1
  const f90 = m / 90
  const p60 = clamp((m - 30) / 50, 0, 1), pAny = clamp(m / 45, 0, 1), p1 = Math.max(0, pAny - p60)
  parts.appearance = 2 * p60 + p1
  parts.goals = s.expected_goals_per_90 * f90 * GOAL_PTS[p.pos] * atk
  parts.assists = s.expected_assists_per_90 * f90 * 3 * atk
  const lambda = (ctx.teamXgc90.get(p.team) ?? DEFAULT_XGC90) * def
  parts.cleanSheet = Math.exp(-lambda) * p60 * CS_PTS[p.pos]
  if (p.pos <= 2) parts.goalsConceded = -0.5 * lambda * f90
  if (p.pos === 1) parts.saves = (s.saves_per_90 * f90 / 3) * def
  parts.bonus = (s.minutes > 0 ? (s.bonus / s.minutes) * 90 : 0) * f90
  if (ctx.hasDefCon && p.pos !== 1) {
    const thr = DC_THRESHOLD[p.pos]
    parts.defCon = 2 / (1 + Math.exp(-(s.defensive_contribution_per_90 - thr) / 2)) * f90
  }
  parts.total = parts.appearance + parts.goals + parts.assists + parts.cleanSheet + parts.goalsConceded + parts.saves + parts.bonus + parts.defCon
  return parts
}

/** Per-gameweek xP for one player across `gws` (blank GW = 0, double GW = sum of fixtures). */
export function playerXp(p: Player, gws: number[], teamFixtures: XpFixture[] | undefined, ctx: XpContext, history?: HistoryRow[], finishedGws = 0): GwXp[] {
  const m = expectedMinutes(p, history, finishedGws)
  return gws.map((gw) => {
    const fixtures = (teamFixtures ?? []).filter((f) => f.gw === gw)
    const parts = emptyParts()
    for (const fx of fixtures) {
      const x = fixtureXp(p, m, fx, ctx)
      for (const k of Object.keys(parts) as (keyof XpParts)[]) parts[k] += x[k]
    }
    return { gw, total: parts.total, parts, fixtures }
  })
}

export const sumXp = (g: GwXp[]) => g.reduce((a, x) => a + x.total, 0)
