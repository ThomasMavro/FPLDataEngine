import type { Bootstrap, Fixture, HistoryRow } from './fpl'

const BASE = '/api/fpl'

async function getJson<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}?path=${encodeURIComponent(path)}`)
  if (!r.ok) {
    const detail = (await r.text().catch(() => '')).slice(0, 300)
    throw new Error(`FPL API responded ${r.status} for ${path}${detail ? ` — ${detail}` : ''}`)
  }
  return (await r.json()) as T
}

export const fetchBootstrap = () => getJson<Bootstrap>('bootstrap-static/')
export const fetchFixtures = () => getJson<Fixture[]>('fixtures/')

const cache = new Map<number, HistoryRow[]>()
export const getCachedHistory = (id: number) => cache.get(id)

/** Fetch element-summary history for the given players with limited concurrency; results are cached. */
export async function fetchHistories(ids: number[], onProgress?: (done: number, total: number) => void, limit = 6, signal?: { cancelled: boolean }) {
  const todo = ids.filter((id) => !cache.has(id))
  let next = 0, done = 0, failed = 0
  const worker = async () => {
    while (next < todo.length && !signal?.cancelled) {
      const id = todo[next++]
      try {
        const d = await getJson<{ history: HistoryRow[] }>(`element-summary/${id}/`)
        cache.set(id, d.history ?? [])
      } catch {
        failed++
      }
      onProgress?.(++done, todo.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, todo.length) }, worker))
  return failed
}
