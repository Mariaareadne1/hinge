import { sanitizeSpring, type SpringParams } from '../runtime/spring'
import type { DragAxis, HingeBehavior, Pose } from '../runtime/runtime'

export const SCHEMA_VERSION = 1

export type SpecimenKind = 'card' | 'button' | 'token'

export const SPECIMENS: Array<{ kind: SpecimenKind; label: string; note: string }> = [
  { kind: 'card', label: 'Card', note: 'Hover lift, press, drag & release' },
  { kind: 'button', label: 'Button', note: 'Hover and press, no drag' },
  { kind: 'token', label: 'Token', note: 'A chip built to be thrown' },
]

/** The persisted, serialisable unit of work. No functions, DOM or caches. */
export interface HingeProject {
  version: typeof SCHEMA_VERSION
  id: string
  name: string
  specimen: SpecimenKind
  behavior: HingeBehavior
  updatedAt: number
}

export const POSE_LIMITS = {
  y: { min: -40, max: 40 },
  scale: { min: 0.8, max: 1.2 },
  rotate: { min: -15, max: 15 },
  lift: { min: 0, max: 1 },
} as const

export const DRAG_LIMITS = {
  radius: { min: 0, max: 240 },
  elasticity: { min: 0, max: 1 },
  scale: { min: 0.8, max: 1.2 },
  lift: { min: 0, max: 1 },
  tilt: { min: 0, max: 20 },
} as const

export type RecipeId = 'lift' | 'snap' | 'magnet'

const spring = (stiffness: number, damping: number, mass = 1): SpringParams => ({ stiffness, damping, mass })

/**
 * Three recipes that feel physically different, not just numerically:
 *   Lift   — slow, slightly heavy, soft overshoot; a card rising off a desk.
 *   Snap   — stiff and critically damped; arrives fast and never wobbles.
 *   Magnet — light and bouncy; drag pulls hard against a short leash and
 *            springs home with visible oscillation.
 */
export const RECIPES: Record<RecipeId, { label: string; blurb: string; behavior: HingeBehavior }> = {
  lift: {
    label: 'Lift',
    blurb: 'Soft rise, gentle settle',
    behavior: {
      hover: { pose: { y: -10, scale: 1.02, rotate: 0, lift: 1 }, spring: spring(170, 18, 1.2) },
      press: { pose: { y: -3, scale: 0.98, rotate: 0, lift: 0.45 }, spring: spring(420, 30, 1) },
      drag: {
        enabled: true, axis: 'both', radius: 120, elasticity: 0.35, scale: 1.04, lift: 1, tilt: 6,
        spring: spring(180, 16, 1.2),
      },
    },
  },
  snap: {
    label: 'Snap',
    blurb: 'Fast, exact, no wobble',
    behavior: {
      hover: { pose: { y: -4, scale: 1.01, rotate: 0, lift: 0.6 }, spring: spring(900, 60, 1) },
      press: { pose: { y: 0, scale: 0.95, rotate: 0, lift: 0.1 }, spring: spring(1400, 75, 1) },
      drag: {
        enabled: true, axis: 'both', radius: 80, elasticity: 0.15, scale: 1, lift: 0.7, tilt: 0,
        spring: spring(700, 53, 1),
      },
    },
  },
  magnet: {
    label: 'Magnet',
    blurb: 'Short leash, bouncy return',
    behavior: {
      hover: { pose: { y: -6, scale: 1.04, rotate: -1.5, lift: 0.8 }, spring: spring(320, 11, 0.8) },
      press: { pose: { y: 2, scale: 0.94, rotate: 0, lift: 0.2 }, spring: spring(600, 14, 0.8) },
      drag: {
        enabled: true, axis: 'both', radius: 36, elasticity: 0.22, scale: 1.06, lift: 1, tilt: 12,
        spring: spring(260, 7, 0.7),
      },
    },
  },
}

const SPECIMEN_DRAG_DEFAULT: Record<SpecimenKind, boolean> = { card: true, button: false, token: true }

