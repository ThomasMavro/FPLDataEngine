import { useEffect, useRef, useState, type ReactNode } from 'react'

/** Closes `onClose` when a mousedown/touch lands outside `ref`. */
export function useOutsideClose(ref: React.RefObject<HTMLElement | null>, open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return
    const h = (e: Event) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    document.addEventListener('mousedown', h); document.addEventListener('touchstart', h)
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('touchstart', h) }
  }, [open, ref, onClose])
}

export function Popover({ label, children, align = 'left' }: { label: ReactNode; children: ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useOutsideClose(ref, open, () => setOpen(false))
  return (
    <div className="pop" ref={ref}>
      <button type="button" className="popbtn" aria-expanded={open} onClick={() => setOpen(!open)}>{label}<span aria-hidden> ▾</span></button>
      {open && <div className={`popmenu ${align}`}>{children}</div>}
    </div>
  )
}

interface Opt { value: number; label: string }
/** Multi-select dropdown: button -> checklist popover with an "All" option. Empty selection means all. */
export default function MultiSelect({ options, selected, onChange, noun, nounAll }: { options: Opt[]; selected: number[]; onChange: (v: number[]) => void; noun: string; nounAll: string }) {
  const sel = selected.filter((v) => options.some((o) => o.value === v))
  const summary = sel.length === 0 || sel.length === options.length ? nounAll : sel.length === 1 ? options.find((o) => o.value === sel[0])!.label : `${sel.length} ${noun}`
  return (
    <Popover label={summary}>
      <label className="opt"><input type="checkbox" checked={sel.length === 0} onChange={() => onChange([])} /> All</label>
      {options.map((o) => (
        <label key={o.value} className="opt"><input type="checkbox" checked={sel.includes(o.value)}
          onChange={() => onChange(sel.includes(o.value) ? sel.filter((v) => v !== o.value) : [...sel, o.value])} /> {o.label}</label>
      ))}
    </Popover>
  )
}
