/**
 * Export parity: generate components from two different projects, build them
 * in a fresh Vite + React app outside this repository (so nothing can resolve
 * through Hinge's own node_modules), then drive the exported components and
 * Hinge's stage with the same input and compare the measured motion.
 */
import { expect, test, type Page } from '@playwright/test'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createProject, type HingeProject } from '../../src/domain/schema'
import { componentName, generateReact, type ExportSources } from '../../src/export/generateReact'
import { springAt } from '../../src/runtime/spring'
import { STORAGE_KEY } from '../../src/storage/projects'
import { alignedDiff, at, modelError, peak, startRecording, stopRecording, type Sample } from './measure'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
const FIXTURE_PORT = 5409
const FIXTURE_URL = `http://localhost:${FIXTURE_PORT}`
const STAGE = '[data-testid="stage-specimen"] > *'
const EXPORTED = '#root > [class^="hinge-"]'

function readSources(): ExportSources {
  const r = (p: string) => readFileSync(join(ROOT, 'src', p), 'utf8')
  return {
    runtime: { 'spring.ts': r('runtime/spring.ts'), 'runtime.ts': r('runtime/runtime.ts'), 'useHinge.ts': r('runtime/useHinge.ts') },
    specimens: {
      card: { tsx: r('specimens/HingeCard.tsx'), css: r('specimens/hinge-card.css') },
      button: { tsx: r('specimens/HingeButton.tsx'), css: r('specimens/hinge-button.css') },
      token: { tsx: r('specimens/HingeToken.tsx'), css: r('specimens/hinge-token.css') },
    },
  }
}

function makeCases(): Record<string, HingeProject> {
  const a = createProject({ specimen: 'card', recipe: 'lift', name: 'Parity A' })
  a.behavior.hover.spring = { stiffness: 240, damping: 13, mass: 1 }
  a.behavior.hover.pose = { y: -16, scale: 1.05, rotate: -2, lift: 1 }
  const b = createProject({ specimen: 'token', recipe: 'magnet', name: 'Parity B' })
  b.behavior.drag.spring = { stiffness: 320, damping: 9, mass: 0.9 }
  b.behavior.press.spring = { stiffness: 900, damping: 60, mass: 1 }
  return { a, b }
}

const cases = makeCases()
let fixtureDir = ''
let server: ChildProcess | null = null
const buildLog: string[] = []

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  test.setTimeout(240_000)
  fixtureDir = mkdtempSync(join(tmpdir(), 'hinge-export-fixture-'))
  cpSync(join(ROOT, 'export-fixture-template'), fixtureDir, { recursive: true })
  const sources = readSources()
  const imports: string[] = []
  const entries: string[] = []
  for (const [id, project] of Object.entries(cases)) {
    const dir = join(fixtureDir, 'src/generated', id)
    for (const f of generateReact(project, sources)) {
      mkdirSync(dirname(join(dir, f.path)), { recursive: true })
      writeFileSync(join(dir, f.path), f.contents)
    }
    const name = componentName(project.specimen)
    imports.push(`import { ${name} as ${name}_${id} } from './${id}/${name}'`)
    entries.push(`  ${id}: ${name}_${id},`)
  }
  writeFileSync(
    join(fixtureDir, 'src/generated/cases.ts'),
    `import type { ComponentType } from 'react'\n${imports.join('\n')}\n\n` +
      `export const CASES: Record<string, ComponentType<{ onPress?: () => void }>> = {\n${entries.join('\n')}\n}\n`,
  )
  const run = (cmd: string, args: string[]) =>
    buildLog.push(execFileSync(cmd, args, { cwd: fixtureDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
  run('pnpm', ['install', '--prefer-offline', '--ignore-workspace', '--config.confirmModulesPurge=false'])
  run('pnpm', ['run', 'typecheck'])
  run('pnpm', ['run', 'build'])
  server = spawn('pnpm', ['run', 'preview'], { cwd: fixtureDir, stdio: 'ignore' })
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(FIXTURE_URL)).ok) return
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('fixture preview server did not start')
})

test.afterAll(() => {
  server?.kill()
  if (fixtureDir && !process.env.KEEP_FIXTURE) rmSync(fixtureDir, { recursive: true, force: true })
})

async function openHinge(page: Page, project: HingeProject) {
  await page.addInitScript(
    ({ key, value }) => localStorage.setItem(key, value),
    { key: STORAGE_KEY, value: JSON.stringify({ projects: [project], currentId: project.id }) },
  )
  await page.goto('/')
  await expect(page.locator(STAGE)).toBeVisible()
  return STAGE
}

