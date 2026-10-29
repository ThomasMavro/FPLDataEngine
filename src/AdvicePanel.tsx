import { useMemo, useState } from 'react'
import { POS_LABEL, type Fixture, type HistoryRow, type Player, type Team } from './fpl'
import { buildAdvice, effectiveOwnership, type RivalSquad, type Strategy, type TransferPlan } from './lib/advice'
import type { GwXp } from './lib/xp'

interface Props {
  squad: Player[]; pool: Player[]; budget: number; xp: Map<number, GwXp[]>; xiIds: number[]
  fixtures: Fixture[]; gws: number[]; finishedGws: number; teams: Map<number, Team>; n: number
  getHistory: (id: number) => HistoryRow[] | undefined
  /** Rival squads for mini-league mode. When undefined or empty the mode is hidden. */
  rivals?: RivalSquad[]
}

const tn = (teams: Map<number, Team>, id: number) => teams.get(id)?.short_name ?? '?'
const sign = (x: number, d = 1) => `${x >= 0 ? '+' : '-'}${Math.abs(x).toFixed(d)}`

function Plan({ plan, teams }: { plan: TransferPlan; teams: Map<number, Team> }) {
  return (
    <li className="advrow plan">
      <div className="advswaps">
        {plan.swaps.map((s) => (
          <div key={s.out.id}><span className="out">{s.out.name}</span> <small>{tn(teams, s.out.team)} {POS_LABEL[s.out.pos]} £{s.out.cost.toFixed(1)}</small>
            {' → '}<b>{s.inn.name}</b> <small>{tn(teams, s.inn.team)} £{s.inn.cost.toFixed(1)}</small></div>
        ))}
      </div>
      <div className="advnums">
        <span className="gain">{sign(plan.gain)} xP</span>
        <span className="cost">{plan.costChange === 0 ? '£0.0m' : `${sign(plan.costChange)}m`} (bank £{plan.bankAfter.toFixed(1)}m)</span>
        <span className={`hit ${plan.hitWorth ? 'yes' : 'no'}`}>-4 hit {plan.hitWorth ? 'worth it' : 'not worth it'}</span>
      </div>
    </li>
  )
}

