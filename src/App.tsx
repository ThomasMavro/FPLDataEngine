import { useEffect, useMemo, useRef, useState } from 'react'
import { clearHistoryCache, fetchBootstrap, fetchFixturesRetry, fetchHistories, getCachedHistory, getCachedSummaryFixtures } from './api'
import { aggregatePlayer, currentGameweek, defaultDirection, POS_LABEL, seasonPlayer, STAT_LABEL, STATS, type Bootstrap, type Direction, type Fixture, type Player } from './fpl'
import { scorePlayers } from './scoring'
import { canAdd, FORMATION_PRESETS, generateSquad, pickLineup, presetConstraint, validateSquad, type Cand, type FormationConstraint } from './squad'
import { addCriterion, baseCriteria, equalWeights, removeCriterion, setWeight, totalWeight, type Weights } from './lib/weights'
import MultiSelect, { Popover } from './MultiSelect'
import Pitch from './Pitch'
import AdvicePanel from './AdvicePanel'
import PlayerProfile from './PlayerProfile'
import { freeSlots, noSlotMessage, pickBanner } from './lib/slots'
import MiniLeague from './MiniLeague'
import { squadFromPicks, type Picks } from './lib/league'
import type { RivalSquad, Strategy } from './lib/advice'
import { XpChart, XpDetail, type XpEntry } from './XpChart'
import { defaultTeamName, deleteTeam, findByName, loadSavedTeams, MAX_SAVED, renameTeam, storeSavedTeams, upsertTeam, type SavedTeam } from './lib/savedTeams'
import { buildContext, clampN, DEFAULT_N, fixturesByTeam, mergeFixtures, MAX_N, MIN_N, playerXp, sumXp, upcomingGws, type GwXp } from './lib/xp'

type Venue = 'all' | 'home' | 'away'
const num = (v: string, d: number) => (v.trim() === '' || !Number.isFinite(Number(v)) ? d : Number(v))
const DEFAULTS = { budget: 100, priceMin: 3.5, priceMax: 15 }
const HIDDEN_KEY = 'fpl-hidden-columns'
const PAGE = 25
function loadHidden(): string[] {
  try { const v = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '[]'); return Array.isArray(v) ? v.map(String) : [] } catch { return [] }
}
type ViewMode = 'criteria' | 'all'
const VIEW_KEY = 'fpl-table-view'
function loadView(): ViewMode { try { return localStorage.getItem(VIEW_KEY) === 'all' ? 'all' : 'criteria' } catch { return 'criteria' } }
function saveHidden(v: string[]) { try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(v)) } catch { /* storage unavailable */ } }

/** £-prefixed number input (with optional unit suffix) so the currency sits inside the box. */
function Money({ value, onChange, step, suffix = 'm' }: { value: number; onChange: (v: string) => void; step: number; suffix?: string }) {
  return <span className="adorn"><i>£</i><input type="number" step={step} value={value} onChange={(e) => onChange(e.target.value)} /><em>{suffix}</em></span>
}

function toggle<T>(arr: T[], v: T) { return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v] }

