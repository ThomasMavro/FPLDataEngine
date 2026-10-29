import type { Player } from './fpl'

export type Weights = Record<string, number>

/** Score = sum(weight * minmax-normalised stat) within the pool (optionally per position). */
export function scorePlayers(pool: Player[], weights: Weights, perPosition = false): Map<number, number> {
  const out = new Map<number, number>()
  const active = Object.entries(weights).filter(([, w]) => w !== 0)
  const groups = new Map<number, Player[]>()
  for (const p of pool) {
    const g = perPosition ? p.pos : 0
    if (!groups.has(g)) groups.set(g, [])
    groups.get(g)!.push(p)
  }
  for (const group of groups.values()) {
    const range = active.map(([k]) => {
      let min = Infinity, max = -Infinity
      for (const p of group) { const v = p.stats[k] ?? 0; if (v < min) min = v; if (v > max) max = v }
      return { min, max }
    })
    for (const p of group) {
      let s = 0
      active.forEach(([k, w], i) => {
        const { min, max } = range[i]
        const norm = max > min ? ((p.stats[k] ?? 0) - min) / (max - min) : 0
        s += w * norm
      })
      out.set(p.id, s)
    }
  }
  return out
}
