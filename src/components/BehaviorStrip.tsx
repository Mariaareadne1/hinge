import type { InteractionState } from '../runtime/runtime'
import type { EditableState } from './Stage'

interface BehaviorStripProps {
  selected: EditableState
  live: InteractionState
  dragEnabled: boolean
  onSelect: (state: EditableState) => void
}

const CELLS: Array<{ state: InteractionState; label: string; how: string }> = [
  { state: 'rest', label: 'Rest', how: 'origin pose' },
  { state: 'hover', label: 'Hover', how: 'pointer over · keyboard focus' },
  { state: 'press', label: 'Press', how: 'pointer down · Space / Enter' },
  { state: 'drag', label: 'Drag', how: 'drag & release · arrow keys flick' },
]

/**
 * The four states of the interaction, left to right. The live state lights up
 * as you play with the specimen; Hover, Press and Drag are selectable for editing.
 */
export function BehaviorStrip({ selected, live, dragEnabled, onSelect }: BehaviorStripProps) {
  return (
    <nav className="strip" aria-label="Interaction states">
      <div className="strip__cells" role="tablist" aria-label="Edit state">
        {CELLS.map((cell, i) => {
          const editable = cell.state !== 'rest'
          const isSelected = editable && cell.state === selected
          const disabled = cell.state === 'drag' && !dragEnabled
          const body = (
            <>
              <span className="strip__index">0{i + 1}</span>
              <span className="strip__label">{cell.label}</span>
              <span className="strip__how">{disabled ? 'off for this specimen' : cell.how}</span>
              <span className={`strip__lamp${live === cell.state ? ' is-live' : ''}`} aria-hidden="true" />
            </>
          )
          if (!editable) {
            return (
              <div key={cell.state} className="strip__cell strip__cell--static" data-live={live === cell.state || undefined}>
                {body}
              </div>
            )
          }
          return (
            <button
              key={cell.state}
              type="button"
              role="tab"
              id={`tab-${cell.state}`}
              aria-selected={isSelected}
              aria-controls="inspector-panel"
              tabIndex={isSelected ? 0 : -1}
              className={`strip__cell${isSelected ? ' is-selected' : ''}${disabled ? ' is-off' : ''}`}
              data-live={live === cell.state || undefined}
              onClick={() => onSelect(cell.state as EditableState)}
              onKeyDown={(e) => {
                const order: EditableState[] = ['hover', 'press', 'drag']
                const idx = order.indexOf(selected)
                if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                  e.preventDefault()
                  const next = order[(idx + (e.key === 'ArrowRight' ? 1 : order.length - 1)) % order.length]!
                  onSelect(next)
                  document.getElementById(`tab-${next}`)?.focus()
                }
              }}
            >
              {body}
            </button>
          )
        })}
      </div>
      <p className="strip__live" aria-live="polite">
        Live: <strong data-testid="live-state">{live}</strong>
      </p>
    </nav>
  )
}
