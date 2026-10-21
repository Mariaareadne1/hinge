/**
 * Hinge runtime — the interaction state machine and spring animator that drives
 * a single element. Hinge's stage and every exported component run this exact
 * file, which is how "what you feel in Hinge is what you ship" is kept true.
 *
 * States: rest → hover → press → drag. Pointer, touch and keyboard input are
 * mapped onto those states; each visual channel (x, y, scale, rotate, lift)
 * springs toward the pose of the current state using the analytic solver in
 * ./spring. Positions are written straight to the element's style in a
 * requestAnimationFrame loop that only runs while something is moving.
 *
 * Copied verbatim into exported components. Depends only on ./spring.
 */
import { sanitizeSpring, springAt, type SpringParams } from './spring'

export type { SpringParams } from './spring'

export interface Pose {
  /** vertical offset in px (negative lifts the element up) */
  y: number
  scale: number
  /** degrees */
  rotate: number
  /** 0–1 elevation, exposed to CSS as --hinge-lift for shadows */
  lift: number
}

export type DragAxis = 'both' | 'x' | 'y'

export interface HingeBehavior {
  hover: { pose: Pose; spring: SpringParams }
  press: { pose: Pose; spring: SpringParams }
  drag: {
    enabled: boolean
    axis: DragAxis
    /** px the element travels freely before the rubber band engages */
    radius: number
    /** 0 = hard stop at the radius, 1 = no resistance */
    elasticity: number
    scale: number
    lift: number
    /** degrees of tilt per 1000 px/s of horizontal drag velocity */
    tilt: number
    /** spring used for the release back to rest */
    spring: SpringParams
  }
}

export type InteractionState = 'rest' | 'hover' | 'press' | 'drag'

export interface ChannelValues {
  x: number
  y: number
  scale: number
  rotate: number
  lift: number
}

type Channel = keyof ChannelValues

export interface RuntimeOptions {
  reducedMotion?: boolean
  /** fired on click / tap / Enter / Space when the gesture was not a drag */
  onPress?: () => void
  /** observation hook: every rendered frame, plus every state change */
  onFrame?: (values: Readonly<ChannelValues>, state: InteractionState) => void
}

export const REST_POSE: Pose = { y: 0, scale: 1, rotate: 0, lift: 0 }

const CHANNELS: Channel[] = ['x', 'y', 'scale', 'rotate', 'lift']
const DRAG_THRESHOLD_PX = 4
const VELOCITY_WINDOW_MS = 80
const MAX_TILT_DEG = 14
const KEYBOARD_FLICK_PX_PER_S = 900
/** per-channel precision below which a spring counts as settled */
const SETTLE_EPSILON: Record<Channel, number> = { x: 0.05, y: 0.05, scale: 0.0005, rotate: 0.02, lift: 0.002 }

interface Segment {
  /** value the spring is heading toward */
  target: number
  /** displacement and velocity when the segment started */
  x0: number
  v0: number
  /** start time in seconds (performance.now / 1000) */
  t0: number
  spring: SpringParams
  /** true while the channel is pinned to the pointer instead of springing */
  pinned: boolean
  settled: boolean
}

const now = () => performance.now() / 1000

export class HingeRuntime {
  private el: HTMLElement
  private behavior: HingeBehavior
  private options: RuntimeOptions
  private state: InteractionState = 'rest'
  private focused = false
  private keyPressing = false
  private segments: Record<Channel, Segment>
  private raf = 0
  private pointerId: number | null = null
  private pointerType = ''
  private origin = { x: 0, y: 0 }
  private samples: Array<{ t: number; x: number; y: number }> = []
  private dragOffset = { x: 0, y: 0 }
  private destroyed = false
  private cleanup: Array<() => void> = []

