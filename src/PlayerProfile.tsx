import { useEffect, useState } from 'react'
import { fetchSummary, type PlayerSummary } from './api'
import { POS_LABEL, type Element, type Team } from './fpl'
import type { GwXp } from './lib/xp'
import { rankOf } from './lib/slots'
import { teamColors } from './teamColors'

const FDR: Record<number, [string, string]> = { 1: ['#01fc7a', '#1c1c28'], 2: ['#01fc7a', '#1c1c28'], 3: ['#e7e7e7', '#1c1c28'], 4: ['#ff1751', '#fff'], 5: ['#80072d', '#fff'] }
const num = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0 }

function Photo({ code, shirt }: { code: number; shirt: string }) {
  const urls = [`https://resources.premierleague.com/premierleague25/photos/players/110x140/${code}.png`, `https://resources.premierleague.com/premierleague/photos/players/110x140/p${code}.png`]
  const [i, setI] = useState(0)
  if (i >= urls.length) return (
    <svg viewBox="0 0 40 36" className="pp-photo pp-shirt" aria-label="No photo"><path d="M13 2 L2 8 L6 17 L11 15 L11 34 L29 34 L29 15 L34 17 L38 8 L27 2 Q20 8 13 2Z" fill={shirt} stroke="rgba(0,0,0,.35)" /></svg>
  )
  return <img key={i} className="pp-photo" src={urls[i]} alt="" onError={() => setI(i + 1)} />
}

interface Props {
  el: Element; elements: Element[]; teams: Map<number, Team>; xp?: GwXp[]
  inSquad: boolean; locked: boolean; excluded: boolean
  onToggleSquad: () => void; onLock: () => void; onExclude: () => void; onClose: () => void
}

export default function PlayerProfile({ el, elements, teams, xp, inSquad, locked, excluded, onToggleSquad, onLock, onExclude, onClose }: Props) {
  const [sum, setSum] = useState<PlayerSummary | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    setSum(null); setFailed(false)
    fetchSummary(el.id).then((s) => { if (live) setSum(s) }).catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [el.id])
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])

  const team = teams.get(el.team)
  const short = (id: number) => teams.get(id)?.short_name ?? '?'
  const same = elements.filter((e) => e.element_type === el.element_type)
  const stat = (key: string, label: string) => {
    const r = rankOf(num(el[key]), same.map((e) => num(e[key])))
    return <div className="pp-stat" key={key}><b>{num(el[key])}{key === 'selected_by_percent' ? '%' : ''}</b><span>{label}</span><small>{r.rank} of {r.of}</small></div>
  }
  const first = String(el.first_name ?? ''), second = String(el.second_name ?? el.web_name)
  const last3 = (sum?.history ?? []).slice(-3)
  const next3 = (sum?.fixtures ?? []).slice(0, 3)
  const [shirt] = teamColors(team)
  const info: [string, string | number][] = [
    ['Total points', num(el.total_points)], ['Goals', num(el.goals_scored)], ['Assists', num(el.assists)], ['Clean sheets', num(el.clean_sheets)],
    ['xG', num(el.expected_goals).toFixed(2)], ['xA', num(el.expected_assists).toFixed(2)], ['Minutes', num(el.minutes)], ['ICT', num(el.ict_index).toFixed(1)],
  ]
  return (
    <div className="pp-backdrop" onClick={onClose} role="presentation">
      <div className="pp" role="dialog" aria-modal="true" aria-label={`${el.web_name} profile`} onClick={(e) => e.stopPropagation()}>
        <div className="pp-head">
          <Photo key={el.id} code={num(el.code)} shirt={shirt} />
          <div className="pp-id">
            <span className="pp-pos">{POS_LABEL[el.element_type]}</span>
            <div className="pp-first">{first}</div>
            <div className="pp-second">{second}</div>
            <div className="pp-club">{team?.name ?? ''}</div>
          </div>
          <button className="pp-x" aria-label="Close" onClick={onClose}>×</button>
        </div>
        <div className="pp-body">
          <div className="pp-price">£{(el.now_cost / 10).toFixed(1)}m</div>
          <div className="pp-stats">{stat('form', 'Form')}{stat('points_per_game', 'Pts / Match')}{stat('selected_by_percent', 'Selected by')}</div>
          <div className="pp-grid">{info.map(([l, v]) => <div key={l}><span>{l}</span><b>{v}</b></div>)}</div>
          {el.news ? <div className="pp-news">{String(el.news)}</div> : null}

          <h3>Form</h3>
          {failed ? <p className="hint">Could not load gameweek history.</p> : !sum ? <p className="hint">Loading…</p> : last3.length === 0 ? <p className="hint">No matches played yet.</p> :
            <div className="pp-chips">{last3.map((r, i) => <span key={i} className="pp-chip" title={`GW${r.round}`}>{short(num(r.opponent_team))}<b>{num(r.total_points)}</b></span>)}</div>}

          <h3>Fixtures</h3>
          {failed ? <p className="hint">Could not load fixtures.</p> : !sum ? <p className="hint">Loading…</p> : next3.length === 0 ? <p className="hint">No upcoming fixtures.</p> :
            <div className="pp-chips">{next3.map((f, i) => {
              const [bg, fg] = FDR[f.difficulty] ?? FDR[3]
              return <span key={i} className="pp-fix" style={{ background: bg, color: fg }} title={f.event ? `GW${f.event}` : ''}>{short(f.is_home ? f.team_a : f.team_h)} ({f.is_home ? 'H' : 'A'})</span>
            })}</div>}

          {xp && xp.length > 0 && <>
            <h3>Expected points</h3>
            <div className="pp-chips">{xp.map((g) => <span key={g.gw} className="pp-chip">GW{g.gw}<b>{g.total.toFixed(1)}</b></span>)}
              <span className="pp-chip pp-sum">Total<b>{xp.reduce((a, g) => a + g.total, 0).toFixed(1)}</b></span></div>
          </>}
        </div>
        <div className="pp-foot">
          <button className={`btn ${inSquad ? '' : 'primary'}`} onClick={onToggleSquad}>{inSquad ? 'Remove from squad' : 'Add to squad'}</button>
          <button className="btn" onClick={onLock}>{locked ? 'Unlock' : 'Lock'}</button>
          <button className="btn" onClick={onExclude}>{excluded ? 'Include' : 'Exclude'}</button>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
