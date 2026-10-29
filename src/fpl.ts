// Types + stat helpers for the public FPL API (bootstrap-static, element-summary).
export interface Team {
  id: number; name: string; short_name: string; code: number
  strength_attack_home?: number; strength_attack_away?: number
  strength_defence_home?: number; strength_defence_away?: number
}
export interface Element {
  id: number; web_name: string; team: number; element_type: number; now_cost: number
  status?: string; news?: string
  [k: string]: unknown
}
export interface Event { id: number; name: string; finished: boolean; is_current: boolean; is_next?: boolean }
export interface Bootstrap {
  elements: Element[]; teams: Team[]; events: Event[]
  element_types: { id: number; singular_name_short: string; plural_name_short?: string }[]
}
export interface Fixture {
  id: number; event: number | null; team_h: number; team_a: number; finished: boolean
  team_h_difficulty?: number; team_a_difficulty?: number
}
/** Gameweek to show as "current": is_current, else is_next, else the last finished one. */
export function currentGameweek(events: Event[]): { id: number; isNext: boolean } | null {
  const cur = events.find((e) => e.is_current)
  if (cur) return { id: cur.id, isNext: false }
  const next = events.find((e) => e.is_next)
  if (next) return { id: next.id, isNext: true }
  const fin = events.filter((e) => e.finished)
  return fin.length ? { id: Math.max(...fin.map((e) => e.id)), isNext: false } : null
}
export interface HistoryRow { round: number; was_home: boolean; [k: string]: unknown }

export type Pos = 1 | 2 | 3 | 4
export const POS_LABEL: Record<number, string> = { 1: 'GKP', 2: 'DEF', 3: 'MID', 4: 'FWD' }
export const SQUAD_SIZE: Record<number, number> = { 1: 2, 2: 5, 3: 5, 4: 3 }
export const MAX_PER_CLUB = 3

export interface StatDef { key: string; label: string; negative?: boolean }
export const STATS: StatDef[] = [
  { key: 'total_points', label: 'Total points' }, { key: 'event_points', label: 'GW points' },
  { key: 'points_per_game', label: 'Points per game' },
  { key: 'selected_by_percent', label: 'Selected by %' }, { key: 'now_cost', label: 'Price (£m)', negative: true },
  { key: 'minutes', label: 'Minutes' }, { key: 'goals_scored', label: 'Goals' }, { key: 'assists', label: 'Assists' },
  { key: 'clean_sheets', label: 'Clean sheets' }, { key: 'goals_conceded', label: 'Goals conceded', negative: true },
  { key: 'own_goals', label: 'Own goals', negative: true }, { key: 'penalties_saved', label: 'Penalties saved' },
  { key: 'penalties_missed', label: 'Penalties missed', negative: true }, { key: 'yellow_cards', label: 'Yellow cards', negative: true },
  { key: 'red_cards', label: 'Red cards', negative: true }, { key: 'saves', label: 'Saves' }, { key: 'bonus', label: 'Bonus' },
  { key: 'bps', label: 'BPS' }, { key: 'influence', label: 'Influence' }, { key: 'creativity', label: 'Creativity' },
  { key: 'threat', label: 'Threat' }, { key: 'ict_index', label: 'ICT index' },
  { key: 'expected_goals', label: 'xG' }, { key: 'expected_assists', label: 'xA' },
  { key: 'expected_goal_involvements', label: 'xGI' }, { key: 'expected_goals_conceded', label: 'xGC', negative: true },
  { key: 'expected_goals_per_90', label: 'xG per 90' }, { key: 'expected_assists_per_90', label: 'xA per 90' },
  { key: 'expected_goal_involvements_per_90', label: 'xGI per 90' },
  { key: 'expected_goals_conceded_per_90', label: 'xGC per 90', negative: true },
  { key: 'saves_per_90', label: 'Saves per 90' }, { key: 'clean_sheets_per_90', label: 'Clean sheets per 90' },
  { key: 'goals_conceded_per_90', label: 'Goals conceded per 90', negative: true },
  { key: 'defensive_contribution', label: 'Defensive contribution' },
  { key: 'defensive_contribution_per_90', label: 'Def. contribution per 90' },
  { key: 'transfers_in_event', label: 'Transfers in (GW)' }, { key: 'transfers_out_event', label: 'Transfers out (GW)' },
  { key: 'value', label: 'Value (pts per £m)' },
  { key: 'xp', label: 'xP (next N GWs)' }, // computed in src/lib/xp.ts, injected by the app
]
/** Direction a stat is scored in by default: 'down' for lower-is-better stats (goals conceded, cards, price...). */
export type Direction = 'up' | 'down'
export const defaultDirection = (key: string): Direction => (STATS.find((s) => s.key === key)?.negative ? 'down' : 'up')
export const STAT_LABEL: Record<string, string> = Object.fromEntries(STATS.map((s) => [s.key, s.label]))