  constructor(el: HTMLElement, behavior: HingeBehavior, options: RuntimeOptions = {}) {
    this.el = el
    this.behavior = normalizeBehavior(behavior)
    this.options = options
    const t = now()
    const seg = (target: number): Segment => ({
      target, x0: 0, v0: 0, t0: t, spring: this.behavior.hover.spring, pinned: false, settled: true,
    })
    this.segments = { x: seg(0), y: seg(0), scale: seg(1), rotate: seg(0), lift: seg(0) }
    this.listen()
    this.render(t)
  }

  /** Swap behavior live. Moving channels keep their position and velocity. */
  setBehavior(behavior: HingeBehavior): void {
    this.behavior = normalizeBehavior(behavior)
    if (!this.behavior.drag.enabled && this.state === 'drag') this.release(false)
    this.retarget(this.springFor(this.state, this.state))
  }

  setOptions(options: RuntimeOptions): void {
    this.options = options
    this.retarget(this.springFor(this.state, this.state))
  }

  getState(): InteractionState {
    return this.state
  }

  /** Current channel values, computed from the analytic springs. */
  getValues(t = now()): ChannelValues {
    const out = {} as ChannelValues
    for (const c of CHANNELS) out[c] = this.valueOf(c, t).value
    return out
  }

  destroy(): void {
    this.destroyed = true
    cancelAnimationFrame(this.raf)
    if (this.pointerId !== null && this.el.hasPointerCapture?.(this.pointerId)) {
      this.el.releasePointerCapture(this.pointerId)
    }
    for (const off of this.cleanup) off()
    this.cleanup = []
  }

  // ── input ────────────────────────────────────────────────────────────────

  private listen(): void {
    const on = <K extends keyof HTMLElementEventMap>(
      target: HTMLElement | Window, type: K, fn: (e: HTMLElementEventMap[K]) => void,
    ) => {
      target.addEventListener(type, fn as EventListener)
      this.cleanup.push(() => target.removeEventListener(type, fn as EventListener))
    }
    on(this.el, 'pointerenter', (e) => this.onEnter(e))
    on(this.el, 'pointerleave', (e) => this.onLeave(e))
    on(this.el, 'pointerdown', (e) => this.onDown(e))
    on(this.el, 'pointermove', (e) => this.onMove(e))
    on(this.el, 'pointerup', (e) => this.onUp(e))
    on(this.el, 'pointercancel', (e) => this.onCancel(e))
    on(this.el, 'lostpointercapture', (e) => this.onLostCapture(e))
    on(this.el, 'focus', () => this.onFocus())
    on(this.el, 'blur', () => this.onBlur())
    on(this.el, 'keydown', (e) => this.onKeyDown(e))
    on(this.el, 'keyup', (e) => this.onKeyUp(e))
    // Dragging an element natively (images, text) would steal the gesture.
    on(this.el, 'dragstart', (e) => e.preventDefault())
    on(window, 'blur', () => this.cancelAll())
  }

  private onEnter(e: PointerEvent): void {
    if (e.pointerType === 'touch') return
    if (this.state === 'rest') this.setState('hover')
  }

  private onLeave(e: PointerEvent): void {
    if (e.pointerType === 'touch') return
    if (this.state === 'hover' && !this.focused) this.setState('rest')
  }

  private onDown(e: PointerEvent): void {
    if (e.button !== 0) return
    if (this.pointerId !== null) {
      // A second finger or pointer joined mid-gesture: treat it as a cancel.
      this.cancelAll()
      return
    }
    this.pointerId = e.pointerId
    this.pointerType = e.pointerType
    this.origin = { x: e.clientX, y: e.clientY }
    this.samples = [{ t: e.timeStamp, x: e.clientX, y: e.clientY }]
    this.dragOffset = { x: 0, y: 0 }
    try {
      this.el.setPointerCapture(e.pointerId)
    } catch {
      // Synthetic or already-ended pointers cannot be captured; the gesture still works.
    }
    this.setState('press')
  }

