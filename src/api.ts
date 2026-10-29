import { parsePicks, parseStandings, type Standings } from './lib/league'
import type { Bootstrap, Fixture, HistoryRow, SummaryFixture } from './fpl'

const BASE = '/api/fpl'

export class FplHttpError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

/** Build the proxy URL: `/api/fpl?path=<path>&<extra params>`. */
export function proxyUrl(path: string, params?: Record<string, string | number>): string {
  const q = new URLSearchParams({ path })
  for (const [k, v] of Object.entries(params ?? {})) q.set(k, String(v))
  return `${BASE}?${q}`
}

async function getJson<T>(path: string, params?: Record<string, string | number>): Promise<T> {
  const r = await fetch(proxyUrl(path, params))
  if (!r.ok) {
    const detail = (await r.text().catch(() => '')).slice(0, 300)
    throw new FplHttpError(r.status, `FPL API responded ${r.status} for ${path}${detail ? ` — ${detail}` : ''}`)
  }
  return (await r.json()) as T
}

export const fetchBootstrap = () => getJson<Bootstrap>('bootstrap-static/')
export const fetchFixtures = () => getJson<Fixture[]>('fixtures/')

/** Fetch the fixture list, retrying up to `retries` times with a short backoff (FPL sometimes fails intermittently). */
export async function fetchFixturesRetry(retries = 2, delayMs = 800): Promise<Fixture[]> {
  let err: unknown
  for (let i = 0; i <= retries; i++) {
    try {
      const f = await fetchFixtures()
      if (!Array.isArray(f)) throw new Error('Unexpected fixtures response')
      return f
    } catch (e) {
      err = e
      if (i < retries) await new Promise((r) => setTimeout(r, delayMs * (i + 1)))
    }
  }
  throw err
}

const cache = new Map<number, HistoryRow[]>()
export const getCachedHistory = (id: number) => cache.get(id)
/** In-memory only (per page load); cleared by "Refresh data" so histories are refetched. Nothing is written to localStorage. */
export const clearHistoryCache = () => { cache.clear(); summaryCache.clear() }

export interface PlayerSummary { history: HistoryRow[]; fixtures: SummaryFixture[] }
const summaryCache = new Map<number, PlayerSummary>()
/** element-summary for one player (history + upcoming fixtures); cached in memory and shares the history cache. */
export async function fetchSummary(id: number): Promise<PlayerSummary> {
  const hit = summaryCache.get(id)
  if (hit) return hit
  const d = await getJson<{ history?: HistoryRow[]; fixtures?: SummaryFixture[] }>(`element-summary/${id}/`)
  const s = { history: d.history ?? [], fixtures: d.fixtures ?? [] }
  summaryCache.set(id, s); cache.set(id, s.history)
  return s
}

/** Upcoming fixtures of every player whose element-summary has been fetched (deduplicate before use). */
export const getCachedSummaryFixtures = (): SummaryFixture[] => [...summaryCache.values()].flatMap((s) => s.fixtures)

/** Fetch element-summary history for the given players with limited concurrency; results are cached. */
export async function fetchHistories(ids: number[], onProgress?: (done: number, total: number) => void, limit = 6, signal?: { cancelled: boolean }) {
  const todo = ids.filter((id) => !cache.has(id))
  let next = 0, done = 0, failed = 0
  const worker = async () => {
    while (next < todo.length && !signal?.cancelled) {
      const id = todo[next++]
      try {
        await fetchSummary(id)
      } catch {
        failed++
      }
      onProgress?.(++done, todo.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, todo.length) }, worker))
  return failed
}

/** Fetch all pages of a classic league's standings, stopping early once `enough(rows)` is true. */
export async function fetchStandings(leagueId: number, enough: (s: Standings) => boolean, maxPages = 20): Promise<Standings> {
  let all: Standings | null = null
  for (let page = 1; page <= maxPages; page++) {
    const s = parseStandings(await getJson<unknown>(`leagues-classic/${leagueId}/standings/`, { page_standings: page }))
    all = all ? { ...s, rows: [...all.rows, ...s.rows] } : s
    if (!s.hasNext || enough(all)) break
  }
  return all!
}

export const fetchPicks = async (entry: number, gw: number) => parsePicks(await getJson<unknown>(`entry/${entry}/event/${gw}/picks/`))

/** Run `fn` over `items` with at most `limit` in flight; results keep input order (null on failure). */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<(R | null)[]> {
  const out: (R | null)[] = new Array(items.length).fill(null)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      try { out[i] = await fn(items[i]) } catch { out[i] = null }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}
