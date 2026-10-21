import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createProject } from '../../src/domain/schema'
import { generateReact, type ExportSources } from '../../src/export/generateReact'
import { createZip } from '../../src/export/createBundle'
import { unzipSync, strFromU8 } from 'fflate'

const read = (p: string) => readFileSync(new URL(`../../src/${p}`, import.meta.url), 'utf8')
const sources: ExportSources = {
  runtime: { 'spring.ts': read('runtime/spring.ts'), 'runtime.ts': read('runtime/runtime.ts'), 'useHinge.ts': read('runtime/useHinge.ts') },
  specimens: {
    card: { tsx: read('specimens/HingeCard.tsx'), css: read('specimens/hinge-card.css') },
    button: { tsx: read('specimens/HingeButton.tsx'), css: read('specimens/hinge-button.css') },
    token: { tsx: read('specimens/HingeToken.tsx'), css: read('specimens/hinge-token.css') },
  },
}

describe('generateReact', () => {
  it('inlines the tuned behavior and never imports Hinge editor modules', () => {
    const p = createProject({ specimen: 'card', recipe: 'snap' })
    p.behavior.hover.spring.stiffness = 777
    const files = generateReact(p, sources)
    const tsx = files.find((f) => f.path === 'HingeCard.tsx')!.contents
    expect(tsx).toContain('const BEHAVIOR: HingeBehavior = {')
    expect(tsx).toContain('stiffness: 777')
    expect(tsx).not.toMatch(/\.\.\/|@hinge:|'.\/defaults'/)
    for (const f of files.filter((f) => /\.tsx?$/.test(f.path))) {
      for (const m of f.contents.matchAll(/from '([^']+)'/g)) {
        expect(['react', './hinge/useHinge', './hinge/runtime', './spring', './runtime']).toContain(m[1])
      }
    }
  })

  it('ships the runtime byte-for-byte', () => {
    const files = generateReact(createProject(), sources)
    expect(files.find((f) => f.path === 'hinge/runtime.ts')!.contents).toBe(sources.runtime['runtime.ts'])
  })

  it('is deterministic and the config round-trips', () => {
    const p = createProject({ specimen: 'token', recipe: 'magnet' })
    expect(generateReact(p, sources)).toEqual(generateReact(p, sources))
    const config = JSON.parse(generateReact(p, sources).find((f) => f.path === 'hinge.config.json')!.contents)
    expect(config.behavior).toEqual(p.behavior)
  })

  it('zips every file under one folder', () => {
    const files = generateReact(createProject({ specimen: 'button' }), sources)
    const zip = unzipSync(createZip('HingeButton', files))
    expect(Object.keys(zip).sort()).toEqual(files.map((f) => `HingeButton/${f.path}`).sort())
    expect(strFromU8(zip['HingeButton/HingeButton.tsx']!)).toBe(files[0]!.contents)
  })

  it('fails loudly if a specimen loses its behavior markers', () => {
    const broken = { ...sources, specimens: { ...sources.specimens, card: { tsx: 'export {}', css: '' } } }
    expect(() => generateReact(createProject(), broken)).toThrow(/markers/)
  })
})

describe('generateReact — hostile names', () => {
  it('names with replacement patterns or line separators cannot alter the code', () => {
    for (const name of ["A $' B", 'x $& y', 'evil\u2028alert(1)', '*/ alert(1) /*']) {
      const p = { ...createProject(), name }
      const tsx = generateReact(p, sources).find((f) => f.path === 'HingeCard.tsx')!.contents
      const comment = tsx.split('\n').find((l) => l.startsWith('// Tuned in Hinge'))!
      expect(comment).not.toMatch(/[\u2028\u2029]/)
      expect(tsx.match(/const BEHAVIOR: HingeBehavior = \{/g)).toHaveLength(1)
      expect(tsx).not.toContain('alert(1)\n')
      expect(tsx.startsWith("'use client'\n")).toBe(true)
    }
  })
})