  private onMove(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return
    this.samples.push({ t: e.timeStamp, x: e.clientX, y: e.clientY })
    while (this.samples.length > 2 && e.timeStamp - this.samples[0]!.t > VELOCITY_WINDOW_MS) this.samples.shift()

    const dx = e.clientX - this.origin.x
    const dy = e.clientY - this.origin.y
    if (this.state === 'press' && this.behavior.drag.enabled && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
      this.setState('drag')
    }
    if (this.state === 'drag') {
      this.dragOffset = this.constrain(dx, dy)
      this.pin('x', this.dragOffset.x)
      this.pin('y', this.dragOffset.y)
      this.retargetTilt()
      this.schedule()
    }
  }

  private onUp(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return
    const inside = this.isInside(e.clientX, e.clientY)
    // Touch has no hover: a finger lifting off leaves the element at rest.
    const hovering = (inside && this.pointerType !== 'touch') || this.focused
    const wasPress = this.state === 'press'
    if (this.state === 'drag') this.release(hovering)
    else if (wasPress) this.setState(hovering ? 'hover' : 'rest')
    this.endPointer()
    if (wasPress && inside) this.options.onPress?.()
  }

  private onCancel(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return
    this.cancelAll()
  }

  private onLostCapture(e: PointerEvent): void {
    if (e.pointerId !== this.pointerId) return
    // Capture can be lost without a pointerup (e.g. the element was hidden).
    if (this.state === 'press' || this.state === 'drag') this.cancelAll()
  }

  private onFocus(): void {
    // Only keyboard focus stands in for hover; focus from a click or tap does not.
    this.focused = matchesFocusVisible(this.el)
    if (this.focused && this.state === 'rest') this.setState('hover')
  }

  private onBlur(): void {
    this.focused = false
    this.keyPressing = false
    if (this.pointerId === null && this.state !== 'rest') this.setState('rest')
  }

