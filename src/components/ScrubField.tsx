import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'

export interface ScrubFieldProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit?: string
  /** digits shown in the numeric field */
  precision?: number
  hint?: string
  onPreview: (value: number) => void
  onCommit: () => void
}

/** Shift while scrubbing moves this much slower. */
const FINE = 0.1

/**
 * A scrub track + numeric entry bound to one runtime parameter. Dragging the
 * track is relative to where the gesture began, so the value never jumps on
 * first contact; Shift scrubs finer. A drag previews continuously and commits
 * once (one undo step). Typed values apply on Enter / blur.
 */
export function ScrubField({ label, value, min, max, step, unit, precision = 0, hint, onPreview, onCommit }: ScrubFieldProps) {
  const id = useId()
  const [draft, setDraft] = useState<string | null>(null)
  const [scrubbing, setScrubbing] = useState(false)
  const gesture = useRef<{ x: number; value: number; width: number; moved: boolean; fine: boolean } | null>(null)
  const invalid = draft !== null && !isValid(draft, min, max)

  useEffect(() => {
    setDraft(null)
  }, [value])

  const applyDraft = () => {
    if (draft === null) return
    if (isValid(draft, min, max)) {
      onPreview(Number(draft))
      onCommit()
    }
    setDraft(null)
  }

  const set = (v: number) => onPreview(snap(clamp(v, min, max), step))
  const fill = ((value - min) / (max - min)) * 100
  const endGesture = () => {
    if (gesture.current?.moved) onCommit()
    gesture.current = null
    setScrubbing(false)
  }

  return (
    <div className={`scrub${scrubbing ? ' is-scrubbing' : ''}`}>
      <label htmlFor={`${id}-n`} className="scrub__label">{label}</label>
      <span className="scrub__value">
        <input
          id={`${id}-n`}
          className="scrub__number"
          type="text"
          inputMode="decimal"
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? `${id}-err` : hint ? `${id}-hint` : undefined}
          value={draft ?? value.toFixed(precision)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={applyDraft}
          onKeyDown={(e) => {
            if (e.key === 'Enter') applyDraft()
            if (e.key === 'Escape') setDraft(null)
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault()
              set(value + (e.key === 'ArrowUp' ? step : -step) * (e.shiftKey ? 10 : 1))
              onCommit()
            }
          }}
        />
        {unit && <span className="scrub__unit">{unit}</span>}
      </span>
      <div
        className="scrub__track"
        role="slider"
        tabIndex={0}
        aria-label={`${label} slider`}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Number(value.toFixed(precision))}
        aria-valuetext={`${value.toFixed(precision)}${unit ? ` ${unit}` : ''}`}
        style={{ '--fill': `${clamp(fill, 0, 100)}%` } as CSSProperties}
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.currentTarget.setPointerCapture(e.pointerId)
          gesture.current = { x: e.clientX, value, width: e.currentTarget.getBoundingClientRect().width, moved: false, fine: e.shiftKey }
          setScrubbing(true)
        }}
        onPointerMove={(e) => {
          const g = gesture.current
          if (!g) return
          if (e.shiftKey !== g.fine) {
            // Changing precision mid-gesture rebases from here, so the value never jumps.
            g.x = e.clientX
            g.value = value
            g.fine = e.shiftKey
          }
          const dx = e.clientX - g.x
          if (!g.moved && Math.abs(dx) < 1) return
          g.moved = true
          set(g.value + (dx / g.width) * (max - min) * (g.fine ? FINE : 1))
        }}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        onLostPointerCapture={endGesture}
        onKeyDown={(e) => {
          if (e.altKey || e.metaKey || e.ctrlKey) return
          const big = (max - min) / 10
          const next =
            e.key === 'ArrowRight' || e.key === 'ArrowUp' ? value + step * (e.shiftKey ? 10 : 1)
            : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? value - step * (e.shiftKey ? 10 : 1)
            : e.key === 'PageUp' ? value + big
            : e.key === 'PageDown' ? value - big
            : e.key === 'Home' ? min
            : e.key === 'End' ? max
            : null
          if (next === null) return
          e.preventDefault()
          set(next)
          onCommit()
        }}
      >
        <span className="scrub__fill" aria-hidden="true" />
        <span className="scrub__thumb" aria-hidden="true" />
      </div>
      {invalid ? (
        <p id={`${id}-err`} className="scrub__error" role="alert">Enter a number from {min} to {max}.</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="scrub__hint">{hint}</p>
      ) : null}
    </div>
  )
}

function isValid(text: string, min: number, max: number): boolean {
  if (text.trim() === '') return false
  const n = Number(text)
  return Number.isFinite(n) && n >= min && n <= max
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}

/** Round to the step's precision (not to the step itself) so fine scrubs stay fine. */
function snap(v: number, step: number) {
  const digits = Math.max(0, Math.ceil(-Math.log10(step)) + 1)
  return Number(v.toFixed(digits))
}
