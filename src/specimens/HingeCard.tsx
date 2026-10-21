import type { ReactNode } from 'react'
import { useHinge, type UseHingeOptions } from '../runtime/useHinge'
import type { HingeBehavior } from '../runtime/runtime'
// @hinge:behavior-start
import { CARD_BEHAVIOR as BEHAVIOR } from './defaults'
// @hinge:behavior-end
import './hinge-card.css'

export interface HingeCardProps extends UseHingeOptions {
  behavior?: HingeBehavior
  eyebrow?: string
  title?: string
  children?: ReactNode
  /** accessible name; defaults to the title */
  label?: string
}

export function HingeCard({
  behavior = BEHAVIOR,
  eyebrow = 'No. 01 — Object study',
  title = 'Porcelain',
  children = 'Hover to lift it, press to seat it, drag it and let go.',
  label,
  ...options
}: HingeCardProps) {
  const ref = useHinge<HTMLDivElement>(behavior, options)
  return (
    <div
      ref={ref}
      className="hinge-card"
      role="button"
      tabIndex={0}
      aria-label={label ?? title}
      aria-roledescription={behavior.drag.enabled ? 'draggable card' : undefined}
      style={{ touchAction: behavior.drag.enabled ? 'none' : 'manipulation' }}
    >
      <div className="hinge-card__plate" aria-hidden="true">
        <svg viewBox="0 0 120 80" className="hinge-card__mark">
          <circle cx="60" cy="40" r="26" />
          <circle cx="60" cy="40" r="16" />
          <path d="M18 66 L102 14" />
          <circle cx="60" cy="40" r="3" className="hinge-card__pin" />
        </svg>
      </div>
      <p className="hinge-card__eyebrow">{eyebrow}</p>
      <p className="hinge-card__title">{title}</p>
      <p className="hinge-card__body">{children}</p>
    </div>
  )
}