export default function AdvicePanel(p: Props) {
  const hasRivals = !!p.rivals && p.rivals.length > 0
  const [strategy, setStrategy] = useState<Strategy>('chasing')
  const [mlOn, setMlOn] = useState(true)
  const eo = useMemo(() => effectiveOwnership(p.rivals ?? []), [p.rivals])
  const advice = useMemo(() => buildAdvice({
    squad: p.squad, pool: p.pool, budget: p.budget, xp: p.xp, xiIds: p.xiIds, fixtures: p.fixtures, gws: p.gws,
    finishedGws: p.finishedGws, getHistory: p.getHistory, miniLeague: hasRivals && mlOn ? { eo, strategy } : undefined,
  }, hasRivals ? p.rivals : undefined), [p.squad, p.pool, p.budget, p.xp, p.xiIds, p.fixtures, p.gws, p.finishedGws, p.getHistory, hasRivals, mlOn, eo, strategy, p.rivals])

  if (p.squad.length < 15) return <p className="hint">Build a full squad of 15 to get advice.</p>
  if (p.gws.length === 0) return <p className="hint">No upcoming gameweeks.</p>
  const none = <p className="hint">Nothing to suggest.</p>
  const spent = p.squad.reduce((a, x) => a + x.cost, 0)

  return (
    <div className="advice">
      <p className="hint">Bank £{(p.budget - spent).toFixed(1)}m · xP over the next {p.n} GW{p.n > 1 ? 's' : ''} (next GW {p.gws[0]}). A hit costs 4 points.</p>
      {hasRivals && (
        <div className="bar">
          <label className="check"><input type="checkbox" checked={mlOn} onChange={(e) => setMlOn(e.target.checked)} /> Mini-league mode</label>
          {mlOn && <div className="chips">
            {(['chasing', 'protecting'] as const).map((s) => <button key={s} className={`chip ${strategy === s ? 'on' : ''}`} onClick={() => setStrategy(s)}>{s === 'chasing' ? 'Chasing' : 'Protecting'}</button>)}
          </div>}
        </div>
      )}
      <div className="advgrid">
        <div>
          <h3>Transfers: 1 free transfer</h3>
          {advice.transfers.one.length ? <ul className="advlist">{advice.transfers.one.map((pl, i) => <Plan key={i} plan={pl} teams={p.teams} />)}</ul> : none}
          <h3>Transfers: 2 free transfers</h3>
          {advice.transfers.two.length ? <ul className="advlist">{advice.transfers.two.map((pl, i) => <Plan key={i} plan={pl} teams={p.teams} />)}</ul> : none}
        </div>
        <div>
          <h3>Captain and vice</h3>
          <ul className="advlist">{advice.captains.map((c) => (
            <li key={c.player.id} className="advrow"><span><b>{c.player.name}</b> <small>{tn(p.teams, c.player.team)}</small></span>
              <span className="advnums"><span className="gain">{c.xp.toFixed(1)} xP</span><span className={`tag ${c.role}`}>{c.role === 'captain' ? 'C' : c.role === 'vice' ? 'VC' : 'option'}</span></span></li>))}</ul>

          <h3>Bench and lineup</h3>
          {advice.bench.length ? <ul className="advlist">{advice.bench.map((b) => (
            <li key={b.bench.id} className="advrow"><span>Start <b>{b.bench.name}</b> for {b.starter.name}</span><span className="gain">{sign(b.gain)} xP</span></li>))}</ul>
            : <p className="hint">Your XI already has the best next-GW xP.</p>}

          <h3>Flags</h3>
          {advice.flags.length ? <ul className="advlist">{advice.flags.map((f, i) => (
            <li key={i} className="advrow"><span><b>{f.player.name}</b> <small>{f.detail}</small></span><span className={`tag ${f.reason}`}>{f.reason === 'injury' ? 'availability' : 'minutes'}</span></li>))}</ul>
            : <p className="hint">No injury or minutes concerns.</p>}
        </div>
      </div>

      <h3>Fixture swings</h3>
      <div className="advgrid">
        <div>
          <p className="hint">Squad players whose next {p.n}-GW fixtures are sharply harder than their last {p.n} (FDR, 1 easy to 5 hard).</p>
          {advice.swings.worsening.length ? <ul className="advlist">{advice.swings.worsening.map((w) => (
            <li key={w.player.id} className="advrow"><span><b>{w.player.name}</b> <small>{tn(p.teams, w.player.team)}</small></span>
              <span className="cost">FDR {w.before.toFixed(1)} → {w.after.toFixed(1)}</span></li>))}</ul> : <p className="hint">No sharp worsening in your squad.</p>}
        </div>
        <div>
          <p className="hint">Easiest upcoming runs</p>
          <ul className="advlist">{advice.swings.easiest.map((e) => (
            <li key={e.team} className="advrow"><span><b>{tn(p.teams, e.team)}</b> <small>{e.fixtures} fixture{e.fixtures === 1 ? '' : 's'}</small></span><span className="cost">avg FDR {e.avg.toFixed(1)}</span></li>))}</ul>
        </div>
      </div>

      {advice.miniLeague && mlOn && (
        <>
          <h3>Mini-league ownership</h3>
          <p className="hint">{strategy === 'chasing' ? 'Chasing: transfers scored xP x (1 - rival EO), favouring differentials.' : 'Protecting: transfers scored xP x (1 + rival EO), favouring covers.'}</p>
          <ul className="advlist cols">{advice.miniLeague.map((r) => (
            <li key={r.player.id} className="advrow"><span>{r.player.name}</span><span className="advnums"><small>EO {(r.eo * 100).toFixed(0)}%</small><span className={`tag ${r.label}`}>{r.label}</span></span></li>))}</ul>
        </>
      )}
    </div>
  )
}
