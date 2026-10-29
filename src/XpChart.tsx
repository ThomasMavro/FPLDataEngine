import { useState } from 'react'
import { POS_LABEL, type Player, type Team } from './fpl'
import type { GwXp, XpParts } from './lib/xp'

export const POS_COLOR: Record<number, string> = { 1: '#ebff00', 2: '#00ff87', 3: '#04f5ff', 4: '#e90052' }
const PART_LABEL: [keyof XpParts, string][] = [
  ['appearance', 'Appearance'], ['goals', 'Goals'], ['assists', 'Assists'], ['cleanSheet', 'Clean sheet'],
  ['goalsConceded', 'Goals conceded'], ['saves', 'Saves'], ['bonus', 'Bonus'], ['defCon', 'Def. contribution'],
]

export interface XpEntry { p: Player; gws: GwXp[]; inXi: boolean }

export function fixtureLabel(g: GwXp, teams: Map<number, Team>) {
  if (g.fixtures.length === 0) return '-'
  return g.fixtures.map((f) => `${teams.get(f.opp)?.short_name ?? '?'} (${f.home ? 'H' : 'A'})`).join(' + ')
}

/** Stacked bar chart: starting XI xP per upcoming GW, one segment per player. */
export function XpChart({ entries, gws }: { entries: XpEntry[]; gws: number[] }) {
  const [hover, setHover] = useState<{ gi: number; id: number } | null>(null)
  const xi = entries.filter((e) => e.inXi)
  const totals = gws.map((_, i) => xi.reduce((a, e) => a + (e.gws[i]?.total ?? 0), 0))
  const max = Math.max(1, ...totals)
  const W = 640, H = 240, L = 34, T = 18, B = 28, R = 8
  const bw = Math.min(64, (W - L - R) / Math.max(1, gws.length) * 0.65)
  const x = (i: number) => L + ((W - L - R) / gws.length) * (i + 0.5)
  const y = (v: number) => T + (H - T - B) * (1 - v / max)
  const hovered = hover ? xi.find((e) => e.p.id === hover.id) : null
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max)
  return (
    <div className="xpchart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Expected points of the starting XI per gameweek">
        {ticks.map((t) => (
          <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#e4dfe9" /><text x={L - 4} y={y(t) + 3} textAnchor="end" className="ax">{t.toFixed(0)}</text></g>
        ))}
        {gws.map((gw, i) => {
          let acc = 0
          return (
            <g key={gw}>
              {xi.map((e) => {
                const v = e.gws[i]?.total ?? 0
                const y0 = y(acc + v), h = y(acc) - y0
                acc += v
                if (h <= 0) return null
                const on = hover?.gi === i && hover.id === e.p.id
                return <rect key={e.p.id} x={x(i) - bw / 2} y={y0} width={bw} height={h} fill={POS_COLOR[e.p.pos]} stroke={on ? '#37003c' : '#fff'} strokeWidth={on ? 2 : 0.7}
                  onMouseEnter={() => setHover({ gi: i, id: e.p.id })} onMouseLeave={() => setHover(null)}>
                  <title>{`${e.p.name}: ${v.toFixed(2)} xP in GW${gw}`}</title></rect>
              })}
              <text x={x(i)} y={y(totals[i]) - 4} textAnchor="middle" className="tot">{totals[i].toFixed(1)}</text>
              <text x={x(i)} y={H - 10} textAnchor="middle" className="ax">GW{gw}</text>
            </g>
          )
        })}
      </svg>
      <div className="xplegend">{[1, 2, 3, 4].map((p) => <span key={p}><i style={{ background: POS_COLOR[p] }} />{POS_LABEL[p]}</span>)}<em>Starting XI, one segment per player</em></div>
      <div className="xptip" aria-live="polite">
        {hovered && hover ? <><b>{hovered.p.name}</b> GW{gws[hover.gi]}: <b>{(hovered.gws[hover.gi]?.total ?? 0).toFixed(2)}</b> xP</> : 'Hover a segment to see a player\'s xP.'}
      </div>
    </div>
  )
}

/** Mini bar sparkline of xP per gameweek. */
export function Spark({ values, max, color = '#37003c', h = 28, bw = 12 }: { values: number[]; max: number; color?: string; h?: number; bw?: number }) {
  const w = values.length * (bw + 3)
  return (
    <svg width={w} height={h} className="spark" aria-hidden>
      {values.map((v, i) => { const bh = max > 0 ? Math.max(v > 0 ? 1.5 : 0, (v / max) * (h - 2)) : 0; return <rect key={i} x={i * (bw + 3)} y={h - bh} width={bw} height={bh} rx={2} fill={color}><title>{v.toFixed(2)}</title></rect> })}
    </svg>
  )
}

/** Detail panel: per-player sparkline rows plus a breakdown for the selected player. */
export function XpDetail({ entries, gws, teams, selected, onSelect }: { entries: XpEntry[]; gws: number[]; teams: Map<number, Team>; selected: number | null; onSelect: (id: number) => void }) {
  const sorted = [...entries].sort((a, b) => b.gws.reduce((s, g) => s + g.total, 0) - a.gws.reduce((s, g) => s + g.total, 0))
  const max = Math.max(1, ...entries.flatMap((e) => e.gws.map((g) => g.total)))
  const sel = entries.find((e) => e.p.id === selected) ?? null
  const parts = sel ? PART_LABEL.map(([k, l]) => [l, sel.gws.reduce((a, g) => a + g.parts[k], 0)] as const).filter(([, v]) => Math.abs(v) > 0.005) : []
  return (
    <div className="xpdetail">
      <div className="xplist">
        {sorted.map((e) => (
          <button key={e.p.id} className={`xprow ${e.p.id === selected ? 'on' : ''}`} onClick={() => onSelect(e.p.id)}>
            <span className="xpn">{e.p.name}<small>{POS_LABEL[e.p.pos]}{e.inXi ? '' : ' (bench)'}</small></span>
            <Spark values={e.gws.map((g) => g.total)} max={max} color={POS_COLOR[e.p.pos] === '#ebff00' ? '#a3b300' : '#37003c'} />
            <b>{e.gws.reduce((a, g) => a + g.total, 0).toFixed(1)}</b>
          </button>
        ))}
      </div>
      <div className="xpsel">
        {!sel && <p className="hint">Select a player (here or on the pitch) for a per-gameweek breakdown.</p>}
        {sel && (
          <>
            <h3>{sel.p.name} <small>{teams.get(sel.p.team)?.short_name} · {POS_LABEL[sel.p.pos]}</small></h3>
            {sel.p.news && <p className="hint warn">{sel.p.news}</p>}
            <Spark values={sel.gws.map((g) => g.total)} max={Math.max(1, ...sel.gws.map((g) => g.total))} h={60} bw={30} />
            <table className="mini"><thead><tr><th>GW</th><th>Fixtures</th><th>xP</th></tr></thead>
              <tbody>{sel.gws.map((g) => <tr key={g.gw}><td>{g.gw}</td><td>{fixtureLabel(g, teams)}</td><td>{g.total.toFixed(2)}</td></tr>)}</tbody></table>
            <div className="parts">{parts.map(([l, v]) => <span key={l}>{l} <b>{v.toFixed(2)}</b></span>)}</div>
          </>
        )}
      </div>
    </div>
  )
}
