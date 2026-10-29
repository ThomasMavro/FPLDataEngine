import type { RivalSquad, Strategy } from './advice'

export interface StandingRow { entry: number; entryName: string; manager: string; rank: number; eventTotal: number; total: number }
export interface Standings { leagueName: string; rows: StandingRow[]; hasNext: boolean; page: number }
export interface Picks { ids: number[]; starters: number[]; captain: number; bank: number; value: number; chip: string | null }

export const DEFAULT_WINDOW = 10, MAX_RIVALS = 20

const obj = (v: unknown, what: string): Record<string, unknown> => {
  if (!v || typeof v !== 'object') throw new Error(`Unexpected ${what} response from the FPL API.`)
  return v as Record<string, unknown>
}
const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/** Parse one page of `leagues-classic/{id}/standings/`. */
export function parseStandings(raw: unknown): Standings {
  const r = obj(raw, 'standings')
  const st = obj(r.standings, 'standings')
  if (!Array.isArray(st.results)) throw new Error('Unexpected standings response from the FPL API.')
  const rows = (st.results as Record<string, unknown>[]).map((x) => ({
    entry: n(x.entry), entryName: String(x.entry_name ?? ''), manager: String(x.player_name ?? ''),
    rank: n(x.rank), eventTotal: n(x.event_total), total: n(x.total),
  }))
  const league = (r.league ?? {}) as Record<string, unknown>
  return { leagueName: String(league.name ?? 'Mini-league'), rows, hasNext: !!st.has_next, page: n(st.page) || 1 }
}

/** Parse `entry/{id}/event/{gw}/picks/`. Bank and value are returned in £m. */
export function parsePicks(raw: unknown): Picks {
  const r = obj(raw, 'picks')
  if (!Array.isArray(r.picks) || r.picks.length === 0) throw new Error('Unexpected picks response from the FPL API.')
  const picks = [...(r.picks as Record<string, unknown>[])].sort((a, b) => n(a.position) - n(b.position))
  const cap = picks.find((p) => p.is_captain)
  const eh = (r.entry_history ?? {}) as Record<string, unknown>
  return {
    ids: picks.map((p) => n(p.element)),
    starters: picks.filter((p) => n(p.position) <= 11).map((p) => n(p.element)),
    captain: n((cap ?? picks[0]).element),
    bank: n(eh.bank) / 10, value: n(eh.value) / 10,
    chip: typeof r.active_chip === 'string' ? r.active_chip : null,
  }
}

/** Rivals within `window` places of the user (excluding the user), nearest first if capped at `max`, returned in rank order. */
export function selectRivals(rows: StandingRow[], userEntry: number, window = DEFAULT_WINDOW, max = MAX_RIVALS): StandingRow[] {
  const me = rows.find((r) => r.entry === userEntry)
  if (!me) return []
  return rows
    .filter((r) => r.entry !== userEntry && Math.abs(r.rank - me.rank) <= window)
    .sort((a, b) => Math.abs(a.rank - me.rank) - Math.abs(b.rank - me.rank) || a.rank - b.rank)
    .slice(0, max)
    .sort((a, b) => a.rank - b.rank)
}

export interface Gaps { user: StandingRow; leaderGap: number; above: StandingRow | null; aboveGap: number | null }
export function standingsGaps(rows: StandingRow[], userEntry: number): Gaps | null {
  const sorted = [...rows].sort((a, b) => a.rank - b.rank)
  const i = sorted.findIndex((r) => r.entry === userEntry)
  if (i < 0) return null
  const user = sorted[i], above = i > 0 ? sorted[i - 1] : null
  return { user, leaderGap: sorted[0].total - user.total, above, aboveGap: above ? above.total - user.total : null }
}

export const defaultStrategy = (userRank: number): Strategy => (userRank <= 1 ? 'protecting' : 'chasing')

/** Rival squad for the EO wiring: starters plus captain (captain is counted twice by effectiveOwnership). */
export const toRival = (p: Picks): RivalSquad => ({ ids: p.starters, captain: p.captain })

/** Squad ids from the user's picks; budget = current prices of the squad + bank so that "remaining" equals the real bank. */
export function squadFromPicks(p: Picks, price: (id: number) => number | undefined): { ids: number[]; budget: number } {
  const ids = p.ids.filter((id) => price(id) != null)
  const spent = ids.reduce((a, id) => a + (price(id) ?? 0), 0)
  return { ids, budget: Math.round((spent + p.bank) * 10) / 10 }
}

export function leagueErrorMessage(status: number | undefined, what: 'league' | 'team'): string {
  if (status === 404) return what === 'league' ? 'League not found. Check the ID and that it is a classic league (not head-to-head).' : 'Team not found. Check your FPL team ID.'
  if (status === 403) return 'This league or team is private or restricted, so its data cannot be read.'
  if (status === 429) return 'The FPL API is rate limiting requests. Wait a moment and try again.'
  if (status === 503 || status === 502 || status === 504) return 'The FPL API is down or being updated. Try again later.'
  return 'Could not reach the FPL API.'
}