async function openFixture(page: Page, id: string) {
  await page.goto(`${FIXTURE_URL}/?case=${id}`)
  await expect(page.locator(EXPORTED)).toBeVisible()
  return EXPORTED
}

async function centerOf(page: Page, selector: string) {
  const b = (await page.locator(selector).boundingBox())!
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

/** Hover, settle, press, release: returns the hover and press recordings. */
async function hoverAndPress(page: Page, selector: string) {
  await page.mouse.move(2, 2)
  const c = await centerOf(page, selector)
  await startRecording(page, selector, 'pointerenter')
  await page.mouse.move(c.x, c.y)
  await page.waitForTimeout(1600)
  const hover = await stopRecording(page)
  await startRecording(page, selector, 'pointerdown')
  await page.mouse.down()
  await page.waitForTimeout(900)
  const press = await stopRecording(page)
  await page.mouse.up()
  return { hover, press }
}

/** Drag right, hold still, release, record the return. */
async function dragRelease(page: Page, selector: string, distance = 160) {
  const c = await centerOf(page, selector)
  await page.mouse.move(c.x, c.y)
  await page.mouse.down()
  await page.mouse.move(c.x + distance, c.y, { steps: 8 })
  await page.waitForTimeout(1000)
  await startRecording(page, selector, 'pointerup')
  await page.mouse.up()
  await page.waitForTimeout(1800)
  return stopRecording(page)
}

async function flick(page: Page, selector: string) {
  await page.locator(selector).focus()
  await page.waitForTimeout(900)
  await startRecording(page, selector, 'keydown')
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(1800)
  return stopRecording(page)
}

function report(label: string, a: Sample[], b: Sample[], key: keyof Sample, to: number) {
  const d = alignedDiff(a, b, key, 0.034, to)
  const raw = alignedDiff(a, b, key, 0.034, to, 0)
  console.log(`[parity] ${label} ${key}: beyond one frame of timing ${d.toFixed(3)} · raw max |editor − export| ${raw.toFixed(3)}`)
  return d
}

test('case A (card): hover and press motion match the editor', async ({ page }) => {
  const project = cases.a!
  const editor = await hoverAndPress(page, await openHinge(page, project))
  const exported = await hoverAndPress(page, await openFixture(page, 'a'))

  const { pose, spring } = project.behavior.hover
  const model = (t: number) => pose.y * (1 + springAt(spring, -1, 0, t).x)
  expect(modelError(editor.hover, 'y', model, 0, 1.4)).toBeLessThan(1)
  expect(modelError(exported.hover, 'y', model, 0, 1.4)).toBeLessThan(1)
  expect(report('A hover', editor.hover, exported.hover, 'y', 1.4)).toBeLessThan(1)
  expect(report('A hover', editor.hover, exported.hover, 'scale', 1.4)).toBeLessThan(0.004)
  expect(report('A hover', editor.hover, exported.hover, 'rotate', 1.4)).toBeLessThan(0.2)
  // Same overshoot and same resting pose.
  expect(Math.abs(peak(editor.hover, 'y', -1) - peak(exported.hover, 'y', -1))).toBeLessThan(0.3)
  expect(at(exported.hover, 'y', 1.5)).toBeCloseTo(pose.y, 1)
  expect(at(exported.hover, 'rotate', 1.5)).toBeCloseTo(pose.rotate, 1)
  expect(report('A press', editor.press, exported.press, 'scale', 0.8)).toBeLessThan(0.004)
  expect(at(exported.press, 'scale', 0.85)).toBeCloseTo(project.behavior.press.pose.scale, 2)
})

test('case A (card): drag release matches the editor', async ({ page }) => {
  const project = cases.a!
  // 100 px stays inside the free radius and keeps the pointer over the card as it
  // returns, so no pointerleave (which browsers fire nondeterministically for a
  // stationary pointer) changes the state mid-measurement.
  const editor = await dragRelease(page, await openHinge(page, project), 100)
  const exported = await dragRelease(page, await openFixture(page, 'a'), 100)
  const { spring } = project.behavior.drag
  const x0 = 100
  const releaseModel = (t: number) => springAt(spring, x0, 0, t).x
  expect(modelError(exported, 'x', releaseModel, 0, 1.6)).toBeLessThan(1.5)
  expect(report('A release', editor, exported, 'x', 1.6)).toBeLessThan(1.5)
  expect(Math.abs(at(exported, 'x', 1.75))).toBeLessThan(0.2)
})

test('case B (token): keyboard flick and press match the editor', async ({ page }) => {
  const project = cases.b!
  const editorFlick = await flick(page, await openHinge(page, project))
  const exportedFlick = await flick(page, await openFixture(page, 'b'))
  const model = (t: number) => springAt(project.behavior.drag.spring, 0, 900, t).x
  expect(modelError(exportedFlick, 'x', model, 0, 1.6)).toBeLessThan(1.2)
  expect(report('B flick', editorFlick, exportedFlick, 'x', 1.6)).toBeLessThan(1.2)
  expect(Math.abs(peak(editorFlick, 'x', 1) - peak(exportedFlick, 'x', 1))).toBeLessThan(0.6)

  // Keyboard activation calls onPress in the exported component.
  await page.locator(EXPORTED).focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press(' ')
  await expect(page.getByTestId('press-count')).toHaveText('2')
  await expect(page.locator(EXPORTED)).toHaveAttribute('role', 'button')
  await expect(page.locator(EXPORTED)).toHaveAttribute('aria-roledescription', 'draggable token')
})

test('case B (token): drag release differs from case A, as configured', async ({ page }) => {
  const a = await dragRelease(page, await openFixture(page, 'a'))
  const b = await dragRelease(page, await openFixture(page, 'b'))
  // B: short leash and a bouncier spring → smaller start, visible overshoot past 0.
  expect(at(b, 'x', 0)).toBeLessThan(at(a, 'x', 0))
  expect(peak(b, 'x', -1)).toBeLessThan(-2)
  expect(peak(a, 'x', -1)).toBeGreaterThan(peak(b, 'x', -1))
})

test('exported component: touch tap and reduced motion', async ({ browser }) => {
  const touch = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 844 } })
  const tp = await touch.newPage()
  await openFixture(tp, 'a')
  const c = await centerOf(tp, EXPORTED)
  await tp.touchscreen.tap(c.x, c.y)
  await expect(tp.getByTestId('press-count')).toHaveText('1')
  await expect(tp.locator(EXPORTED)).toHaveAttribute('data-hinge-state', 'rest')
  await touch.close()

  const reduced = await browser.newContext({ reducedMotion: 'reduce' })
  const rp = await reduced.newPage()
  await openFixture(rp, 'a')
  const rc = await centerOf(rp, EXPORTED)
  await startRecording(rp, EXPORTED, 'pointerenter')
  await rp.mouse.move(rc.x, rc.y)
  await rp.waitForTimeout(300)
  const samples = await stopRecording(rp)
  const target = cases.a!.behavior.hover.pose.y
  for (const s of samples) expect(Math.min(Math.abs(s.y), Math.abs(s.y - target))).toBeLessThan(0.05)
  expect(samples[samples.length - 1]!.y).toBeCloseTo(target, 1)
  await reduced.close()
})

