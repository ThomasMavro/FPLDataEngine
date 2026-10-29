import { MAX_PER_CLUB, SQUAD_SIZE, type Player } from './fpl'

export interface Cand { p: Player; score: number }
export interface GenInput {
  pool: Cand[]; budget: number; locked: Set<number>; excluded: Set<number>
}
export type GenResult = { ok: true; squad: Cand[] } | { ok: false; error: string }

const EPS = 1e-9
const cost = (xs: Cand[]) => xs.reduce((a, c) => a + c.p.cost, 0)

/** Greedy (with budget reserve) + single-swap hill climbing. Locked players always kept; excluded never used. */
export function generateSquad({ pool, budget, locked, excluded }: GenInput): GenResult {
  const cands = pool.filter((c) => !excluded.has(c.p.id) || locked.has(c.p.id))
  const lockedC = cands.filter((c) => locked.has(c.p.id))
  const need: Record<number, number> = { ...SQUAD_SIZE }
  const clubs = new Map<number, number>()
  for (const c of lockedC) {
    need[c.p.pos]--
    clubs.set(c.p.team, (clubs.get(c.p.team) ?? 0) + 1)
  }
  if (Object.values(need).some((v) => v < 0)) return { ok: false, error: 'Too many locked players in one position.' }
  if ([...clubs.values()].some((v) => v > MAX_PER_CLUB)) return { ok: false, error: 'More than 3 locked players from one club.' }
  if (cost(lockedC) > budget + EPS) return { ok: false, error: 'Locked players already exceed the budget.' }

  const free = cands.filter((c) => !locked.has(c.p.id))
  const squad: Cand[] = [...lockedC]
  const inSquad = new Set(squad.map((c) => c.p.id))
  const cheapest = (pos: number, count: number, skip: Set<number>) =>
    free.filter((c) => c.p.pos === pos && !skip.has(c.p.id)).map((c) => c.p.cost).sort((a, b) => a - b).slice(0, count)

  // Greedy by score, keeping enough money to fill remaining slots with the cheapest players.
  const sorted = [...free].sort((a, b) => b.score - a.score || a.p.cost - b.p.cost)
  const left = { ...need }
  for (const c of sorted) {
    if (left[c.p.pos] <= 0 || (clubs.get(c.p.team) ?? 0) >= MAX_PER_CLUB) continue
    const after = { ...left, [c.p.pos]: left[c.p.pos] - 1 }
    let reserve = 0
    for (const pos of [1, 2, 3, 4]) {
      const ch = cheapest(pos, after[pos], new Set([...inSquad, c.p.id]))
      if (ch.length < after[pos]) { reserve = Infinity; break }
      reserve += ch.reduce((a, b) => a + b, 0)
    }
    if (cost(squad) + c.p.cost + reserve > budget + EPS) continue
    squad.push(c); inSquad.add(c.p.id); left[c.p.pos]--
    clubs.set(c.p.team, (clubs.get(c.p.team) ?? 0) + 1)
  }
  // Fallback: fill any gaps with cheapest legal players (e.g. club limit blocked the reserve estimate).
  for (const pos of [1, 2, 3, 4]) {
    while (left[pos] > 0) {
      const c = free.filter((x) => x.p.pos === pos && !inSquad.has(x.p.id) && (clubs.get(x.p.team) ?? 0) < MAX_PER_CLUB)
        .sort((a, b) => a.p.cost - b.p.cost)[0]
      if (!c) return { ok: false, error: 'Not enough eligible players to fill the squad. Relax filters or exclusions.' }
      squad.push(c); inSquad.add(c.p.id); left[pos]--
      clubs.set(c.p.team, (clubs.get(c.p.team) ?? 0) + 1)
    }
  }
  if (cost(squad) > budget + EPS) return { ok: false, error: 'No valid squad fits within the budget with these filters.' }

  // Hill-climb: best single same-position swap that fits the budget and club limit.
  for (let iter = 0; iter < 200; iter++) {
    let best: { i: number; c: Cand; gain: number } | null = null
    const total = cost(squad)
    squad.forEach((cur, i) => {
      if (locked.has(cur.p.id)) return
      const clubCount = (t: number) => squad.filter((s) => s.p.team === t).length
      for (const c of free) {
        if (c.p.pos !== cur.p.pos || inSquad.has(c.p.id)) continue
        const gain = c.score - cur.score
        if (gain <= 1e-9 || (best && gain <= best.gain)) continue
        if (total - cur.p.cost + c.p.cost > budget + EPS) continue
        if (c.p.team !== cur.p.team && clubCount(c.p.team) >= MAX_PER_CLUB) continue
        best = { i, c, gain }
      }
    })
    if (!best) break
    const b = best as { i: number; c: Cand; gain: number }
    inSquad.delete(squad[b.i].p.id); inSquad.add(b.c.p.id); squad[b.i] = b.c
  }
  return { ok: true, squad }
}

