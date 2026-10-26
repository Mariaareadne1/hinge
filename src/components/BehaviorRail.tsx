import type { InteractionState } from '../runtime/runtime'
import type { EditableState } from './Stage'

interface BehaviorRailProps {
  selected: EditableState
  live: InteractionState
  dragEnabled: boolean
  onSelect: (state: EditableState) => void
}

const CELLS: Array<{ state: InteractionState; label: string; how: string; key?: string }> = [
  { state: 'rest', label: 'Rest', how: 'origin pose' },
  { state: 'hover', label: 'Hover', how: 'pointer over · focus', key: '2' },
  { state: 'press', label: 'Press', how: 'pointer down · Space', key: '3' },
  { state: 'drag', label: 'Drag', how: 'drag & throw · arrows', key: '4' },
]

const ORDER: EditableState[] = ['hover', 'press', 'drag']

/**
 * The four states of the interaction, top to bottom. Two independent signals:
 * the ink block is the state being edited; the citron mark is the state the
 * object is in right now.
 */
export function BehaviorRail({ selected, live, dragEnabled, onSelect }: BehaviorRailProps) {
  return (
    <nav className="rail" aria-label="Interaction states">
      <div className="rail__cells">
        <RestCell live={live === 'rest'} />
        <div className="rail__tabs" role="tablist" aria-label="Edit state" aria-orientation="vertical">
          {CELLS.slice(1).map((cell, i) => {
            const isSelected = cell.state === selected
            const off = cell.state === 'drag' && !dragEnabled
            return (
              <button
                key={cell.state}
                type="button"
                role="tab"
                id={`tab-${cell.state}`}
                aria-selected={isSelected}
                aria-controls="instrument-panel"
                tabIndex={isSelected ? 0 : -1}
                className={`rail__cell${isSelected ? ' is-selected' : ''}${off ? ' is-off' : ''}`}
                data-live={live === cell.state || undefined}
                onClick={() => onSelect(cell.state as EditableState)}
                onKeyDown={(e) => {
                  if (e.altKey || e.metaKey || e.ctrlKey) return
                  const idx = ORDER.indexOf(selected)
                  const forward = e.key === 'ArrowDown' || e.key === 'ArrowRight'
                  const back = e.key === 'ArrowUp' || e.key === 'ArrowLeft'
                  if (!forward && !back) return
                  e.preventDefault()
                  const next = ORDER[(idx + (forward ? 1 : ORDER.length - 1)) % ORDER.length]!
                  onSelect(next)
                  document.getElementById(`tab-${next}`)?.focus()
                }}
              >
                <CellBody index={i + 2} label={cell.label} how={off ? 'off for this object' : cell.how} keyHint={cell.key} />
              </button>
            )
          })}
        </div>
      </div>
      {/* A visual mirror of the object's state; not a live region — it changes on every pointer move. */}
      <p className="rail__now">
        <span className="rail__now-mark" aria-hidden="true" />Live <strong data-testid="live-state">{live}</strong>
      </p>
    </nav>
  )
}

function CellBody({ index, label, how, keyHint }: { index: number; label: string; how: string; keyHint?: string }) {
  return (
    <>
      <span className="rail__index">0{index}</span>
      <span className="rail__label">{label}</span>
      <span className="rail__how">{how}</span>
      {keyHint && <kbd className="rail__key" aria-hidden="true">{keyHint}</kbd>}
      <span className="rail__live" aria-hidden="true" />
    </>
  )
}

/** Rest is observed, never edited: it is the origin pose, so it sits outside the tablist. */
function RestCell({ live }: { live: boolean }) {
  return (
    <div className="rail__cell rail__cell--static" data-live={live || undefined}>
      <CellBody index={1} label={CELLS[0]!.label} how={CELLS[0]!.how} />
    </div>
  )
}