  private onKeyDown(e: KeyboardEvent): void {
    this.focused = true
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      if (e.repeat || this.pointerId !== null) return
      this.keyPressing = true
      this.setState('press')
      return
    }
    const flick = this.behavior.drag.enabled ? arrowVector(e.key, this.behavior.drag.axis) : null
    if (flick && this.pointerId === null) {
      e.preventDefault()
      this.flick(flick.x * KEYBOARD_FLICK_PX_PER_S, flick.y * KEYBOARD_FLICK_PX_PER_S)
    }
    if (e.key === 'Escape' && this.state !== 'rest') this.cancelAll()
  }

  private onKeyUp(e: KeyboardEvent): void {
    if ((e.key === ' ' || e.key === 'Enter') && this.keyPressing) {
      e.preventDefault()
      this.keyPressing = false
      this.setState(this.focused ? 'hover' : 'rest')
      this.options.onPress?.()
    }
  }

  // ── state ────────────────────────────────────────────────────────────────

  private setState(next: InteractionState): void {
    if (next === this.state) return
    const spring = this.springFor(this.state, next)
    this.state = next
    this.retarget(spring)
  }

  /** The more active of the two states owns the transition's spring. */
  private springFor(from: InteractionState, to: InteractionState): SpringParams {
    if (from === 'drag' || to === 'drag') return this.behavior.drag.spring
    if (from === 'press' || to === 'press') return this.behavior.press.spring
    return this.behavior.hover.spring
  }

  private poseFor(state: InteractionState): Pose & { x: number } {
    const b = this.behavior
    if (state === 'hover') return { ...b.hover.pose, x: 0 }
    if (state === 'press') return { ...b.press.pose, x: 0 }
    if (state === 'drag') return { y: 0, x: 0, rotate: 0, scale: b.drag.scale, lift: b.drag.lift }
    return { ...REST_POSE, x: 0 }
  }

  private retarget(spring: SpringParams): void {
    const pose = this.poseFor(this.state)
    const t = now()
    for (const c of CHANNELS) {
      const seg = this.segments[c]
      if (this.state === 'drag' && (c === 'x' || c === 'y' || c === 'rotate')) {
        // x/y follow the pointer; rotate follows drag velocity (retargetTilt).
        if (c === 'rotate') this.springTo(c, seg.target, spring, t)
        continue
      }
      this.springTo(c, pose[c], spring, t)
    }
    this.schedule()
    this.options.onFrame?.(this.getValues(t), this.state)
  }

  private springTo(c: Channel, target: number, spring: SpringParams, t = now()): void {
    const current = this.segments[c]
    // A transition that leaves this channel's target unchanged must not swap the
    // spring of motion already in flight (e.g. a drag release gliding home).
    if (!current.pinned && current.target === target && !this.options.reducedMotion) return
    const { value, velocity } = this.valueOf(c, t)
    if (this.options.reducedMotion) {
      this.segments[c] = { target, x0: 0, v0: 0, t0: t, spring, pinned: false, settled: true }
      return
    }
    this.segments[c] = {
      target, x0: value - target, v0: velocity, t0: t, spring, pinned: false,
      settled: Math.abs(value - target) < SETTLE_EPSILON[c] && Math.abs(velocity) < SETTLE_EPSILON[c] * 10,
    }
  }

  /** Pin a channel to an exact value (pointer-following), keeping its velocity estimate. */
  private pin(c: Channel, value: number): void {
    const v = c === 'x' || c === 'y' ? this.pointerVelocity()[c] : 0
    this.segments[c] = { target: value, x0: 0, v0: v, t0: now(), spring: this.behavior.drag.spring, pinned: true, settled: false }
  }

  private retargetTilt(): void {
    const { tilt } = this.behavior.drag
    const vx = this.pointerVelocity().x
    const target = this.options.reducedMotion ? 0 : clamp((vx / 1000) * tilt, -MAX_TILT_DEG, MAX_TILT_DEG)
    if (Math.abs(target - this.segments.rotate.target) > 0.05) {
      this.springTo('rotate', target, this.behavior.drag.spring)
    }
  }

  private release(inside: boolean): void {
    const v = this.options.reducedMotion ? { x: 0, y: 0 } : this.pointerVelocity()
    const spring = this.behavior.drag.spring
    const t = now()
    this.state = inside || this.focused ? 'hover' : 'rest'
    const pose = this.poseFor(this.state)
    for (const c of ['x', 'y'] as const) {
      const value = this.segments[c].target
      const target = pose[c]
      this.segments[c] = this.options.reducedMotion
        ? { target, x0: 0, v0: 0, t0: t, spring, pinned: false, settled: true }
        : { target, x0: value - target, v0: v[c], t0: t, spring, pinned: false, settled: false }
    }
    for (const c of ['scale', 'rotate', 'lift'] as const) this.springTo(c, pose[c], spring, t)
    this.schedule()
    this.options.onFrame?.(this.getValues(t), this.state)
  }

  /** Keyboard equivalent of a fling: an impulse handed to the release spring. */
  private flick(vx: number, vy: number): void {
    if (this.options.reducedMotion) return
    const t = now()
    const spring = this.behavior.drag.spring
    for (const [c, v] of [['x', vx], ['y', vy]] as const) {
      const cur = this.valueOf(c, t)
      this.segments[c] = { target: 0, x0: cur.value, v0: cur.velocity + v, t0: t, spring, pinned: false, settled: false }
    }
    this.schedule()
  }

  private cancelAll(): void {
    const wasDragging = this.state === 'drag'
    this.keyPressing = false
    if (wasDragging) this.release(false)
    else if (this.state !== 'rest') this.setState(this.focused ? 'hover' : 'rest')
    this.endPointer()
  }

  private endPointer(): void {
    if (this.pointerId !== null && this.el.hasPointerCapture?.(this.pointerId)) {
      try {
        this.el.releasePointerCapture(this.pointerId)
      } catch {
        // Already released by the browser.
      }
    }
    this.pointerId = null
    this.samples = []
  }

  // ── geometry ─────────────────────────────────────────────────────────────

  private constrain(dx: number, dy: number): { x: number; y: number } {
    const { axis, radius, elasticity } = this.behavior.drag
    const x = axis === 'y' ? 0 : dx
    const y = axis === 'x' ? 0 : dy
    const dist = Math.hypot(x, y)
    if (dist <= radius || dist === 0) return { x, y }
    const scaled = radius + (dist - radius) * elasticity
    return { x: (x / dist) * scaled, y: (y / dist) * scaled }
  }

  private pointerVelocity(): { x: number; y: number } {
    const first = this.samples[0]
    const last = this.samples[this.samples.length - 1]
    if (!first || !last || last.t - first.t < 1) return { x: 0, y: 0 }
    if (performance.now() - last.t > VELOCITY_WINDOW_MS) return { x: 0, y: 0 }
    const dt = (last.t - first.t) / 1000
    const { axis } = this.behavior.drag
    return {
      x: axis === 'y' ? 0 : (last.x - first.x) / dt,
      y: axis === 'x' ? 0 : (last.y - first.y) / dt,
    }
  }

  private isInside(x: number, y: number): boolean {
    const r = this.el.getBoundingClientRect()
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
  }

  // ── animation ────────────────────────────────────────────────────────────

  private valueOf(c: Channel, t: number): { value: number; velocity: number } {
    const seg = this.segments[c]
    if (seg.pinned || seg.settled) return { value: seg.target, velocity: seg.pinned ? seg.v0 : 0 }
    const s = springAt(seg.spring, seg.x0, seg.v0, t - seg.t0)
    return { value: seg.target + s.x, velocity: s.v }
  }

  private schedule(): void {
    if (this.raf || this.destroyed) return
    this.raf = requestAnimationFrame(this.frame)
  }

  private frame = (): void => {
    this.raf = 0
    if (this.destroyed) return
    const t = now()
    let moving = this.state === 'drag'
    // A held but motionless pointer has zero velocity, so the tilt relaxes.
    if (moving) this.retargetTilt()
    for (const c of CHANNELS) {
      const seg = this.segments[c]
      if (seg.pinned || seg.settled) continue
      const { value, velocity } = this.valueOf(c, t)
      if (Math.abs(value - seg.target) < SETTLE_EPSILON[c] && Math.abs(velocity) < SETTLE_EPSILON[c] * 10) {
        seg.settled = true
      } else {
        moving = true
      }
    }
    this.render(t)
    if (moving) this.schedule()
  }

  private render(t: number): void {
    const v = this.getValues(t)
    this.el.style.transform =
      `translate3d(${round(v.x)}px, ${round(v.y)}px, 0) rotate(${round(v.rotate)}deg) scale(${round(v.scale, 4)})`
    this.el.style.setProperty('--hinge-lift', String(round(Math.max(0, v.lift), 4)))
    this.el.dataset.hingeState = this.state
    this.options.onFrame?.(v, this.state)
  }
}

function matchesFocusVisible(el: HTMLElement): boolean {
  try {
    return el.matches(':focus-visible')
  } catch {
    return true
  }
}

function arrowVector(key: string, axis: DragAxis): { x: number; y: number } | null {
  const v = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } }[key]
  if (!v) return null
  if ((axis === 'x' && v.x === 0) || (axis === 'y' && v.y === 0)) return null
  return v
}

function normalizeBehavior(b: HingeBehavior): HingeBehavior {
  return {
    hover: { pose: b.hover.pose, spring: sanitizeSpring(b.hover.spring) },
    press: { pose: b.press.pose, spring: sanitizeSpring(b.press.spring) },
    drag: {
      ...b.drag,
      radius: Math.max(0, b.drag.radius),
      elasticity: clamp(b.drag.elasticity, 0, 1),
      spring: sanitizeSpring(b.drag.spring),
    },
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

function round(v: number, digits = 3): number {
  const f = 10 ** digits
  return Math.round(v * f) / f
}