export interface Player {
  id: number; name: string; team: number; pos: number; cost: number // £m
  status: string; news: string
  /** chance_of_playing_next_round (0-100), null = no flag. */
  chance: number | null; starts: number
  stats: Record<string, number>
}

const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0 }
const per90 = (v: number, min: number) => (min > 0 ? (v / min) * 90 : 0)

function finish(stats: Record<string, number>, cost: number) {
  stats.now_cost = cost
  stats.value = cost > 0 ? stats.total_points / cost : 0
  return stats
}

/** Season-total stats from a bootstrap-static element. */
export function seasonPlayer(el: Element): Player {
  const stats: Record<string, number> = {}
  for (const s of STATS) stats[s.key] = n(el[s.key])
  const cost = el.now_cost / 10
  return {
    id: el.id, name: el.web_name, team: el.team, pos: el.element_type, cost,
    status: String(el.status ?? 'a'), news: String(el.news ?? ''),
    chance: el.chance_of_playing_next_round == null ? null : n(el.chance_of_playing_next_round), starts: n(el.starts), stats: finish(stats, cost),
  }
}

const SUM_KEYS = [
  'total_points', 'minutes', 'goals_scored', 'assists', 'clean_sheets', 'goals_conceded', 'own_goals',
  'penalties_saved', 'penalties_missed', 'yellow_cards', 'red_cards', 'saves', 'bonus', 'bps', 'influence',
  'creativity', 'threat', 'ict_index', 'expected_goals', 'expected_assists', 'expected_goal_involvements',
  'expected_goals_conceded', 'defensive_contribution',
]

/** Stats re-aggregated from element-summary history rows (already filtered to the chosen GWs / venue). */
export function aggregatePlayer(base: Player, rows: HistoryRow[]): Player {
  const s: Record<string, number> = { ...base.stats }
  for (const k of SUM_KEYS) s[k] = rows.reduce((a, r) => a + n(r[k]), 0)
  const played = rows.filter((r) => n(r.minutes) > 0)
  const last = rows[rows.length - 1]
  s.event_points = last ? n(last.total_points) : 0
  s.points_per_game = played.length ? s.total_points / played.length : 0
  const m = s.minutes
  s.expected_goals_per_90 = per90(s.expected_goals, m)
  s.expected_assists_per_90 = per90(s.expected_assists, m)
  s.expected_goal_involvements_per_90 = per90(s.expected_goal_involvements, m)
  s.expected_goals_conceded_per_90 = per90(s.expected_goals_conceded, m)
  s.saves_per_90 = per90(s.saves, m)
  s.clean_sheets_per_90 = per90(s.clean_sheets, m)
  s.goals_conceded_per_90 = per90(s.goals_conceded, m)
  s.defensive_contribution_per_90 = per90(s.defensive_contribution, m)
  return { ...base, stats: finish(s, base.cost) }
}
