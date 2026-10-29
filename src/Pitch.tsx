import { POS_LABEL, SQUAD_SIZE, type Team } from './fpl'
import type { Cand, Lineup } from './squad'
import { teamColors } from './teamColors'

interface Props {
  squad: Cand[]; lineup: Lineup; teams: Map<number, Team>
  locked: Set<number>; onRemove: (id: number) => void; onLock: (id: number) => void
  xp?: Map<number, number>; onSelect?: (id: number) => void
}

function Card({ c, teams, captain, locked, onRemove, onLock, xp, onSelect }: { c: Cand; teams: Map<number, Team>; captain: boolean; locked: boolean } & Pick<Props, 'onRemove' | 'onLock' | 'xp' | 'onSelect'>) {
  const t = teams.get(c.p.team)
  const [shirt, trim] = teamColors(t)
  return (
    <div className={`pcard ${locked ? 'is-locked' : ''}`}>
      <div className="pcard-actions">
        <button title={locked ? 'Unlock' : 'Lock for generation'} onClick={() => onLock(c.p.id)}>{locked ? 'L' : 'l'}</button>
        <button title="Remove" onClick={() => onRemove(c.p.id)}>x</button>
      </div>
      <svg viewBox="0 0 40 36" className="shirt" aria-hidden>
        <path d="M13 2 L2 8 L6 17 L11 15 L11 34 L29 34 L29 15 L34 17 L38 8 L27 2 Q20 8 13 2Z" fill={shirt} stroke="rgba(0,0,0,.35)" />
        <path d="M13 2 Q20 8 27 2" stroke={trim} strokeWidth="2" fill="none" />
      </svg>
      {captain && <span className="cap">C</span>}
      <div className="pname" title="Show xP detail" onClick={() => onSelect?.(c.p.id)}>{c.p.name}</div>
      <div className="pmeta">{t?.short_name} · £{c.p.cost.toFixed(1)}m</div>
      <div className="pscore">{c.score.toFixed(2)}</div>
      {xp?.has(c.p.id) && <div className="pxp">xP {xp.get(c.p.id)!.toFixed(1)}</div>}
    </div>
  )
}

const Empty = ({ pos }: { pos: number }) => (
  <div className="pcard empty"><div className="shirt-empty" /><div className="pname">{POS_LABEL[pos]}</div><div className="pmeta">empty slot</div></div>
)

export default function Pitch({ squad, lineup, teams, locked, onRemove, onLock, xp, onSelect }: Props) {
  const [d, m, f] = lineup.formation
  const need: Record<number, number> = { 1: 1, 2: d, 3: m, 4: f }
  const row = (pos: number, list: Cand[]) => {
    const cells = list.map((c) => (
      <Card key={c.p.id} c={c} teams={teams} captain={lineup.captain?.p.id === c.p.id} locked={locked.has(c.p.id)} onRemove={onRemove} onLock={onLock} xp={xp} onSelect={onSelect} />
    ))
    for (let i = list.length; i < need[pos]; i++) cells.push(<Empty key={`e${pos}${i}`} pos={pos} />)
    return <div className="prow" key={pos}>{cells}</div>
  }
  const xiBy = (pos: number) => lineup.xi.filter((c) => c.p.pos === pos)
  const benchBy = (pos: number) => lineup.bench.filter((c) => c.p.pos === pos)
  const benchSlots: { pos: number; c?: Cand }[] = []
  for (const pos of [1, 2, 3, 4]) {
    const total = SQUAD_SIZE[pos] - need[pos]
    const have = benchBy(pos)
    for (let i = 0; i < total; i++) benchSlots.push({ pos, c: have[i] })
  }
  void squad
  return (
    <div>
      <div className="pitch">
        {[1, 2, 3, 4].map((pos) => row(pos, xiBy(pos)))}
      </div>
      <div className="bench">
        <div className="bench-title">Substitutes</div>
        <div className="prow">
          {benchSlots.map((s, i) => s.c
            ? <Card key={s.c.p.id} c={s.c} teams={teams} captain={false} locked={locked.has(s.c.p.id)} onRemove={onRemove} onLock={onLock} xp={xp} onSelect={onSelect} />
            : <Empty key={`b${i}`} pos={s.pos} />)}
        </div>
      </div>
    </div>
  )
}