export function behaviorForSpecimen(recipe: RecipeId, specimen: SpecimenKind): HingeBehavior {
  const base = RECIPES[recipe].behavior
  return { ...base, drag: { ...base.drag, enabled: SPECIMEN_DRAG_DEFAULT[specimen] } }
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function createProject(
  { specimen = 'card', recipe = 'lift', name }: { specimen?: SpecimenKind; recipe?: RecipeId; name?: string } = {},
): HingeProject {
  return {
    version: SCHEMA_VERSION,
    id: newId(),
    name: sanitizeName(name ?? `${RECIPES[recipe].label} ${SPECIMENS.find((s) => s.kind === specimen)!.label}`),
    specimen,
    behavior: behaviorForSpecimen(recipe, specimen),
    updatedAt: Date.now(),
  }
}

/** Plain-text names only, at most 48 characters, never empty. */
export function sanitizeName(raw: unknown): string {
  const text = typeof raw === 'string' ? raw : ''
  // eslint-disable-next-line no-control-regex
  const clean = text.replace(/[\u0000-\u001f\u007f\u2028\u2029<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 48)
  return clean || 'Untitled'
}

// ── validation ─────────────────────────────────────────────────────────────

export class SchemaError extends Error {}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function num(v: unknown, path: string, min: number, max: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new SchemaError(`${path} must be a finite number`)
  return Math.min(max, Math.max(min, v))
}

function readSpring(v: unknown, path: string): SpringParams {
  if (!isRecord(v)) throw new SchemaError(`${path} must be an object`)
  return sanitizeSpring({
    stiffness: num(v.stiffness, `${path}.stiffness`, -Infinity, Infinity),
    damping: num(v.damping, `${path}.damping`, -Infinity, Infinity),
    mass: num(v.mass, `${path}.mass`, -Infinity, Infinity),
  })
}

function readPose(v: unknown, path: string): Pose {
  if (!isRecord(v)) throw new SchemaError(`${path} must be an object`)
  return {
    y: num(v.y, `${path}.y`, POSE_LIMITS.y.min, POSE_LIMITS.y.max),
    scale: num(v.scale, `${path}.scale`, POSE_LIMITS.scale.min, POSE_LIMITS.scale.max),
    rotate: num(v.rotate, `${path}.rotate`, POSE_LIMITS.rotate.min, POSE_LIMITS.rotate.max),
    lift: num(v.lift, `${path}.lift`, POSE_LIMITS.lift.min, POSE_LIMITS.lift.max),
  }
}

const AXES: DragAxis[] = ['both', 'x', 'y']

export function readBehavior(v: unknown, path = 'behavior'): HingeBehavior {
  if (!isRecord(v) || !isRecord(v.hover) || !isRecord(v.press) || !isRecord(v.drag)) {
    throw new SchemaError(`${path} must contain hover, press and drag`)
  }
  const d = v.drag
  if (typeof d.enabled !== 'boolean') throw new SchemaError(`${path}.drag.enabled must be a boolean`)
  if (!AXES.includes(d.axis as DragAxis)) throw new SchemaError(`${path}.drag.axis must be both, x or y`)
  return {
    hover: { pose: readPose(v.hover.pose, `${path}.hover.pose`), spring: readSpring(v.hover.spring, `${path}.hover.spring`) },
    press: { pose: readPose(v.press.pose, `${path}.press.pose`), spring: readSpring(v.press.spring, `${path}.press.spring`) },
    drag: {
      enabled: d.enabled,
      axis: d.axis as DragAxis,
      radius: num(d.radius, `${path}.drag.radius`, DRAG_LIMITS.radius.min, DRAG_LIMITS.radius.max),
      elasticity: num(d.elasticity, `${path}.drag.elasticity`, DRAG_LIMITS.elasticity.min, DRAG_LIMITS.elasticity.max),
      scale: num(d.scale, `${path}.drag.scale`, DRAG_LIMITS.scale.min, DRAG_LIMITS.scale.max),
      lift: num(d.lift, `${path}.drag.lift`, DRAG_LIMITS.lift.min, DRAG_LIMITS.lift.max),
      tilt: num(d.tilt, `${path}.drag.tilt`, DRAG_LIMITS.tilt.min, DRAG_LIMITS.tilt.max),
      spring: readSpring(d.spring, `${path}.drag.spring`),
    },
  }
}

/**
 * Parse anything (localStorage, an imported file) into a valid project or
 * throw a SchemaError that says what is wrong. Older versions migrate here.
 */
export function parseProject(raw: unknown): HingeProject {
  if (!isRecord(raw)) throw new SchemaError('project must be an object')
  const migrated = migrate(raw)
  const specimen = migrated.specimen
  if (specimen !== 'card' && specimen !== 'button' && specimen !== 'token') {
    throw new SchemaError('specimen must be card, button or token')
  }
  return {
    version: SCHEMA_VERSION,
    id: typeof migrated.id === 'string' && migrated.id.length > 0 && migrated.id.length < 80 ? migrated.id : newId(),
    name: sanitizeName(migrated.name),
    specimen,
    behavior: readBehavior(migrated.behavior),
    updatedAt: typeof migrated.updatedAt === 'number' && Number.isFinite(migrated.updatedAt) ? migrated.updatedAt : Date.now(),
  }
}

function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  const version = raw.version
  if (version === SCHEMA_VERSION) return raw
  if (typeof version === 'number' && version > SCHEMA_VERSION) {
    throw new SchemaError(`saved with a newer Hinge (schema v${version}); this build reads v${SCHEMA_VERSION}`)
  }
  throw new SchemaError(`unknown schema version ${String(version)}`)
}
