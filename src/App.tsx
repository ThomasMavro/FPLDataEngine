import { useEffect, useMemo, useState } from 'react'
import { fetchBootstrap, fetchFixtures, fetchHistories, getCachedHistory } from './api'
import { aggregatePlayer, POS_LABEL, seasonPlayer, STAT_LABEL, STATS, type Bootstrap, type Fixture, type Player } from './fpl'
import { scorePlayers } from './scoring'
import { canAdd, generateSquad, pickLineup, validateSquad, type Cand } from './squad'
import Pitch from './Pitch'
import AdvicePanel from './AdvicePanel'
import { XpChart, XpDetail, type XpEntry } from './XpChart'
import { buildContext, clampN, DEFAULT_N, fixturesByTeam, MAX_N, MIN_N, playerXp, sumXp, upcomingGws, type GwXp } from './lib/xp'

type Venue = 'all' | 'home' | 'away'
const num = (v: string, d: number) => (v.trim() === '' || !Number.isFinite(Number(v)) ? d : Number(v))
const DEFAULT_WEIGHTS: Record<string, number> = { form: 5, points_per_game: 5, value: 3 }

function toggle<T>(arr: T[], v: T) { return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v] }

export default function App() {
  const [data, setData] = useState<{ bs: Bootstrap; fixtures: Fixture[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  const [budget, setBudget] = useState(100)
  const [priceMin, setPriceMin] = useState(3.5)
  const [priceMax, setPriceMax] = useState(15)
  const [minMinutes, setMinMinutes] = useState(0)
  const [teamSel, setTeamSel] = useState<number[]>([])
  const [posSel, setPosSel] = useState<number[]>([])
  const [venue, setVenue] = useState<Venue>('all')
  const [gwFrom, setGwFrom] = useState('')
  const [gwTo, setGwTo] = useState('')

  const [weights, setWeights] = useState<Record<string, number>>(DEFAULT_WEIGHTS)
  const [perPos, setPerPos] = useState(false)
  const [addStat, setAddStat] = useState('')

  const [sortKey, setSortKey] = useState('score')
  const [sortDir, setSortDir] = useState<1 | -1>(-1)
  const [showN, setShowN] = useState(50)

  const [squadIds, setSquadIds] = useState<number[]>([])
  const [locked, setLocked] = useState<number[]>([])
  const [excluded, setExcluded] = useState<number[]>([])
  const [msg, setMsg] = useState<{ kind: 'err' | 'ok'; text: string } | null>(null)

  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [failed, setFailed] = useState(0)
  const [tick, setTick] = useState(0)
  const [xpN, setXpN] = useState(String(DEFAULT_N))
  const [xpGen, setXpGen] = useState(false)
  const [selected, setSelected] = useState<number | null>(null)

  useEffect(() => {
    setError(null)
    Promise.all([fetchBootstrap(), fetchFixtures().catch(() => [] as Fixture[])])
      .then(([bs, fixtures]) => {
        if (!bs?.elements?.length) throw new Error('Unexpected response from the FPL API.')
        setData({ bs, fixtures })
      })
      .catch((e) => setError(String(e?.message ?? e)))
  }, [reload])

  const teams = useMemo(() => new Map((data?.bs.teams ?? []).map((t) => [t.id, t])), [data])
  const base0 = useMemo(() => (data?.bs.elements ?? []).map(seasonPlayer), [data])
  const N = clampN(num(xpN, DEFAULT_N))
  const finishedGws = useMemo(() => (data?.bs.events ?? []).filter((e) => e.finished).length, [data])
  const xpGws = useMemo(() => upcomingGws(data?.bs.events ?? [], N), [data, N])
  const xpCtx = useMemo(() => data ? buildContext(data.bs.teams, base0, data.bs.elements.some((e) => 'defensive_contribution_per_90' in e)) : null, [data, base0])
  const teamFix = useMemo(() => fixturesByTeam(data?.fixtures ?? [], xpGws), [data, xpGws])
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
    const up = (data?.fixtures ?? []).filter((f) => !f.finished && f.event).sort((a, b) => a.event! - b.event!)
    for (const f of up) {
      if (!m.has(f.team_h)) m.set(f.team_h, `${teams.get(f.team_a)?.short_name ?? '?'} (H)`)
      if (!m.has(f.team_a)) m.set(f.team_a, `${teams.get(f.team_h)?.short_name ?? '?'} (A)`)
    }
    return m
  }, [data, teams])

  const from = Math.max(1, num(gwFrom, 1)), to = Math.min(maxGw || 99, num(gwTo, maxGw || 99))
  const rangeSet = (gwFrom !== '' && from > 1) || (gwTo !== '' && to < maxGw)
  const needsHistory = rangeSet || venue !== 'all'
  const xpActive = (weights.xp ?? 0) !== 0 || xpGen

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

  const scores = useMemo(() => xpGen ? new Map(pool.map((p) => [p.id, p.stats.xp])) : scorePlayers(pool, weights, perPos), [pool, weights, perPos, xpGen])
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
  const lineup = useMemo(() => pickLineup(squad), [squad])
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
  const extraCols = activeStats.filter((k) => !['now_cost', 'minutes', 'total_points', 'xp'].includes(k)).slice(0, 4)

  const generate = () => {
    const lockedC = locked.map((id) => baseById.get(id)).filter(Boolean).map((p) => cand(p!))
    const ids = new Set(lockedC.map((c) => c.p.id))
    const r = generateSquad({ pool: [...pool.filter((p) => !ids.has(p.id)).map(cand), ...lockedC], budget, locked: new Set(locked), excluded: new Set(excluded) })
    if (!r.ok) return setMsg({ kind: 'err', text: r.error })
    setSquadIds(r.squad.map((c) => c.p.id))
    setMsg({ kind: 'ok', text: `Generated a squad of ${r.squad.length} players.` })
  }
  const add = (p: Player) => {
    const err = canAdd(squad.map((c) => c.p), p, budget)
    if (err) return setMsg({ kind: 'err', text: err })
    setSquadIds([...squadIds, p.id]); setExcluded(excluded.filter((x) => x !== p.id)); setMsg(null)
  }
  const remove = (id: number) => { setSquadIds(squadIds.filter((x) => x !== id)); setLocked(locked.filter((x) => x !== id)) }
  const lockToggle = (id: number) => { setLocked(toggle(locked, id)); setExcluded(excluded.filter((x) => x !== id)) }
  const excludeToggle = (id: number) => { setExcluded(toggle(excluded, id)); setLocked(locked.filter((x) => x !== id)); if (!excluded.includes(id)) remove(id) }
  const sortBy = (k: string) => { if (k === sortKey) setSortDir((d) => (d === 1 ? -1 : 1)); else { setSortKey(k); setSortDir(k === 'name' || k === 'team' ? 1 : -1) } }
  const th = (k: string, label: string) => <th key={k} onClick={() => sortBy(k)} className={sortKey === k ? 'sorted' : ''}>{label}{sortKey === k ? (sortDir === -1 ? ' ▼' : ' ▲') : ''}</th>

  return (
    <>
      <header className="top"><div className="wrap"><h1>FPL <span>Decision Engine</span></h1><p>Weight the stats you trust. Build the squad that maximises them.</p></div></header>
      <main className="wrap">
        {error && (
          <div className="card error" role="alert">
            <h2>Could not reach the Fantasy Premier League API</h2>
            <p>{error}</p>
            <p>The FPL API may be down, blocked, or the proxy is not running. No data is shown until live data loads.</p>
            <button className="btn" onClick={() => setReload((r) => r + 1)}>Try again</button>
          </div>
        )}
        {!error && !data && <div className="card">Loading live FPL data…</div>}
        {data && (
          <div className="layout">
            <aside>
              <section className="card">
                <h2>Budget</h2>
                <label className="row">Total (£m)<input type="number" step="0.1" value={budget} onChange={(e) => setBudget(num(e.target.value, 100))} /></label>
              </section>

              <section className="card">
                <h2>Filters</h2>
                <div className="grid2">
                  <label>Min price<input type="number" step="0.5" value={priceMin} onChange={(e) => setPriceMin(num(e.target.value, 0))} /></label>
                  <label>Max price<input type="number" step="0.5" value={priceMax} onChange={(e) => setPriceMax(num(e.target.value, 20))} /></label>
                  <label>Min minutes<input type="number" step="90" value={minMinutes} onChange={(e) => setMinMinutes(num(e.target.value, 0))} /></label>
                  <label>Venue<select value={venue} onChange={(e) => setVenue(e.target.value as Venue)}><option value="all">Home + away</option><option value="home">Home only</option><option value="away">Away only</option></select></label>
                  <label>GW from<input type="number" min={1} max={maxGw} placeholder="1" value={gwFrom} onChange={(e) => setGwFrom(e.target.value)} /></label>
                  <label>GW to<input type="number" min={1} max={maxGw} placeholder={String(maxGw)} value={gwTo} onChange={(e) => setGwTo(e.target.value)} /></label>
                </div>
                <div className="chips">{[1, 2, 3, 4].map((p) => <button key={p} className={`chip ${posSel.includes(p) ? 'on' : ''}`} onClick={() => setPosSel(toggle(posSel, p))}>{POS_LABEL[p]}</button>)}</div>
                <div className="chips">{data.bs.teams.map((t) => <button key={t.id} className={`chip ${teamSel.includes(t.id) ? 'on' : ''}`} onClick={() => setTeamSel(toggle(teamSel, t.id))}>{t.short_name}</button>)}</div>
                <p className="hint">{needsHistory ? `Stats aggregated from per-gameweek history (GW ${from}-${to}${venue !== 'all' ? `, ${venue}` : ''}).` : 'Using season totals.'} Leave positions/teams empty for all.</p>
                {progress && <p className="hint">Loading player history {progress.done}/{progress.total}…</p>}
                {failed > 0 && !progress && needsHistory && <p className="hint warn">{failed} player histories failed to load and are omitted.</p>}
              </section>

              <section className="card">
                <h2>Criteria</h2>
                {activeStats.length === 0 && <p className="hint">Add a stat to start scoring players.</p>}
                {activeStats.map((k) => (
                  <div key={k} className="crit">
                    <div className="crit-h"><span>{STAT_LABEL[k]}</span><b>{weights[k]}</b>
                      <button className="x" onClick={() => { const w = { ...weights }; delete w[k]; setWeights(w) }}>remove</button></div>
                    <input type="range" min={-10} max={10} step={1} value={weights[k]} onChange={(e) => setWeights({ ...weights, [k]: Number(e.target.value) })} />
                  </div>
                ))}
                <div className="row">
                  <select value={addStat} onChange={(e) => { if (e.target.value) { setWeights({ ...weights, [e.target.value]: e.target.value === 'now_cost' ? -3 : 5 }); } setAddStat('') }}>
                    <option value="">+ Add stat…</option>
                    {STATS.filter((s) => !(s.key in weights)).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>
                <label className="check"><input type="checkbox" checked={perPos} onChange={(e) => setPerPos(e.target.checked)} /> Normalise within each position</label>
              </section>
            </aside>

            <div className="col">
              <section className="card">
                <div className="bar">
                  <h2>Your squad</h2>
                  <div className="stats">
                    <span>Spent <b>£{spent.toFixed(1)}m</b></span>
                    <span className={budget - spent < 0 ? 'neg' : ''}>Remaining <b>£{(budget - spent).toFixed(1)}m</b></span>
                    <span>Players <b>{squad.length}/15</b></span>
                  </div>
                  <div className="btns">
                    <button className="btn primary" onClick={generate} disabled={pool.length === 0 && locked.length === 0}>Generate your ideal team</button>
                    <button className="btn" onClick={() => { setSquadIds([]); setLocked([]); setMsg(null) }}>Clear</button>
                  </div>
                </div>
                <label className="check"><input type="checkbox" checked={xpGen} onChange={(e) => setXpGen(e.target.checked)} /> Generate and rank on xP (next {N} GWs) instead of the weighted score</label>
                {msg && <div className={`msg ${msg.kind}`}>{msg.text}</div>}
                {rules.length > 0 && <div className="msg err">{rules.join(' · ')}</div>}
                <Pitch squad={squad} lineup={lineup} teams={teams} locked={new Set(locked)} onRemove={remove} onLock={lockToggle} xp={xpTotals} onSelect={setSelected} />
                {excluded.length > 0 && <p className="hint">Excluded: {excluded.map((id) => <button key={id} className="chip on" onClick={() => excludeToggle(id)}>{baseById.get(id)?.name} x</button>)}</p>}
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

              <section className="card">
                <div className="bar"><h2>Advice</h2></div>
                <AdvicePanel squad={squadPlayers} pool={base} budget={budget} xp={xpAll} xiIds={xiIds}
                  fixtures={data.fixtures} gws={xpGws} finishedGws={finishedGws} teams={teams} n={N} getHistory={getCachedHistory} />
              </section>

              <section className="card">
                <div className="bar"><h2>Players ranked by score</h2><span className="hint">{rows.length} players</span></div>
                {rows.length === 0 && <p className="hint">{progress ? 'Loading…' : 'No players match the current filters.'}</p>}
                <div className="twrap">
                  <table>
                    <thead><tr><th>#</th>{th('name', 'Player')}{th('team', 'Club')}{th('pos', 'Pos')}{th('now_cost', 'Price')}{th('minutes', 'Mins')}{th('total_points', 'Pts')}{extraCols.map((k) => th(k, STAT_LABEL[k]))}<th>Next</th>{th('xp', `xP (${N} GW)`)}{th('score', xpGen ? 'Score (xP)' : 'Score')}<th></th></tr></thead>
                    <tbody>
                      {rows.slice(0, showN).map((c, i) => {
                        const inSq = squadIds.includes(c.p.id)
                        return (
                          <tr key={c.p.id} className={excluded.includes(c.p.id) ? 'dim' : ''}>
                            <td>{i + 1}</td><td className="nm">{c.p.name}{c.p.news && <span className="flag" title={c.p.news}>!</span>}</td>
                            <td>{teams.get(c.p.team)?.short_name}</td><td>{POS_LABEL[c.p.pos]}</td>
                            <td>{c.p.cost.toFixed(1)}</td><td>{Math.round(c.p.stats.minutes)}</td><td>{c.p.stats.total_points}</td>
                            {extraCols.map((k) => <td key={k}>{(c.p.stats[k] ?? 0).toFixed(2)}</td>)}
                            <td>{nextFix.get(c.p.team) ?? '-'}</td>
                            <td>{(c.p.stats.xp ?? 0).toFixed(1)}</td>
                            <td className="sc">{c.score.toFixed(2)}</td>
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
                {rows.length > showN && <button className="btn" onClick={() => setShowN(showN + 50)}>Show more</button>}
              </section>
            </div>
          </div>
        )}
      </main>
    </>
  )
}
