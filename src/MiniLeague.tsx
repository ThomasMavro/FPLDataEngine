import { useState } from 'react'
import CollapsiblePanel from './CollapsiblePanel'
import { fetchPicks, fetchStandings, FplHttpError, mapLimit } from './api'
import type { RivalSquad, Strategy } from './lib/advice'
import { DEFAULT_WINDOW, defaultStrategy, leagueErrorMessage, MAX_RIVALS, selectRivals, standingsGaps, toRival, type Picks, type Standings } from './lib/league'

interface Props {
  currentGw: number
  onRivals: (r: RivalSquad[], strategy: Strategy, leaderGap: number | null) => void
  onLoadTeam: (p: Picks) => void
}

const KEY = 'fpl-mini-league'
function load(): { team: string; league: string } {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? '{}'); return { team: String(v.team ?? ''), league: String(v.league ?? '') } } catch { return { team: '', league: '' } }
}
function save(v: { team: string; league: string }) { try { localStorage.setItem(KEY, JSON.stringify(v)) } catch { /* storage unavailable */ } }
const id = (s: string) => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : null)
const signed = (x: number) => (x > 0 ? `-${x}` : x === 0 ? '0' : `+${-x}`)

export default function MiniLeague({ currentGw, onRivals, onLoadTeam }: Props) {
  const init = load()
  const [team, setTeam] = useState(init.team)
  const [league, setLeague] = useState(init.league)
  const [windowSz, setWindowSz] = useState(DEFAULT_WINDOW)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [st, setSt] = useState<Standings | null>(null)
  const [mine, setMine] = useState<Picks | null>(null)
  const [userEntry, setUserEntry] = useState(0)

  const run = async (ov?: { team: string; league: string }) => {
    const tv = ov?.team ?? team, lv = ov?.league ?? league
    const teamId = id(tv), leagueId = id(lv)
    if (!teamId || !leagueId) return setErr('Enter numeric IDs for both your team and the mini-league.')
    if (currentGw < 1) return setErr('No gameweek has been played yet, so there are no picks to load.')
    save({ team: tv, league: lv })
    setErr(null); setNote(null); setSt(null); setMine(null); setBusy('Loading standings…')
    try {
      let s: Standings
      try {
        s = await fetchStandings(leagueId, (a) => {
          const me = a.rows.find((r) => r.entry === teamId)
          return !!me && a.rows.some((r) => r.rank >= me.rank + windowSz)
        })
      } catch (e) { throw new Error(leagueErrorMessage(e instanceof FplHttpError ? e.status : undefined, 'league')) }
      if (s.rows.length === 0) throw new Error('This league has no standings yet.')
      const me = s.rows.find((r) => r.entry === teamId)
      if (!me) throw new Error(`Team ${teamId} was not found in "${s.leagueName}" (first ${s.rows.length} managers checked). Check both IDs.`)
      setSt(s); setUserEntry(teamId)
      const rivalRows = selectRivals(s.rows, teamId, windowSz, MAX_RIVALS)
      setBusy(`Loading ${rivalRows.length + 1} squads…`)
      const [mineP, ...rp] = await mapLimit([teamId, ...rivalRows.map((r) => r.entry)], 4, (e) => fetchPicks(e, currentGw))
      if (!mineP) throw new Error(leagueErrorMessage(undefined, 'team') + ` Could not load your GW${currentGw} picks.`)
      setMine(mineP)
      const rivals = rp.filter((p): p is Picks => !!p).map(toRival)
      const failed = rp.length - rivals.length
      onRivals(rivals, defaultStrategy(me.rank), standingsGaps(s.rows, teamId)?.leaderGap ?? null)
      setNote(`${rivals.length} rival squad${rivals.length === 1 ? '' : 's'} loaded for GW${currentGw}${failed ? `, ${failed} failed` : ''}.${rivals.length === 0 ? ' Mini-league mode needs at least one rival.' : ''}`)
    } catch (e) {
      setErr((e as Error).message)
      onRivals([], 'chasing', null)
    } finally { setBusy(null) }
  }

  // IDs are persisted as soon as they are edited, and survive "Reset everything" (which never touches this panel).
  const edit = (t: string, l: string) => { setTeam(t); setLeague(l); save({ team: t, league: l }) }
  const restore = () => { const v = load(); setTeam(v.team); setLeague(v.league); void run(v) }
  const forget = () => { setTeam(''); setLeague(''); try { localStorage.removeItem(KEY) } catch { /* storage unavailable */ } }
  const gaps = st ? standingsGaps(st.rows, userEntry) : null
  return (
    <CollapsiblePanel id="mini-league" title="Mini-league">
      <div className="grid2">
        <label>Your FPL team ID<input inputMode="numeric" value={team} onChange={(e) => edit(e.target.value, league)} placeholder="e.g. 123456" /></label>
        <label>Mini-league ID<input inputMode="numeric" value={league} onChange={(e) => edit(team, e.target.value)} placeholder="classic league" /></label>
        <label>Rivals within<input type="number" min={1} max={50} value={windowSz} onChange={(e) => setWindowSz(Math.max(1, Number(e.target.value) || DEFAULT_WINDOW))} /></label>
      </div>
      <div className="btns" style={{ marginTop: 10 }}>
        <button className="btn primary" onClick={() => run()} disabled={!!busy}>{busy ?? 'Load league'}</button>
        <button className="btn" onClick={restore} disabled={!!busy}>Restore my league</button>
        <button className="btn" onClick={() => mine && onLoadTeam(mine)} disabled={!mine}>Load my team</button>
      </div>
      {(team || league) && <p className="hint"><button className="linkbtn2" onClick={forget}>Forget my IDs</button></p>}
      {err && <div className="msg err" role="alert" style={{ marginTop: 10 }}>{err}</div>}
      {note && <div className="msg ok" style={{ marginTop: 10 }}>{note}</div>}
      {st && gaps && (
        <>
          <p className="hint"><b>{st.leagueName}</b>: {gaps.leaderGap === 0 ? 'you lead the league' : `${gaps.leaderGap} pts behind the leader`}
            {gaps.above && ` · ${gaps.aboveGap} pts behind ${gaps.above.manager} directly above`}</p>
          <div className="twrap">
            <table className="league">
              <thead><tr><th>Rank</th><th>Manager</th><th>GW</th><th>Total</th><th>Gap</th></tr></thead>
              <tbody>{st.rows.filter((r) => Math.abs(r.rank - gaps.user.rank) <= Math.max(windowSz, 3) || r.rank === 1).map((r) => (
                <tr key={r.entry} className={r.entry === userEntry ? 'me' : ''}>
                  <td>{r.rank}</td><td className="nm">{r.manager}<small>{r.entryName}</small></td>
                  <td>{r.eventTotal}</td><td className="sc">{r.total}</td><td>{r.entry === userEntry ? '-' : signed(gaps.user.total - r.total)}</td>
                </tr>))}</tbody>
            </table>
          </div>
        </>
      )}
    </CollapsiblePanel>
  )
}
