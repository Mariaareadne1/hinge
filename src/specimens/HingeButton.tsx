import type { ReactNode } from 'react'
import { useHinge, type UseHingeOptions } from '../runtime/useHinge'
import type { HingeBehavior } from '../runtime/runtime'
// @hinge:behavior-start
import { BUTTON_BEHAVIOR as BEHAVIOR } from './defaults'
// @hinge:behavior-end
import './hinge-button.css'

export interface HingeButtonProps extends UseHingeOptions {
  behavior?: HingeBehavior
  children?: ReactNode
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
}

export function HingeButton({
  behavior = BEHAVIOR,
  children = 'Continue',
  type = 'button',
  disabled = false,
  ...options
}: HingeButtonProps) {
  const ref = useHinge<HTMLButtonElement>(behavior, options)
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      className="hinge-button"
      style={{ touchAction: behavior.drag.enabled ? 'none' : 'manipulation' }}
    >
      <span>{children}</span>
      <svg viewBox="0 0 16 16" aria-hidden="true" className="hinge-button__arrow">
        <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" />
      </svg>
    </button>
  )
}