export interface Lineup { xi: Cand[]; bench: Cand[]; captain: Cand | null; formation: [number, number, number] }
export const FORMATIONS: [number, number, number][] = []
for (let d = 3; d <= 5; d++) for (let m = 2; m <= 5; m++) for (let f = 1; f <= 3; f++) if (d + m + f === 10) FORMATIONS.push([d, m, f])

/** Best XI over all valid formations; works on partial squads too (takes what is available). */
export function pickLineup(squad: Cand[]): Lineup {
  const by = (pos: number) => squad.filter((c) => c.p.pos === pos).sort((a, b) => b.score - a.score)
  const g = by(1), d = by(2), m = by(3), f = by(4)
  const sum = (xs: Cand[], k: number) => xs.slice(0, k).reduce((a, c) => a + c.score, 0)
  let best = FORMATIONS[0], bestVal = -Infinity
  for (const fm of FORMATIONS) {
    const filled = Math.min(d.length, fm[0]) + Math.min(m.length, fm[1]) + Math.min(f.length, fm[2])
    const val = sum(d, fm[0]) + sum(m, fm[1]) + sum(f, fm[2]) + filled * 1e-6 // prefer fuller XIs on ties
    if (val > bestVal) { bestVal = val; best = fm }
  }
  const xi = [...g.slice(0, 1), ...d.slice(0, best[0]), ...m.slice(0, best[1]), ...f.slice(0, best[2])]
  const ids = new Set(xi.map((c) => c.p.id))
  const bench = squad.filter((c) => !ids.has(c.p.id)).sort((a, b) => (a.p.pos === 1 ? -1 : 0) - (b.p.pos === 1 ? -1 : 0) || b.score - a.score)
  const captain = xi.reduce<Cand | null>((a, c) => (!a || c.score > a.score ? c : a), null)
  return { xi, bench, captain, formation: best }
}

/** Rule check used for manual edits: returns an error message or null if `add` can join `squad`. */
export function canAdd(squad: Player[], add: Player, budget: number): string | null {
  if (squad.some((p) => p.id === add.id)) return `${add.name} is already in your squad.`
  if (squad.filter((p) => p.pos === add.pos).length >= SQUAD_SIZE[add.pos]) return 'No free slot in that position.'
  if (squad.filter((p) => p.team === add.team).length >= MAX_PER_CLUB) return 'Max 3 players from one club.'
  if (squad.reduce((a, p) => a + p.cost, 0) + add.cost > budget + EPS) return 'Not enough budget.'
  return null
}

export function validateSquad(squad: Player[], budget: number): string[] {
  const errs: string[] = []
  for (const pos of [1, 2, 3, 4]) if (squad.filter((p) => p.pos === pos).length > SQUAD_SIZE[pos]) errs.push(`Too many players in position ${pos}`)
  const clubs = new Map<number, number>()
  squad.forEach((p) => clubs.set(p.team, (clubs.get(p.team) ?? 0) + 1))
  if ([...clubs.values()].some((v) => v > MAX_PER_CLUB)) errs.push('More than 3 players from one club')
  if (squad.reduce((a, p) => a + p.cost, 0) > budget + EPS) errs.push('Over budget')
  return errs
}