export default function App() {
  const [data, setData] = useState<{ bs: Bootstrap } | null>(null)
  const [bsFixtures, setBsFixtures] = useState<Fixture[]>([])
  const [fixturesError, setFixturesError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  const [budget, setBudget] = useState(DEFAULTS.budget)
  const [priceMin, setPriceMin] = useState(DEFAULTS.priceMin)
  const [priceMax, setPriceMax] = useState(DEFAULTS.priceMax)
  const [minMinutes, setMinMinutes] = useState(0)
  const [teamSel, setTeamSel] = useState<number[]>([])
  const [posSel, setPosSel] = useState<number[]>([])
  const [venue, setVenue] = useState<Venue>('all')
  const [gwFrom, setGwFrom] = useState('')
  const [gwTo, setGwTo] = useState('')

  const [weights, setWeights] = useState<Weights>(() => baseCriteria(true))
  const [dirs, setDirs] = useState<Record<string, Direction>>({})
  const [perPos, setPerPos] = useState(false)
  const [addStat, setAddStat] = useState('')

  const [sortKey, setSortKey] = useState('score')
  const [sortDir, setSortDir] = useState<1 | -1>(-1)
  const [showN, setShowN] = useState(PAGE)
  const [hiddenCols, setHiddenCols] = useState<string[]>(loadHidden)
  const [view, setViewState] = useState<ViewMode>(loadView)
  const setView = (v: ViewMode) => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v) } catch { /* storage unavailable */ } }
  const [saved, setSaved] = useState<SavedTeam[]>(loadSavedTeams)
  const [saveName, setSaveName] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const [savedOpen, setSavedOpen] = useState(false)
  const [fmKey, setFmKey] = useState('any')
  const [fmCustom, setFmCustom] = useState<{ d: string; m: string; f: string; exact: boolean }>({ d: '', m: '', f: '', exact: false })
  const [genMsg, setGenMsg] = useState<{ kind: 'err' | 'ok'; text: string } | null>(null)
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [leaderGap, setLeaderGap] = useState<number | null>(null)
  const critInit = useRef(false)

  const [squadIds, setSquadIds] = useState<number[]>([])
  const [locked, setLocked] = useState<number[]>([])
  const [excluded, setExcluded] = useState<number[]>([])
  const [msg, setMsg] = useState<{ kind: 'err' | 'ok'; text: string } | null>(null)

  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [failed, setFailed] = useState(0)
  const [tick, setTick] = useState(0)
  const [xpN, setXpN] = useState(String(DEFAULT_N))
    const [selected, setSelected] = useState<number | null>(null)
  const [profileId, setProfileId] = useState<number | null>(null)
  const [picking, setPicking] = useState<{ pos: number; prev: number[] } | null>(null)
  const tableRef = useRef<HTMLElement>(null)
  const [rivals, setRivals] = useState<RivalSquad[]>([])
  const [defStrategy, setDefStrategy] = useState<Strategy>('chasing')

  useEffect(() => {
    setError(null)
    let cancelled = false
    fetchBootstrap()
      .then((bs) => {
        if (cancelled) return
        if (!bs?.elements?.length) throw new Error('Unexpected response from the FPL API.')
        setData({ bs }); setFetchedAt(new Date())
        if (!critInit.current) { // base criteria: defensive_contribution only when the API provides it
          critInit.current = true
          if (!bs.elements.some((e) => 'defensive_contribution' in e)) setWeights(baseCriteria(false))
        }
        // fixtures after bootstrap (not in parallel), with retries; xP recomputes whenever they arrive
        setFixturesError(null)
        fetchFixturesRetry().then((f) => { if (!cancelled) { setBsFixtures(f); setFixturesError(null) } })
          .catch((e) => { if (!cancelled) setFixturesError(String(e?.message ?? e)) })
      })
      .catch((e) => !cancelled && setError(String(e?.message ?? e)))
      .finally(() => setRefreshing(false))
    return () => { cancelled = true }
  }, [reload])
  const refresh = () => { clearHistoryCache(); setTick((t) => t + 1); setRefreshing(true); setReload((r) => r + 1) }
  const gw = useMemo(() => currentGameweek(data?.bs.events ?? []), [data])
  const hasDefCon = useMemo(() => !!data?.bs.elements.some((e) => 'defensive_contribution' in e), [data])

  const teams = useMemo(() => new Map((data?.bs.teams ?? []).map((t) => [t.id, t])), [data])
  const base0 = useMemo(() => (data?.bs.elements ?? []).map(seasonPlayer), [data])
  const N = clampN(num(xpN, DEFAULT_N))
  const finishedGws = useMemo(() => (data?.bs.events ?? []).filter((e) => e.finished).length, [data])
  const xpGws = useMemo(() => upcomingGws(data?.bs.events ?? [], N), [data, N])
  const xpCtx = useMemo(() => data ? buildContext(data.bs.teams, base0, data.bs.elements.some((e) => 'defensive_contribution_per_90' in e)) : null, [data, base0])
  // bootstrap fixture list merged with upcoming fixtures from fetched element-summaries (tick = new summaries cached)
  const allFixtures = useMemo(() => { void tick; return mergeFixtures(bsFixtures, getCachedSummaryFixtures()) }, [bsFixtures, tick])
  const teamFix = useMemo(() => fixturesByTeam(allFixtures, xpGws), [allFixtures, xpGws])
  // xP per GW for every player; uses last-5-GW minutes from history where it has been loaded (tick refreshes).
  const xpAll = useMemo(() => {
    void tick
    const m = new Map<number, GwXp[]>()
    if (!xpCtx) return m
    for (const p of base0) m.set(p.id, playerXp(p, xpGws, teamFix.get(p.team), xpCtx, getCachedHistory(p.id), finishedGws))
    return m
  }, [base0, xpGws, teamFix, xpCtx, finishedGws, tick])
  const base = useMemo(() => base0.map((p): Player => ({ ...p, stats: { ...p.stats, xp: sumXp(xpAll.get(p.id) ?? []) } })), [base0, xpAll])
  const baseById = useMemo(() => new Map(base.map((p) => [p.id, p])), [base])
  const maxGw = useMemo(() => {
    const ev = (data?.bs.events ?? []).filter((e) => e.finished || e.is_current)
    return ev.length ? Math.max(...ev.map((e) => e.id)) : 0
  }, [data])
  const nextFix = useMemo(() => {
    const m = new Map<number, string>()
    const up = allFixtures.filter((f) => !f.finished && f.event).sort((a, b) => a.event! - b.event!)
    for (const f of up) {
      if (!m.has(f.team_h)) m.set(f.team_h, `${teams.get(f.team_a)?.short_name ?? '?'} (H)`)
      if (!m.has(f.team_a)) m.set(f.team_a, `${teams.get(f.team_h)?.short_name ?? '?'} (A)`)
    }
    return m
  }, [allFixtures, teams])

  const from = Math.max(1, num(gwFrom, 1)), to = Math.min(maxGw || 99, num(gwTo, maxGw || 99))
  const rangeSet = (gwFrom !== '' && from > 1) || (gwTo !== '' && to < maxGw)
  const needsHistory = rangeSet || venue !== 'all'
  const xpActive = (weights.xp ?? 0) > 0

  const prefiltered = useMemo(() => base.filter((p) =>
    p.cost >= priceMin && p.cost <= priceMax && p.stats.minutes >= minMinutes &&
    (teamSel.length === 0 || teamSel.includes(p.team)) && (posSel.length === 0 || posSel.includes(p.pos)) &&
    (!needsHistory || p.stats.minutes > 0)), [base, priceMin, priceMax, minMinutes, teamSel, posSel, needsHistory])

  const idsKey = needsHistory || xpActive ? prefiltered.filter((p) => p.stats.minutes > 0).map((p) => p.id).join(',') : ''
  useEffect(() => {
    if (!needsHistory && !xpActive) { setProgress(null); return }
    const sig = { cancelled: false }
    const ids = idsKey ? idsKey.split(',').map(Number) : []
    setProgress({ done: 0, total: ids.length })
    fetchHistories(ids, (done, total) => { if (!sig.cancelled) { setProgress({ done, total }); if (done % 20 === 0) setTick((t) => t + 1) } }, 6, sig)
      .then((f) => { if (!sig.cancelled) { setFailed(f); setProgress(null); setTick((t) => t + 1) } })
    return () => { sig.cancelled = true }
  }, [idsKey, needsHistory, xpActive])

  const pool: Player[] = useMemo(() => {
    void tick
    if (!needsHistory) return prefiltered
    const out: Player[] = []
    for (const p of prefiltered) {
      const rows = getCachedHistory(p.id)
      if (!rows) continue
      const sel = rows.filter((r) => r.round >= from && r.round <= to && (venue === 'all' || (venue === 'home') === r.was_home))
      const a = aggregatePlayer(p, sel)
      if (a.stats.minutes >= minMinutes && a.stats.minutes > 0) out.push(a)
    }
    return out
  }, [prefiltered, needsHistory, tick, from, to, venue, minMinutes])

  const scores = useMemo(() => scorePlayers(pool, weights, perPos, dirs), [pool, weights, perPos, dirs])
  const poolById = useMemo(() => new Map(pool.map((p) => [p.id, p])), [pool])
  const cand = (p: Player): Cand => ({ p: poolById.get(p.id) ?? p, score: scores.get(p.id) ?? 0 })

  const rows = useMemo(() => {
    const r = pool.map((p) => ({ p, score: scores.get(p.id) ?? 0 }))
    const val = (c: Cand) => sortKey === 'score' ? c.score : sortKey === 'name' ? c.p.name : sortKey === 'pos' ? c.p.pos : sortKey === 'team' ? (teams.get(c.p.team)?.short_name ?? '') : c.p.stats[sortKey] ?? 0
    return r.sort((a, b) => {
      const x = val(a), y = val(b)
      return (typeof x === 'string' ? x.localeCompare(y as string) : (x as number) - (y as number)) * sortDir
    })
  }, [pool, scores, sortKey, sortDir, teams])

  const squad: Cand[] = useMemo(() => squadIds.map((id) => baseById.get(id)).filter(Boolean).map((p) => cand(p!)), [squadIds, baseById, poolById, scores]) // eslint-disable-line react-hooks/exhaustive-deps
  // squad players' history (for last-5-GW minutes) is always fetched so the chart is as accurate as possible
  const sqKey = squadIds.join(',')
  useEffect(() => {
    if (!sqKey) return
    const sig = { cancelled: false }
    fetchHistories(sqKey.split(',').map(Number), undefined, 6, sig).then(() => { if (!sig.cancelled) setTick((t) => t + 1) })
    return () => { sig.cancelled = true }
  }, [sqKey])
  // fixture list unavailable: fetch one regular starter per club so every team has upcoming fixtures
  useEffect(() => {
    if (!fixturesError || base0.length === 0) return
    const best = new Map<number, Player>()
    for (const p of base0) { const b = best.get(p.team); if (!b || p.stats.minutes > b.stats.minutes) best.set(p.team, p) }
    const sig = { cancelled: false }
    fetchHistories([...best.values()].map((p) => p.id), undefined, 6, sig).then(() => { if (!sig.cancelled) setTick((t) => t + 1) })
    return () => { sig.cancelled = true }
  }, [fixturesError, base0])
  const formation: FormationConstraint | undefined = useMemo(() => {
    if (fmKey === 'any') return undefined
    if (fmKey !== 'custom') return presetConstraint(fmKey)
    const max: FormationConstraint['max'] = {}
    if (fmCustom.d) max[2] = Number(fmCustom.d)
    if (fmCustom.m) max[3] = Number(fmCustom.m)
    if (fmCustom.f) max[4] = Number(fmCustom.f)
    return { max, exact: fmCustom.exact }
  }, [fmKey, fmCustom])
  const lineup = useMemo(() => pickLineup(squad, formation), [squad, formation])
  const xpEntries: XpEntry[] = useMemo(() => {
    const xi = new Set(lineup.xi.map((c) => c.p.id))
    return squad.map((c) => ({ p: c.p, gws: xpAll.get(c.p.id) ?? [], inXi: xi.has(c.p.id) }))
  }, [squad, lineup, xpAll])
  const squadPlayers = useMemo(() => squad.map((c) => c.p), [squad])
  const xiIds = useMemo(() => lineup.xi.map((c) => c.p.id), [lineup])
  const xpTotals = useMemo(() => new Map(squad.map((c) => [c.p.id, sumXp(xpAll.get(c.p.id) ?? [])])), [squad, xpAll])
  const spent = squad.reduce((a, c) => a + c.p.cost, 0)
  const rules = validateSquad(squad.map((c) => c.p), budget)

  const activeStats = Object.keys(weights)
  const xpLabel = `xP (${N} GW)`
  const optCols = view === 'criteria'
    ? activeStats.filter((k) => k !== 'now_cost').map((k) => ({ id: k, label: k === 'xp' ? xpLabel : STAT_LABEL[k] }))
    : [...STATS.filter((st) => st.key !== 'now_cost' && st.key !== 'xp' && (st.key !== 'defensive_contribution' || hasDefCon)).map((st) => ({ id: st.key, label: st.label })),
      { id: 'next', label: 'Next fixture' }, { id: 'xp', label: xpLabel }]
  const shown = (id: string) => view === 'criteria' || !hiddenCols.includes(id)
  const toggleCol = (id: string) => { const v = toggle(hiddenCols, id); setHiddenCols(v); saveHidden(v) }
  const dirOf = (k: string): Direction => dirs[k] ?? defaultDirection(k)

  // The table shows 25 rows at first; any change to filters or criteria starts again from 25.
  useEffect(() => { setShowN(PAGE) }, [priceMin, priceMax, minMinutes, teamSel, posSel, venue, gwFrom, gwTo, weights, dirs, perPos])
  const clearFilters = () => { setPriceMin(DEFAULTS.priceMin); setPriceMax(DEFAULTS.priceMax); setMinMinutes(0); setTeamSel([]); setPosSel([]); setVenue('all'); setGwFrom(''); setGwTo('') }
  const clearCriteria = () => { setWeights(baseCriteria(hasDefCon)); setDirs({}); setPerPos(false) }
  const resetAll = () => {
    clearFilters(); clearCriteria(); setBudget(DEFAULTS.budget)
    setSquadIds([]); setLocked([]); setExcluded([]); setMsg(null); setGenMsg(null); setFmKey('any'); setFmCustom({ d: '', m: '', f: '', exact: false })
  }

  const fmString = fmKey === 'custom' ? `custom:${fmCustom.d}|${fmCustom.m}|${fmCustom.f}|${fmCustom.exact ? 1 : 0}` : fmKey
  const persist = (next: SavedTeam[]) => { setSaved(next); if (!storeSavedTeams(next)) setMsg({ kind: 'err', text: 'Could not store saved teams in this browser.' }) }
  const doSave = () => {
    const name = (saveName ?? '').trim()
    if (!name) return setMsg({ kind: 'err', text: 'Give the team a name.' })
    const ex = findByName(saved, name)
    if (ex && !window.confirm(`Overwrite the saved team "${ex.name}"?`)) return
    const next = upsertTeam(saved, { name, savedAt: Date.now(), playerIds: squadIds, lockedIds: locked.filter((id) => squadIds.includes(id)), formation: fmString, budget })
    if (!next) return setMsg({ kind: 'err', text: `You can save at most ${MAX_SAVED} teams. Delete one first.` })
    persist(next); setSaveName(null); setSavedOpen(true); setMsg({ kind: 'ok', text: `Saved "${name}".` })
  }
  const loadSaved = (t: SavedTeam) => {
    const ids = t.playerIds.filter((id) => baseById.has(id))
    setSquadIds(ids); setLocked(t.lockedIds.filter((id) => ids.includes(id))); setBudget(t.budget)
    if (t.formation.startsWith('custom:')) {
      const [d, m, f, e] = t.formation.slice(7).split('|'); setFmKey('custom'); setFmCustom({ d: d ?? '', m: m ?? '', f: f ?? '', exact: e === '1' })
    } else setFmKey(t.formation === 'any' || FORMATION_PRESETS.includes(t.formation) ? t.formation : 'any')
    setMsg({ kind: 'ok', text: `Loaded "${t.name}"${ids.length < t.playerIds.length ? ` (${t.playerIds.length - ids.length} players no longer available)` : ''}.` })
  }
  const savedStats = (t: SavedTeam) => {
    let price = 0, score = 0, xp = 0
    for (const id of t.playerIds) { const p = baseById.get(id); if (!p) continue; price += p.cost; score += scores.get(id) ?? 0; xp += sumXp(xpAll.get(id) ?? []) }
    return { price, score, xp }
  }
  const loadMyTeam = (p: Picks) => {
    const r = squadFromPicks(p, (id) => baseById.get(id)?.cost)
    setSquadIds(r.ids); setLocked([]); setBudget(r.budget)
    setMsg({ kind: 'ok', text: `Loaded your GW${maxGw} team (${r.ids.length} players, bank £${p.bank.toFixed(1)}m).` })
  }
  const generate = () => {
    const lockedC = locked.map((id) => baseById.get(id)).filter(Boolean).map((p) => cand(p!))
    const ids = new Set(lockedC.map((c) => c.p.id))
    const r = generateSquad({ pool: [...pool.filter((p) => !ids.has(p.id)).map(cand), ...lockedC], budget, locked: new Set(locked), excluded: new Set(excluded), formation })
    if (!r.ok) return setGenMsg({ kind: 'err', text: r.error })
    setSquadIds(r.squad.map((c) => c.p.id)); setMsg(null)
    setGenMsg({ kind: 'ok', text: `Generated a squad of ${r.squad.length} players.` })
  }
  const add = (p: Player) => {
    const err = canAdd(squad.map((c) => c.p), p, budget)
    if (err) return setMsg({ kind: 'err', text: err })
    setSquadIds([...squadIds, p.id]); setExcluded(excluded.filter((x) => x !== p.id)); setMsg(null)
  }
  /** Table name click: add straight into a free slot of his position (the lineup places him), or explain why not. */
  const quickAdd = (p: Player) => {
    if (squadIds.includes(p.id)) return setMsg({ kind: 'err', text: `${p.name} is already in your squad.` })
    const full = noSlotMessage(squad.map((c) => c.p), p.pos)
    if (full) return setMsg({ kind: 'err', text: full })
    add(p)
    if (picking) cancelPick()
  }
  const startPick = (pos: number) => {
    if (freeSlots(squad.map((c) => c.p), pos) === 0) return setMsg({ kind: 'err', text: noSlotMessage(squad.map((c) => c.p), pos)! })
    setPicking((cur) => ({ pos, prev: cur ? cur.prev : posSel })); setPosSel([pos]); setMsg(null)
    setTimeout(() => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }
  const cancelPick = () => { if (picking) setPosSel(picking.prev); setPicking(null) }
  const remove = (id: number) => { setSquadIds(squadIds.filter((x) => x !== id)); setLocked(locked.filter((x) => x !== id)) }
  const lockToggle = (id: number) => { setLocked(toggle(locked, id)); setExcluded(excluded.filter((x) => x !== id)) }
  const excludeToggle = (id: number) => { setExcluded(toggle(excluded, id)); setLocked(locked.filter((x) => x !== id)); if (!excluded.includes(id)) remove(id) }
  const sortBy = (k: string) => { if (k === sortKey) setSortDir((d) => (d === 1 ? -1 : 1)); else { setSortKey(k); setSortDir(k === 'name' || k === 'team' ? 1 : -1) } }
  const th = (k: string, label: string) => <th key={k} onClick={() => sortBy(k)} className={sortKey === k ? 'sorted' : ''}>{label}{sortKey === k ? (sortDir === -1 ? ' ▼' : ' ▲') : ''}</th>

  const profileEl = profileId != null ? data?.bs.elements.find((e) => e.id === profileId) : undefined
  const critTotal = totalWeight(weights)
  const cell = (id: string, c: Cand) =>
    id === 'minutes' ? Math.round(c.p.stats.minutes) : id === 'total_points' ? c.p.stats.total_points
    : id === 'next' ? (nextFix.get(c.p.team) ?? '-') : id === 'xp' ? (c.p.stats.xp ?? 0).toFixed(1) : Number.isInteger(c.p.stats[id] ?? 0) ? (c.p.stats[id] ?? 0) : (c.p.stats[id] ?? 0).toFixed(2)
  const sortable = (id: string) => id !== 'next'

  return (
    <>
      <header className="top"><div className="wrap">
        <h1>FPL <span>Decision Engine</span></h1><p>Build your squad based on the statistics you trust.</p>
        {data && (
          <p className="fresh">Data updated: {fetchedAt ? fetchedAt.toLocaleTimeString() : '-'}{gw ? ` · Gameweek ${gw.id}${gw.isNext ? ' (upcoming)' : ''}` : ''}
            <button className="linkbtn" onClick={refresh} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh data'}</button></p>
        )}
      </div></header>
      <main className="wrap">
        {error && (
          <div className="card error" role="alert">
            <h2>Could not reach the Fantasy Premier League API</h2>
            <p>{error}</p>
            <p>The FPL API may be down, blocked, or the proxy is not running. No data is shown until live data loads.</p>
            <button className="btn" onClick={refresh}>Try again</button>
          </div>
        )}
        {fixturesError && (
          <div className="msg err" role="alert">Couldn't load the fixture list from FPL: {fixturesError}. xP uses fixtures from loaded player data instead.</div>
        )}
        {!error && !data && <div className="card">Loading live FPL data…</div>}
        {data && (
          <div className="layout">
            <aside>
              <section className="card">
                <h2>Budget</h2>
                <label className="row">Total<Money value={budget} step={0.1} onChange={(v) => setBudget(num(v, 100))} /></label>
              </section>

              <section className="card">
                <div className="bar"><h2>Filters</h2><button className="btn small" onClick={clearFilters}>Clear filters</button></div>
                <div className="grid2">
                  <label>Min price<Money value={priceMin} step={0.5} onChange={(v) => setPriceMin(num(v, 0))} /></label>
                  <label>Max price<Money value={priceMax} step={0.5} onChange={(v) => setPriceMax(num(v, 20))} /></label>
                  <label>Min minutes<input type="number" step="90" value={minMinutes} onChange={(e) => setMinMinutes(num(e.target.value, 0))} /></label>
                  <label>Venue<select value={venue} onChange={(e) => setVenue(e.target.value as Venue)}><option value="all">Home + away</option><option value="home">Home only</option><option value="away">Away only</option></select></label>
                  <label>GW from<input type="number" min={1} max={maxGw} placeholder="1" value={gwFrom} onChange={(e) => setGwFrom(e.target.value)} /></label>
                  <label>GW to<input type="number" min={1} max={maxGw} placeholder={String(maxGw)} value={gwTo} onChange={(e) => setGwTo(e.target.value)} /></label>
                  <label>Teams<MultiSelect noun="teams" nounAll="All teams" selected={teamSel} onChange={setTeamSel} options={data.bs.teams.map((t) => ({ value: t.id, label: t.short_name }))} /></label>
                  <label>Positions<MultiSelect noun="positions" nounAll="All positions" selected={posSel} onChange={setPosSel} options={[1, 2, 3, 4].map((p) => ({ value: p, label: POS_LABEL[p] }))} /></label>
                </div>
                <p className="hint">{needsHistory ? `Stats aggregated from per-gameweek history (GW ${from}-${to}${venue !== 'all' ? `, ${venue}` : ''}).` : 'Using season totals.'}</p>
                {progress && <p className="hint">Loading player history {progress.done}/{progress.total}…</p>}
                {failed > 0 && !progress && needsHistory && <p className="hint warn">{failed} player histories failed to load and are omitted.</p>}
              </section>

              <section className="card">
                <div className="bar"><h2>Criteria</h2>
                  <button className="btn small" onClick={() => setWeights(equalWeights(activeStats))} disabled={activeStats.length < 2}>Equalise</button>
                  <button className="btn small" onClick={clearCriteria}>Clear criteria</button></div>
                {activeStats.length === 0 && <p className="hint">Add a stat to start scoring players.</p>}
                {activeStats.map((k) => (
                  <div key={k} className="crit">
                    <div className="crit-h"><span>{STAT_LABEL[k]}</span>
                      <button className="dir" title={dirOf(k) === 'up' ? 'Higher is better (click to flip)' : 'Lower is better (click to flip)'}
                        onClick={() => setDirs({ ...dirs, [k]: dirOf(k) === 'up' ? 'down' : 'up' })}>{dirOf(k) === 'up' ? '↑ higher' : '↓ lower'}</button>
                      <span className="pctin"><input type="number" min={0} max={100} value={weights[k]} onChange={(e) => setWeights(setWeight(weights, k, num(e.target.value, 0)))} />%</span>
                      <button className="x" onClick={() => setWeights(removeCriterion(weights, k))}>remove</button></div>
                    <input type="range" min={0} max={100} step={1} value={weights[k]} onChange={(e) => setWeights(setWeight(weights, k, Number(e.target.value)))} />
                  </div>
                ))}
                <div className="row">
                  <select value={addStat} onChange={(e) => { if (e.target.value) setWeights(addCriterion(weights, e.target.value)); setAddStat('') }}>
                    <option value="">+ Add stat…</option>
                    {STATS.filter((s) => !(s.key in weights) && (s.key !== 'defensive_contribution' || hasDefCon)).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>
                {activeStats.length > 0 && <p className={`hint total ${critTotal === 100 ? '' : 'warn'}`}>Total: <b>{critTotal}%</b></p>}
                <label className="check"><input type="checkbox" checked={perPos} onChange={(e) => setPerPos(e.target.checked)} /> Normalise within each position</label>
              </section>

              <section className="card">
                <div className="btns">
                  <button className="btn primary" onClick={generate} disabled={pool.length === 0 && locked.length === 0}>Generate your ideal team</button>
                  <button className="btn" onClick={() => { setSquadIds([]); setLocked([]); setMsg(null); setGenMsg(null) }}>Clear</button>
                </div>
                {genMsg && <div className={`msg ${genMsg.kind}`} style={{ marginTop: 10 }}>{genMsg.text}</div>}
                <div className="btns" style={{ marginTop: 10 }}><button className="btn small" onClick={resetAll}>Reset everything</button></div>
              </section>
            </aside>

            <div className="col">
              <section className="card squadcard">
                <div className="bar">
                  <h2>Your squad</h2>
                  <div className="stats">
                    <span>Spent <b>£{spent.toFixed(1)}m</b></span>
                    <span className={budget - spent < 0 ? 'neg' : ''}>Remaining <b>£{(budget - spent).toFixed(1)}m</b></span>
                    <span>Budget <b>£{budget.toFixed(1)}m</b></span>
                    <span>Players <b>{squad.length}/15</b></span>
                    <span>Squad score <b>{squad.reduce((a, c) => a + c.score, 0).toFixed(1)}</b></span>
                  </div>
                </div>
                <div className="fmrow">
                  <label className="inline">Formation (starting XI)
                    <select value={fmKey} onChange={(e) => setFmKey(e.target.value)}>
                      <option value="any">Any (best)</option>
                      {FORMATION_PRESETS.map((f) => <option key={f} value={f}>{f}</option>)}
                      <option value="custom">Custom max…</option>
                    </select></label>
                  {fmKey === 'custom' && (
                    <>
                      {([['d', 'DEF'], ['m', 'MID'], ['f', 'FWD']] as const).map(([k, l]) => (
                        <label key={k} className="inline">Max {l}
                          <select value={fmCustom[k]} onChange={(e) => setFmCustom({ ...fmCustom, [k]: e.target.value })}>
                            <option value="">Any</option>{(k === 'd' ? [3, 4, 5] : k === 'm' ? [2, 3, 4, 5] : [1, 2, 3]).map((n) => <option key={n} value={n}>{n}</option>)}
                          </select></label>
                      ))}
                      <label className="inline"><input type="checkbox" checked={fmCustom.exact} onChange={(e) => setFmCustom({ ...fmCustom, exact: e.target.checked })} /> Exactly these</label>
                    </>
                  )}
                  <span className="hint">XI shown: {lineup.formation.join('-')}</span>
                </div>
                {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
                {rules.length > 0 && <div className="msg err">{rules.join(' · ')}</div>}
                <div className="savedrow">
                  {saveName === null
                    ? <button className="btn small" disabled={squad.length === 0} onClick={() => setSaveName(defaultTeamName(saved))}>Save team</button>
                    : <span className="inline-edit"><input aria-label="Team name" value={saveName} autoFocus maxLength={40} onChange={(e) => setSaveName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') doSave(); if (e.key === 'Escape') setSaveName(null) }} />
                      <button className="btn small primary" onClick={doSave}>Save</button><button className="btn small" onClick={() => setSaveName(null)}>Cancel</button></span>}
                  <button className="btn small" onClick={() => setSavedOpen(!savedOpen)} aria-expanded={savedOpen}>Saved teams ({saved.length}) {savedOpen ? '▲' : '▼'}</button>
                </div>
                {savedOpen && (saved.length === 0 ? <p className="hint">No saved teams yet.</p> : (
                  <ul className="savedlist">
                    {saved.map((t) => { const st = savedStats(t); return (
                      <li key={t.id}>
                        {renaming?.id === t.id
                          ? <span className="inline-edit"><input aria-label="New name" value={renaming.name} autoFocus onChange={(e) => setRenaming({ id: t.id, name: e.target.value })}
                              onKeyDown={(e) => { if (e.key === 'Escape') setRenaming(null); if (e.key === 'Enter') { const n2 = renameTeam(saved, t.id, renaming.name); if (n2) { persist(n2); setRenaming(null) } else setMsg({ kind: 'err', text: 'That name is empty or already used.' }) } }} />
                            <button className="btn small" onClick={() => { const n2 = renameTeam(saved, t.id, renaming.name); if (n2) { persist(n2); setRenaming(null) } else setMsg({ kind: 'err', text: 'That name is empty or already used.' }) }}>OK</button></span>
                          : <b>{t.name}</b>}
                        <small>£{st.price.toFixed(1)}m · {t.playerIds.length} players · score {st.score.toFixed(1)} · xP {st.xp.toFixed(1)}</small>
                        <span className="acts">
                          <button onClick={() => loadSaved(t)}>Load</button>
                          <button onClick={() => setRenaming({ id: t.id, name: t.name })}>Rename</button>
                          <button onClick={() => { if (window.confirm(`Delete saved team "${t.name}"?`)) persist(deleteTeam(saved, t.id)) }}>Delete</button>
                        </span>
                      </li>) })}
                  </ul>
                ))}
                <Pitch squad={squad} lineup={lineup} teams={teams} locked={new Set(locked)} onRemove={remove} onLock={lockToggle} xp={xpTotals} onSelect={(id) => { setSelected(id); setProfileId(id) }} onEmpty={startPick} picking={picking?.pos ?? null} />
                {excluded.length > 0 && <p className="hint">Excluded: {excluded.map((id) => <button key={id} className="chip on" onClick={() => excludeToggle(id)}>{baseById.get(id)?.name} x</button>)}</p>}
              </section>

              <MiniLeague currentGw={maxGw} onRivals={(r, st, gap) => { setRivals(r); setDefStrategy(st); setLeaderGap(gap) }} onLoadTeam={loadMyTeam} />

              <section className="card">
                <div className="bar"><h2>Advice</h2></div>
                <AdvicePanel squad={squadPlayers} pool={base} budget={budget} xp={xpAll} xiIds={xiIds} formation={formation} leaderGap={leaderGap}
                  fixtures={allFixtures} gws={xpGws} finishedGws={finishedGws} teams={teams} n={N} getHistory={getCachedHistory} rivals={rivals} defaultStrategy={defStrategy} />
              </section>

              <section className="card" ref={tableRef}>
                <div className="bar"><h2>Players ranked by score</h2><span className="hint">{rows.length} players</span>
                  <div className="seg" role="group" aria-label="Table view" style={{ marginLeft: 'auto' }}>
                    <button className={view === 'criteria' ? 'on' : ''} aria-pressed={view === 'criteria'} onClick={() => setView('criteria')}>Criteria columns</button>
                    <button className={view === 'all' ? 'on' : ''} aria-pressed={view === 'all'} onClick={() => setView('all')}>All stats</button>
                  </div>
                  {view === 'all' && <Popover align="right" label="Columns">
                    {optCols.map((c) => <label key={c.id} className="opt"><input type="checkbox" checked={shown(c.id)} onChange={() => toggleCol(c.id)} /> {c.label}</label>)}
                  </Popover>}
                </div>
                {picking && <div className="pickbanner" role="status">{pickBanner(picking.pos)} · <button onClick={cancelPick}>Cancel</button></div>}
                {msg && msg.kind === 'err' && <div className="msg err">{msg.text}</div>}
                {rows.length === 0 && <p className="hint">{progress ? 'Loading…' : 'No players match the current filters.'}</p>}
                <div className="twrap">
                  <table>
                    <thead><tr><th>#</th>{th('name', 'Player')}{th('team', 'Club')}{th('pos', 'Pos')}{th('now_cost', 'Price')}{th('score', 'Score')}
                      {optCols.filter((c) => shown(c.id)).map((c) => sortable(c.id) ? th(c.id, c.label) : <th key={c.id}>{c.label}</th>)}<th></th></tr></thead>
                    <tbody>
                      {rows.slice(0, showN).map((c, i) => {
                        const inSq = squadIds.includes(c.p.id)
                        return (
                          <tr key={c.p.id} className={excluded.includes(c.p.id) ? 'dim' : ''}>
                            <td>{i + 1}</td><td className="nm"><button className="infob" title="Player profile" aria-label={`${c.p.name} profile`} onClick={() => setProfileId(c.p.id)}>i</button><button className="nmb" title="Add to squad" onClick={() => quickAdd(c.p)}>{c.p.name}</button>{c.p.news && <span className="flag" title={c.p.news}>!</span>}</td>
                            <td>{teams.get(c.p.team)?.short_name}</td><td>{POS_LABEL[c.p.pos]}</td>
                            <td>{c.p.cost.toFixed(1)}</td><td className="sc">{c.score.toFixed(1)}</td>
                            {optCols.filter((o) => shown(o.id)).map((o) => <td key={o.id}>{cell(o.id, c)}</td>)}
                            <td className="acts">
                              <button disabled={inSq} onClick={() => add(c.p)}>{inSq ? 'In' : 'Add'}</button>
                              <button className={locked.includes(c.p.id) ? 'on' : ''} onClick={() => { if (!squadIds.includes(c.p.id)) { const err = canAdd(squad.map((s) => s.p), c.p, budget); if (err) return setMsg({ kind: 'err', text: err }); setSquadIds([...squadIds, c.p.id]) } lockToggle(c.p.id) }}>Lock</button>
                              <button className={excluded.includes(c.p.id) ? 'on' : ''} onClick={() => excludeToggle(c.p.id)}>Excl</button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {rows.length > showN && <button className="btn" style={{ marginTop: 10 }} onClick={() => setShowN(showN + PAGE)}>Show {PAGE} more</button>}
                <p className="hint note">Data source: the official Fantasy Premier League API (fantasy.premierleague.com), refreshed automatically (cached for at most 5 minutes).
                  xP (expected points) applies FPL's scoring rules to each player's expected minutes, xG, xA, clean-sheet chance and bonus per 90. It is then adjusted for opponent strength over the next {N} gameweek{N === 1 ? '' : 's'}.</p>
              </section>

              <section className="card">
                <div className="bar"><h2>Expected points, next {N} GWs</h2>
                  <label className="inline">Gameweeks ({MIN_N}-{MAX_N})<input type="number" min={MIN_N} max={MAX_N} value={xpN} onChange={(e) => setXpN(e.target.value)} onBlur={() => setXpN(String(N))} /></label>
                </div>
                {squad.length === 0 ? <p className="hint">Add or generate players to see their expected points per gameweek.</p> : xpGws.length === 0 ? <p className="hint">No upcoming gameweeks.</p> : (
                  <>
                    <XpChart entries={xpEntries} gws={xpGws} />
                    <XpDetail entries={xpEntries} gws={xpGws} teams={teams} selected={selected} onSelect={setSelected} />
                  </>
                )}
                <p className="hint">Model: appearance, goals, assists, clean sheets, goals conceded, saves, bonus and defensive contribution, adjusted by opponent strength; double GWs summed, blanks score 0. Minutes use the last 5 GWs when history is loaded.</p>
              </section>
            </div>
          </div>
        )}
      </main>
      {profileEl && (
        <PlayerProfile el={profileEl} elements={data!.bs.elements} teams={teams} xp={xpAll.get(profileEl.id)}
          inSquad={squadIds.includes(profileEl.id)} locked={locked.includes(profileEl.id)} excluded={excluded.includes(profileEl.id)}
          onToggleSquad={() => { const pl = baseById.get(profileEl.id); if (squadIds.includes(profileEl.id)) remove(profileEl.id); else if (pl) add(pl) }}
          onLock={() => { const pl = baseById.get(profileEl.id); if (pl && !squadIds.includes(pl.id)) { const err = canAdd(squad.map((s) => s.p), pl, budget); if (err) return setMsg({ kind: 'err', text: err }); setSquadIds([...squadIds, pl.id]) } lockToggle(profileEl.id) }}
          onExclude={() => excludeToggle(profileEl.id)} onClose={() => setProfileId(null)} />
      )}
    </>
  )
}
