import { useId, useState, type ReactNode, type Ref } from 'react'

const KEY = 'fpl.panel.'
const read = (id: string) => { try { return localStorage.getItem(KEY + id) !== '0' } catch { return true } }

/** Card whose header (title + chevron + optional extras) stays visible while the body collapses. State persists per id. */
export default function CollapsiblePanel({ id, title, extra, sectionRef, children }: { id: string; title: ReactNode; extra?: ReactNode; sectionRef?: Ref<HTMLElement>; children: ReactNode }) {
  const [open, setOpen] = useState(() => read(id))
  const bodyId = useId()
  const toggle = () => { const n = !open; setOpen(n); try { localStorage.setItem(KEY + id, n ? '1' : '0') } catch { /* ignore */ } }
  return (
    <section className="card" ref={sectionRef}>
      <div className="bar" style={open ? undefined : { marginBottom: 0 }}>
        <button type="button" className="chevron" onClick={toggle} aria-expanded={open} aria-controls={bodyId} aria-label={`${open ? 'Collapse' : 'Expand'} ${id}`}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style={{ transform: open ? 'none' : 'rotate(-90deg)' }}><path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <h2>{title}</h2>
        {extra}
      </div>
      <div id={bodyId} hidden={!open}>{children}</div>
    </section>
  )
}
