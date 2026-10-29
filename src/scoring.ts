import { defaultDirection, type Direction, type Player } from './fpl'

export type { Weights } from './lib/weights'
import type { Weights } from './lib/weights'

/**
 * Score = sum(weight% * minmax-normalised stat) within the pool (optionally per position), so 0-100 when weights sum to 100.
 * Lower-is-better criteria (direction 'down'; the default for goals conceded, cards, price...) use 1 - normalised.
 */
export function scorePlayers(pool: Player[], weights: Weights, perPosition = false, directions: Record<string, Direction> = {}): Map<number, number> {
  const out = new Map<number, number>()
  const active = Object.entries(weights).filter(([, w]) => w > 0)
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
        let norm = max > min ? ((p.stats[k] ?? 0) - min) / (max - min) : 0
        if ((directions[k] ?? defaultDirection(k)) === 'down') norm = max > min ? 1 - norm : 0
        s += w * norm
      })
      out.set(p.id, s)
    }
  }
  return out
}
