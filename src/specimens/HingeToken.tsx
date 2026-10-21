import { useHinge, type UseHingeOptions } from '../runtime/useHinge'
import type { HingeBehavior } from '../runtime/runtime'
// @hinge:behavior-start
import { TOKEN_BEHAVIOR as BEHAVIOR } from './defaults'
// @hinge:behavior-end
import './hinge-token.css'

export interface HingeTokenProps extends UseHingeOptions {
  behavior?: HingeBehavior
  label?: string
  /** short glyph shown in the disc */
  glyph?: string
}

export function HingeToken({ behavior = BEHAVIOR, label = 'Fieldwork', glyph = 'F', ...options }: HingeTokenProps) {
  const ref = useHinge<HTMLDivElement>(behavior, options)
  return (
    <div
      ref={ref}
      className="hinge-token"
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-roledescription={behavior.drag.enabled ? 'draggable token' : undefined}
      style={{ touchAction: behavior.drag.enabled ? 'none' : 'manipulation' }}
    >
      <span className="hinge-token__disc" aria-hidden="true">{glyph}</span>
      <span className="hinge-token__label">{label}</span>
    </div>
  )
}
