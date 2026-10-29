/** Saved squads, persisted in localStorage under `fpl-saved-teams`. */
export const SAVED_KEY = 'fpl-saved-teams'
export const MAX_SAVED = 20

export interface SavedTeam {
  id: string; name: string; savedAt: number
  playerIds: number[]; lockedIds: number[]; formation: string; budget: number; captainId?: number
}

const ints = (v: unknown): number[] => (Array.isArray(v) ? v.map(Number).filter((x) => Number.isInteger(x)) : [])

/** Validate untrusted JSON into SavedTeam[]; malformed entries are dropped, the list is capped at MAX_SAVED. */
export function parseSavedTeams(raw: string | null | undefined): SavedTeam[] {
  if (!raw) return []
  let v: unknown
  try { v = JSON.parse(raw) } catch { return [] }
  if (!Array.isArray(v)) return []
  const out: SavedTeam[] = []
  for (const o of v as Record<string, unknown>[]) {
    if (!o || typeof o !== 'object' || typeof o.name !== 'string' || !o.name.trim()) continue
    const playerIds = ints(o.playerIds)
    if (playerIds.length === 0) continue
    const budget = Number(o.budget)
    out.push({
      id: typeof o.id === 'string' && o.id ? o.id : `t${out.length}-${Number(o.savedAt) || 0}`,
      name: o.name.trim(), savedAt: Number.isFinite(Number(o.savedAt)) ? Number(o.savedAt) : 0,
      playerIds, lockedIds: ints(o.lockedIds).filter((x) => playerIds.includes(x)),
      formation: typeof o.formation === 'string' ? o.formation : 'any', budget: Number.isFinite(budget) && budget > 0 ? budget : 100,
      ...(Number.isInteger(Number(o.captainId)) && o.captainId != null ? { captainId: Number(o.captainId) } : {}),
    })
  }
  return out.slice(0, MAX_SAVED)
}

export const serialiseSavedTeams = (teams: SavedTeam[]) => JSON.stringify(teams.slice(0, MAX_SAVED))

export function loadSavedTeams(): SavedTeam[] {
  try { return parseSavedTeams(localStorage.getItem(SAVED_KEY)) } catch { return [] }
}
export function storeSavedTeams(teams: SavedTeam[]): boolean {
  try { localStorage.setItem(SAVED_KEY, serialiseSavedTeams(teams)); return true } catch { return false }
}

/** Default name "Team N" with the smallest N not already used. */
export function defaultTeamName(teams: SavedTeam[]): string {
  const used = new Set(teams.map((t) => t.name.toLowerCase()))
  let i = 1
  while (used.has(`team ${i}`)) i++
  return `Team ${i}`
}

export const findByName = (teams: SavedTeam[], name: string) => teams.find((t) => t.name.toLowerCase() === name.trim().toLowerCase())

/** Insert or overwrite (same name, case-insensitive). Returns null when full and the name is new. */
export function upsertTeam(teams: SavedTeam[], t: Omit<SavedTeam, 'id'> & { id?: string }): SavedTeam[] | null {
  const ex = findByName(teams, t.name)
  if (ex) return teams.map((x) => (x === ex ? { ...t, name: t.name.trim(), id: ex.id } : x))
  if (teams.length >= MAX_SAVED) return null
  return [...teams, { ...t, name: t.name.trim(), id: t.id ?? `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` }]
}

/** Rename; returns null if the new name is empty or taken by another team. */
export function renameTeam(teams: SavedTeam[], id: string, name: string): SavedTeam[] | null {
  const nm = name.trim(), ex = findByName(teams, nm)
  if (!nm || (ex && ex.id !== id)) return null
  return teams.map((t) => (t.id === id ? { ...t, name: nm } : t))
}
export const deleteTeam = (teams: SavedTeam[], id: string) => teams.filter((t) => t.id !== id)
