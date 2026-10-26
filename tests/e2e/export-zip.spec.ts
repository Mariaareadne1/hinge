/**
 * ZIP round trip: tune a project in the editor, download the .zip from the
 * export bench exactly as a user would, unpack it into a fresh Vite + React app
 * outside this repository, type-check, build and serve it, then compare the
 * exported component's hover and drag-release motion with the editor stage.
 */
import { expect, test } from '@playwright/test'
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { unzipSync, strFromU8 } from 'fflate'
import { createProject } from '../../src/domain/schema'
import { springAt } from '../../src/runtime/spring'
import { STORAGE_KEY } from '../../src/storage/projects'
import { alignedDiff, modelError, startRecording, stopRecording } from './measure'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')
const STAGE = '[data-testid="stage-specimen"] > *'
const EXPORTED = '#root form > [class^="hinge-"]'

const project = createProject({ specimen: 'card', recipe: 'magnet', name: 'Zip Round Trip' })
project.behavior.hover.spring = { stiffness: 300, damping: 12, mass: 1 }
project.behavior.hover.pose = { y: -14, scale: 1.03, rotate: 1.5, lift: 1 }

/** Another local project may own any fixed port; ask the OS for a free one. */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.once('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as { port: number }
      srv.close(() => resolve(port))
    })
  })
}

let dir = ''
let server: ChildProcess | null = null

test.describe.configure({ mode: 'serial' })

test.afterAll(() => {
  server?.kill()
  if (dir && !process.env.KEEP_FIXTURE) rmSync(dir, { recursive: true, force: true })
})

test('the downloaded zip builds on its own and moves like the stage', async ({ page }) => {
  test.setTimeout(240_000)
  await page.addInitScript(
    ({ key, value }) => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem(key, value) } },
    { key: STORAGE_KEY, value: JSON.stringify({ projects: [project], currentId: project.id }) },
  )
  await page.goto('/')
  await expect(page.locator(STAGE)).toBeVisible()

  // 1. Download through the real UI.
  await page.getByRole('button', { name: 'Export component' }).click()
  const downloadEvent = page.waitForEvent('download')
  await page.getByRole('dialog').getByRole('button', { name: /Download component/ }).click()
  const download = await downloadEvent
  expect(download.suggestedFilename()).toBe('HingeCard.zip')
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('HingeCard.zip')
  const zipPath = await download.path()
  const entries = unzipSync(readFileSync(zipPath))
  const names = Object.keys(entries).sort()
  expect(names).toEqual([
    'HingeCard/HingeCard.tsx', 'HingeCard/README.md', 'HingeCard/hinge-card.css', 'HingeCard/hinge.config.json',
    'HingeCard/hinge/runtime.ts', 'HingeCard/hinge/spring.ts', 'HingeCard/hinge/useHinge.ts',
  ])
  // The tuned values are in the component source, not a reference to Hinge.
  const tsx = strFromU8(entries['HingeCard/HingeCard.tsx']!)
  expect(tsx).toContain('stiffness: 300')
  expect(tsx).not.toMatch(/from '\.\.\/(runtime|domain|specimens)/)
  await page.keyboard.press('Escape')

  // 2. Unpack into a fresh app outside the repository and build it.
  dir = mkdtempSync(join(tmpdir(), 'hinge-zip-fixture-'))
  cpSync(join(ROOT, 'export-fixture-template'), dir, { recursive: true })
  for (const [name, bytes] of Object.entries(entries)) {
    const out = join(dir, 'src/generated', name)
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, bytes)
  }
  writeFileSync(join(dir, 'src/generated/cases.ts'),
    `import type { ComponentType } from 'react'\nimport { HingeCard } from './HingeCard/HingeCard'\n\n` +
    `export const CASES: Record<string, ComponentType<{ onPress?: () => void; type?: 'submit' }>> = { zip: HingeCard }\n`)
  const run = (args: string[]) => execFileSync('pnpm', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  run(['install', '--prefer-offline', '--ignore-workspace', '--config.confirmModulesPurge=false'])
  run(['run', 'typecheck'])
  run(['run', 'build'])
  const port = await freePort()
  const URL_ = `http://127.0.0.1:${port}`
  server = spawn('pnpm', ['exec', 'vite', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: dir, stdio: 'ignore' })
  let served = ''
  for (let i = 0; i < 120 && !served.includes('/assets/'); i++) {
    try { served = await (await fetch(URL_)).text() } catch { /* not up yet */ }
    if (!served.includes('/assets/')) await new Promise((r) => setTimeout(r, 250))
  }
  // Make sure this is the fixture build, not some other app.
  expect(served).toContain('<title>Hinge export fixture</title>')

  // 3. Same input on both: hover, then a drag released from 100 px.
  const measure = async (selector: string) => {
    await page.mouse.move(2, 2)
    const b = (await page.locator(selector).boundingBox())!
    const c = { x: b.x + b.width / 2, y: b.y + b.height / 2 }
    await startRecording(page, selector, 'pointerenter')
    await page.mouse.move(c.x, c.y)
    await page.waitForTimeout(1400)
    const hover = await stopRecording(page)
    await page.mouse.down()
    await page.mouse.move(c.x + 100, c.y, { steps: 8 })
    await page.waitForTimeout(900)
    await startRecording(page, selector, 'pointerup')
    await page.mouse.up()
    await page.waitForTimeout(1600)
    return { hover, release: await stopRecording(page) }
  }
  const editor = await measure(STAGE)
  await page.goto(`${URL_}/?case=zip`)
  await expect(page.locator(EXPORTED)).toBeVisible()
  const exported = await measure(EXPORTED)

  const hoverModel = (t: number) => project.behavior.hover.pose.y * (1 + springAt(project.behavior.hover.spring, -1, 0, t).x)
  expect(modelError(exported.hover, 'y', hoverModel, 0, 1.3)).toBeLessThan(1)
  const hoverDiff = alignedDiff(editor.hover, exported.hover, 'y', 0.034, 1.3)
  const releaseDiff = alignedDiff(editor.release, exported.release, 'x', 0.034, 1.5)
  console.log(`[zip] hover y beyond one frame ${hoverDiff.toFixed(3)} px (raw ${alignedDiff(editor.hover, exported.hover, 'y', 0.034, 1.3, 0).toFixed(3)}) · release x beyond one frame ${releaseDiff.toFixed(3)} px (raw ${alignedDiff(editor.release, exported.release, 'x', 0.034, 1.5, 0).toFixed(3)})`)
  expect(hoverDiff).toBeLessThan(1)
  expect(releaseDiff).toBeLessThan(1.5)
})
