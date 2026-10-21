import { SCHEMA_VERSION, sanitizeName, type HingeProject, type SpecimenKind } from '../domain/schema'
import type { HingeBehavior } from '../runtime/runtime'

/** Text of the files an export is built from (see sources.ts / scripts). */
export interface ExportSources {
  runtime: Record<'spring.ts' | 'runtime.ts' | 'useHinge.ts', string>
  specimens: Record<SpecimenKind, { tsx: string; css: string }>
}

export interface ExportFile {
  path: string
  contents: string
}

export const EXPORT_DEPENDENCIES = { react: '>=18.2.0', 'react-dom': '>=18.2.0' } as const

const COMPONENT_NAME: Record<SpecimenKind, string> = { card: 'HingeCard', button: 'HingeButton', token: 'HingeToken' }
const CSS_NAME: Record<SpecimenKind, string> = { card: 'hinge-card.css', button: 'hinge-button.css', token: 'hinge-token.css' }

/** Next.js App Router: components with effects must be client components. Ignored elsewhere. */
const USE_CLIENT = "'use client'\n\n"

const BEHAVIOR_BLOCK = /\/\/ @hinge:behavior-start\n[\s\S]*?\/\/ @hinge:behavior-end\n/

/** Serialise numbers with stable precision so identical projects export byte-identical code. */
function formatBehavior(b: HingeBehavior): string {
  const json = JSON.stringify(b, (_key, value) => (typeof value === 'number' ? Number(value.toFixed(4)) : value), 2)
  // Unquote keys for idiomatic TypeScript.
  return json.replace(/"([a-zA-Z]+)":/g, '$1:').replace(/"/g, "'")
}

export function componentName(kind: SpecimenKind): string {
  return COMPONENT_NAME[kind]
}

/**
 * Turn a project into a self-contained React + TypeScript component folder.
 * The specimen source is the same file Hinge renders on its stage; only the
 * behavior import is replaced with the tuned values and runtime imports are
 * pointed at the bundled copy of the runtime.
 */
export function generateReact(project: HingeProject, sources: ExportSources): ExportFile[] {
  const name = COMPONENT_NAME[project.specimen]
  const css = CSS_NAME[project.specimen]
  const specimen = sources.specimens[project.specimen]

  if (!BEHAVIOR_BLOCK.test(specimen.tsx)) {
    throw new Error(`Specimen source for ${project.specimen} is missing its behavior markers.`)
  }

  const behaviorDecl =
    `// Tuned in Hinge — "${sanitizeName(project.name).replace(/[*/\\]/g, '')}".\n` +
    `const BEHAVIOR: HingeBehavior = ${formatBehavior(project.behavior)}\n`

  // Replacer functions: a string replacement would interpret $&, $' etc. in the name.
  const tsx = USE_CLIENT + specimen.tsx
    .replace(BEHAVIOR_BLOCK, () => behaviorDecl)
    .replace("from '../runtime/useHinge'", "from './hinge/useHinge'")
    .replace("from '../runtime/runtime'", "from './hinge/runtime'")

  const config = {
    $schema: `hinge-project-v${SCHEMA_VERSION}`,
    version: SCHEMA_VERSION,
    name: project.name,
    specimen: project.specimen,
    behavior: project.behavior,
  }

  return [
    { path: `${name}.tsx`, contents: tsx },
    { path: css, contents: specimen.css },
    { path: 'hinge/spring.ts', contents: sources.runtime['spring.ts'] },
    { path: 'hinge/runtime.ts', contents: sources.runtime['runtime.ts'] },
    { path: 'hinge/useHinge.ts', contents: USE_CLIENT + sources.runtime['useHinge.ts'] },
    { path: 'hinge.config.json', contents: JSON.stringify(config, null, 2) + '\n' },
    { path: 'README.md', contents: readme(project, name, css) },
  ]
}

function readme(project: HingeProject, name: string, css: string): string {
  const b = project.behavior
  const spring = (s: { stiffness: number; damping: number; mass: number }) =>
    `stiffness ${s.stiffness.toFixed(0)}, damping ${s.damping.toFixed(1)}, mass ${s.mass.toFixed(2)}`
  return `# ${name}

Exported from [Hinge](https://github.com/Mariaareadne1/hinge) — "${project.name}".

## Use it

Copy this folder into your app, then:

\`\`\`tsx
import { ${name} } from './${name}'

export default function Page() {
  return <${name} onPress={() => console.log('pressed')} />
}
\`\`\`

Requires React 18.2+ (files start with \`'use client'\` for the Next.js App Router) and a bundler that imports CSS from TypeScript (Vite, Next.js,
Parcel, webpack with css-loader). No other dependencies. The \`hinge/\` folder is
the same spring solver and interaction runtime Hinge runs in its editor, so the
motion matches what you tuned.

## Files

| File | What it is |
| --- | --- |
| \`${name}.tsx\` | The component, with your tuned behavior inlined as \`BEHAVIOR\` |
| \`${css}\` | Styles; the runtime writes \`transform\` and \`--hinge-lift\` |
| \`hinge/spring.ts\` | Closed-form damped spring solver |
| \`hinge/runtime.ts\` | Pointer / touch / keyboard state machine and animator |
| \`hinge/useHinge.ts\` | React hook that attaches the runtime to an element |
| \`hinge.config.json\` | The behavior as data, re-importable into Hinge |

## Behavior

| State | Pose | Spring |
| --- | --- | --- |
| Hover / focus | y ${b.hover.pose.y}px, scale ${b.hover.pose.scale}, rotate ${b.hover.pose.rotate}°, lift ${b.hover.pose.lift} | ${spring(b.hover.spring)} |
| Press | y ${b.press.pose.y}px, scale ${b.press.pose.scale}, rotate ${b.press.pose.rotate}°, lift ${b.press.pose.lift} | ${spring(b.press.spring)} |
| Drag / release | ${b.drag.enabled ? `${b.drag.axis} axis, ${b.drag.radius}px free travel, elasticity ${b.drag.elasticity}, tilt ${b.drag.tilt}` : 'disabled'} | ${spring(b.drag.spring)} |

## Accessibility

- Focusable, with Enter / Space producing the press state and calling \`onPress\`.
- When drag is enabled, arrow keys give the element a flick that the release spring
  returns — the keyboard equivalent of throwing it.
- \`prefers-reduced-motion: reduce\` swaps every spring for an instant change; pass
  \`reducedMotion\` to override.

## License

Generated code is yours to use without attribution (MIT-0). The runtime files carry
the same terms.
`
}
