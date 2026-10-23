import { useId, type ReactNode } from 'react'

/** Format a number for a readout: integers as is, others to the precision of their step. */
export function fmt(v: number, step: number): string {
  if (Number.isInteger(step) && Number.isInteger(v)) return String(v)
  const decimals = Math.min(4, Math.max(0, Math.ceil(-Math.log10(step))))
  return v.toFixed(decimals)
}

/** A labelled range input with a monospaced readout. */
export function Dial(props: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
  hint?: string
  onChange: (v: number) => void
}) {
  const id = useId()
  const { label, value, min, max, step, unit, hint, onChange } = props
  return (
    <div className="dial">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <output htmlFor={id} aria-hidden="true">
        {fmt(value, step)}
        {unit ? ` ${unit}` : ''}
      </output>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-describedby={hint ? `${id}-hint` : undefined}
        aria-valuetext={`${fmt(value, step)}${unit ? ` ${unit}` : ''}`}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && (
        <p className="hint" id={`${id}-hint`} style={{ gridColumn: '1 / -1' }}>
          {hint}
        </p>
      )}
    </div>
  )
}

/** A row of radio buttons styled as a segmented switch. */
export function Selector<T extends string | number>(props: {
  legend: string
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (v: T) => void
}) {
  const name = useId()
  return (
    <fieldset style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
      <legend className="label" style={{ padding: 0, marginBottom: 4 }}>
        {props.legend}
      </legend>
      <div className="selector">
        {props.options.map((o) => (
          <label key={String(o.value)}>
            <input
              type="radio"
              name={name}
              value={String(o.value)}
              checked={o.value === props.value}
              onChange={() => props.onChange(o.value)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/** A labelled select. */
export function Choice<T extends string>(props: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  const id = useId()
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {props.label}
      </label>
      <select id={id} value={props.value} onChange={(e) => props.onChange(e.target.value as T)}>
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

/** A labelled whole-number input. */
export function NumberField(props: {
  label: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
}) {
  const id = useId()
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {props.label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={props.min}
        max={props.max}
        value={props.value}
        onChange={(e) => {
          const n = Math.round(Number(e.target.value))
          if (Number.isFinite(n)) props.onChange(Math.min(props.max, Math.max(props.min, n)))
        }}
      />
    </div>
  )
}

const svg = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5 }

export const Icon = {
  download: () => (
    <svg {...svg} aria-hidden="true" strokeLinecap="square">
      <path d="M8 2v8M4.5 6.5 8 10l3.5-3.5M2.5 13.5h11" />
    </svg>
  ),
  rotate: () => (
    <svg {...svg} aria-hidden="true" strokeLinecap="square">
      <path d="M12.5 8A4.5 4.5 0 1 1 8 3.5h3M9.5 1.5l2 2-2 2" />
    </svg>
  ),
  seed: () => (
    <svg {...svg} aria-hidden="true" strokeLinecap="square">
      <rect x="2.5" y="2.5" width="11" height="11" />
      <path d="M5.5 5.5h.01M10.5 10.5h.01M8 8h.01" strokeWidth="2.5" />
    </svg>
  ),
}
