import { describe, expect, it } from 'vitest'
import { defaultTeamName, deleteTeam, MAX_SAVED, parseSavedTeams, renameTeam, serialiseSavedTeams, upsertTeam, type SavedTeam } from '../lib/savedTeams'

const mk = (name: string, over: Partial<SavedTeam> = {}): Omit<SavedTeam, 'id'> => ({ name, savedAt: 1, playerIds: [1, 2, 3], lockedIds: [2], formation: '3-4-3', budget: 100, ...over })

describe('savedTeams', () => {
  it('round-trips through serialise/parse', () => {
    const t = upsertTeam([], mk('A', { captainId: 3 }))!
    expect(parseSavedTeams(serialiseSavedTeams(t))).toEqual(t)
  })
  it('tolerates garbage and drops malformed entries', () => {
    expect(parseSavedTeams(null)).toEqual([])
    expect(parseSavedTeams('not json')).toEqual([])
    expect(parseSavedTeams('{"a":1}')).toEqual([])
    const r = parseSavedTeams(JSON.stringify([{ name: 'ok', playerIds: ['1', 2], lockedIds: [9], budget: 'x' }, { name: '', playerIds: [1] }, { name: 'empty', playerIds: [] }, null]))
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ name: 'ok', playerIds: [1, 2], lockedIds: [], budget: 100, formation: 'any' })
  })
  it('names default to the first free Team N', () => {
    expect(defaultTeamName([])).toBe('Team 1')
    const t = upsertTeam(upsertTeam([], mk('Team 1'))!, mk('Team 3'))!
    expect(defaultTeamName(t)).toBe('Team 2')
  })
  it('overwrites on same name, caps at 20, renames and deletes', () => {
    let t = upsertTeam([], mk('A'))!
    t = upsertTeam(t, mk('a', { budget: 99 }))!
    expect(t).toHaveLength(1); expect(t[0].budget).toBe(99)
    for (let i = 0; i < MAX_SAVED - 1; i++) t = upsertTeam(t, mk(`T${i}`))!
    expect(t).toHaveLength(MAX_SAVED)
    expect(upsertTeam(t, mk('new'))).toBeNull()
    expect(renameTeam(t, t[0].id, 'T1')).toBeNull()
    expect(renameTeam(t, t[0].id, 'Z')![0].name).toBe('Z')
    expect(deleteTeam(t, t[0].id)).toHaveLength(MAX_SAVED - 1)
  })
})