test('mount / unmount leaves no running animation or window listeners', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __raf: number; __blur: number }
    w.__raf = 0
    w.__blur = 0
    const raf = window.requestAnimationFrame.bind(window)
    window.requestAnimationFrame = (cb) => { w.__raf++; return raf(cb) }
    const add = window.addEventListener.bind(window)
    const remove = window.removeEventListener.bind(window)
    window.addEventListener = ((type: string, ...rest: unknown[]) => { if (type === 'blur') w.__blur++; return (add as (...a: unknown[]) => void)(type, ...rest) }) as typeof window.addEventListener
    window.removeEventListener = ((type: string, ...rest: unknown[]) => { if (type === 'blur') w.__blur--; return (remove as (...a: unknown[]) => void)(type, ...rest) }) as typeof window.removeEventListener
  })
  await openFixture(page, 'a')
  const toggle = page.getByTestId('toggle')
  const baseline = await page.evaluate(() => (window as unknown as { __blur: number }).__blur)
  expect(baseline).toBeGreaterThan(0)
  for (let i = 0; i < 10; i++) {
    const c = await centerOf(page, EXPORTED)
    await page.mouse.move(c.x, c.y) // start a hover animation…
    await toggle.click() // …and unmount mid-flight
    await toggle.click()
    await expect(page.locator(EXPORTED)).toBeVisible()
  }
  await toggle.click()
  await page.waitForTimeout(100)
  const counts = await page.evaluate(async () => {
    const w = window as unknown as { __raf: number; __blur: number }
    const before = w.__raf
    await new Promise((r) => setTimeout(r, 500))
    return { rafDuringIdle: w.__raf - before, blurListeners: w.__blur }
  })
  expect(counts.rafDuringIdle).toBe(0)
  expect(counts.blurListeners).toBe(baseline - 1)
})
