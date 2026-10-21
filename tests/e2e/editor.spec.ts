import { expect, test, type Page } from '@playwright/test'
import { springAt } from '../../src/runtime/spring'
import { RECIPES } from '../../src/domain/schema'
import { STORAGE_KEY } from '../../src/storage/projects'
import { at, modelError, startRecording, stopRecording } from './measure'

const SPECIMEN = '[data-testid="stage-specimen"] > *'
const lift = RECIPES.lift.behavior

async function fresh(page: Page) {
  const errors: string[] = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expect(page.locator(SPECIMEN)).toBeVisible()
  return errors
}

async function center(page: Page) {
  const box = (await page.locator(SPECIMEN).boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box }
}

const transformOf = (page: Page) =>
  page.locator(SPECIMEN).evaluate((el) => {
    const m = new DOMMatrix(getComputedStyle(el).transform)
    return { x: m.m41, y: m.m42, scale: Math.hypot(m.a, m.b) }
  })

test.beforeEach(async ({ page }) => {
  await page.mouse.move(5, 5)
})

test('hover follows the analytic spring and the graph trace is drawn', async ({ page }) => {
  const errors = await fresh(page)
  const c = await center(page)
  await startRecording(page, SPECIMEN, 'pointerenter')
  await page.mouse.move(c.x, c.y)
  await page.waitForTimeout(1200)
  const samples = await stopRecording(page)

  const model = (t: number) => lift.hover.pose.y * (1 + springAt(lift.hover.spring, -1, 0, t).x)
  // 0.8 px of a 10 px travel: frame-sampling jitter, not model drift (see PROGRESS.md).
  expect(modelError(samples, 'y', model, 0, 1.1)).toBeLessThan(0.8)
  expect(at(samples, 'y', 1.1)).toBeCloseTo(-10, 1)
  await expect(page.getByTestId('live-state')).toHaveText('hover')
  expect(await page.locator('.graph__trace circle').count()).toBeGreaterThan(20)

  await page.mouse.move(5, 5)
  await expect.poll(async () => (await transformOf(page)).y, { timeout: 3000 }).toBeCloseTo(0, 1)
  await expect(page.getByTestId('live-state')).toHaveText('rest')
  expect(errors).toEqual([])
})

test('press inside fires once; release outside does not', async ({ page }) => {
  await fresh(page)
  const c = await center(page)
  await page.mouse.move(c.x, c.y)
  await page.mouse.down()
  await expect(page.getByTestId('live-state')).toHaveText('press')
  await page.mouse.up()
  await expect(page.getByTestId('press-count')).toHaveText(/Presses: 1/)
  await expect(page.getByTestId('live-state')).toHaveText('hover')

  // Disable drag so moving outside while pressed is a pure "release outside".
  await page.getByRole('tab', { name: /Drag/ }).click()
  await page.getByLabel('Draggable').uncheck()
  await page.mouse.move(c.x, c.y)
  await page.mouse.down()
  await page.mouse.move(c.x, c.box.y - 120, { steps: 4 })
  await page.mouse.up()
  await expect(page.getByTestId('press-count')).toHaveText(/Presses: 1/)
  await expect(page.getByTestId('live-state')).toHaveText('rest')
})

test('drag is rubber-banded and released back home', async ({ page }) => {
  await fresh(page)
  const c = await center(page)
  await page.mouse.move(c.x, c.y)
  await page.mouse.down()
  await page.mouse.move(c.x + 200, c.y, { steps: 10 })
  await expect(page.getByTestId('live-state')).toHaveText('drag')
  // Hold still: no fling velocity on release, and the held-scale spring settles (~0.7 s).
  await page.waitForTimeout(1000)
  const held = await transformOf(page)
  const expected = lift.drag.radius + (200 - lift.drag.radius) * lift.drag.elasticity
  expect(held.x).toBeCloseTo(expected, 0)
  expect(held.scale).toBeCloseTo(lift.drag.scale, 2)
  await page.mouse.up()
  await expect.poll(async () => Math.abs((await transformOf(page)).x), { timeout: 4000 }).toBeLessThan(0.1)
  await expect(page.getByTestId('press-count')).toHaveText(/Presses: 0/)
})

test('pointercancel and window blur return to rest', async ({ page }) => {
  await fresh(page)
  const c = await center(page)
  await page.mouse.move(c.x, c.y)
  await page.mouse.down()
  await page.mouse.move(c.x + 80, c.y + 40, { steps: 5 })
  await expect(page.getByTestId('live-state')).toHaveText('drag')
  await page.locator(SPECIMEN).evaluate((el) =>
    el.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true, pointerType: 'mouse' })),
  )
  await expect(page.getByTestId('live-state')).not.toHaveText('drag')
  await expect.poll(async () => Math.abs((await transformOf(page)).x), { timeout: 4000 }).toBeLessThan(0.1)
  await page.mouse.up()

  await page.mouse.down()
  await expect(page.getByTestId('live-state')).toHaveText('press')
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await expect(page.getByTestId('live-state')).not.toHaveText('press')
  await page.mouse.up()
})

test('keyboard: focus hovers, Space presses, arrows flick through the release spring', async ({ page }) => {
  await fresh(page)
  await page.locator(SPECIMEN).focus()
  await expect(page.getByTestId('live-state')).toHaveText('hover')
  await page.keyboard.down('Space')
  await expect(page.getByTestId('live-state')).toHaveText('press')
  await page.keyboard.up('Space')
  await expect(page.getByTestId('press-count')).toHaveText(/Presses: 1/)
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('press-count')).toHaveText(/Presses: 2/)

  await startRecording(page, SPECIMEN, 'keydown')
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(1500)
  const samples = await stopRecording(page)
  const model = (t: number) => springAt(lift.drag.spring, 0, 900, t).x
  expect(Math.max(...samples.map((s) => s.x))).toBeGreaterThan(20)
  expect(modelError(samples, 'x', model, 0, 1.4)).toBeLessThan(1)
})

test('touch tap presses without leaving a hover behind', async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  await page.goto('/')
  const box = (await page.locator(SPECIMEN).boundingBox())!
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)
  await expect(page.getByTestId('press-count')).toHaveText(/Presses: 1/)
  await expect(page.getByTestId('live-state')).toHaveText('rest')
  await context.close()
})

test('reduced motion swaps springs for instant changes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await fresh(page)
  await expect(page.getByLabel(/Reduced motion/)).toBeChecked()
  const c = await center(page)
  await startRecording(page, SPECIMEN, 'pointerenter')
  await page.mouse.move(c.x, c.y)
  await page.waitForTimeout(300)
  const samples = await stopRecording(page)
  // No animation: every frame shows either the rest pose or the hover pose, never between.
  for (const s of samples) expect(Math.min(Math.abs(s.y), Math.abs(s.y + 10))).toBeLessThan(0.05)
  expect(samples[samples.length - 1]!.y).toBeCloseTo(-10, 1)
})

test('edits change the runtime, persist, undo as one step, and survive reload', async ({ page }) => {
  await fresh(page)
  const stiffness = page.getByRole('textbox', { name: 'Stiffness' })
  await stiffness.fill('600')
  await stiffness.press('Enter')
  await expect(stiffness).toHaveValue('600')
  await expect(page.getByTestId('save-status')).toHaveText(/Saved/)

  // Slider drag = many previews, one undo step.
  const slider = page.getByRole('slider', { name: 'Damping slider' })
  const sb = (await slider.boundingBox())!
  await page.mouse.move(sb.x + 10, sb.y + sb.height / 2)
  await page.mouse.down()
  await page.mouse.move(sb.x + sb.width * 0.5, sb.y + sb.height / 2, { steps: 12 })
  await page.mouse.up()
  const damping = await page.getByRole('textbox', { name: 'Damping' }).inputValue()
  expect(Number(damping)).toBeGreaterThan(50)

  await page.reload()
  await expect(page.getByRole('textbox', { name: 'Stiffness' })).toHaveValue('600')
  await expect(page.getByRole('textbox', { name: 'Damping' })).toHaveValue(damping)

  // History resets on reload (by design); make two fresh edits and undo them.
  await page.getByRole('textbox', { name: 'Mass' }).fill('2')
  await page.getByRole('textbox', { name: 'Mass' }).press('Enter')
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByRole('textbox', { name: 'Mass' })).toHaveValue('1.20')
  await page.getByRole('button', { name: 'Redo' }).click()
  await expect(page.getByRole('textbox', { name: 'Mass' })).toHaveValue('2.00')

  // The runtime uses the edited spring: hover now follows the new model.
  const c = await center(page)
  await startRecording(page, SPECIMEN, 'pointerenter')
  await page.mouse.move(c.x, c.y)
  await page.waitForTimeout(900)
  const samples = await stopRecording(page)
  const spring = { stiffness: 600, damping: Number(damping), mass: 2 }
  expect(modelError(samples, 'y', (t) => -10 * (1 + springAt(spring, -1, 0, t).x), 0, 0.8)).toBeLessThan(0.8)
})

test('invalid numeric entry is rejected visibly and not applied', async ({ page }) => {
  await fresh(page)
  const field = page.getByRole('textbox', { name: 'Stiffness' })
  await field.fill('abc')
  await expect(page.getByRole('alert')).toContainText('Enter a number')
  await field.press('Enter')
  await expect(field).toHaveValue('170')
})

test('corrupt storage is reported, kept, and recoverable', async ({ page }) => {
  // Seed before the app boots; an open tab would rightly flush its own state on unload.
  await page.addInitScript((key) => {
    if (sessionStorage.getItem('seeded')) return
    sessionStorage.setItem('seeded', '1')
    localStorage.setItem(key, '{"projects": [{"broken": true}]')
  }, STORAGE_KEY)
  await page.goto('/')
  await expect(page.getByRole('alert')).toContainText('couldn’t be read')
  await expect(page.getByTestId('save-status')).toHaveText('Autosave paused')
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toContain('broken')
  await page.getByRole('button', { name: 'Start fresh' }).click()
  await expect(page.getByTestId('save-status')).toHaveText(/Saved/)
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).not.toContain('broken')
})

test('graph handle reshapes the spring by dragging', async ({ page }) => {
  await fresh(page)
  const handle = page.getByRole('slider', { name: /Peak handle/ })
  const before = await page.getByRole('textbox', { name: 'Damping' }).inputValue()
  const hb = (await handle.boundingBox())!
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
  await page.mouse.down()
  await page.mouse.move(hb.x + hb.width / 2 - 20, hb.y - 30, { steps: 6 })
  await page.mouse.up()
  const after = await page.getByRole('textbox', { name: 'Damping' }).inputValue()
  expect(Number(after)).toBeLessThan(Number(before))
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByRole('textbox', { name: 'Damping' })).toHaveValue(before)
})

test('recipes, specimens and projects', async ({ page }) => {
  await fresh(page)
  await page.getByRole('button', { name: /Snap/ }).click()
  await expect(page.getByRole('textbox', { name: 'Stiffness' })).toHaveValue('900')
  await page.getByRole('radio', { name: /Button/ }).click()
  await expect(page.locator(SPECIMEN)).toHaveClass(/hinge-button/)
  await page.getByRole('button', { name: 'Duplicate' }).click()
  await expect(page.locator('.project')).toHaveCount(2)
  await page.getByRole('button', { name: /Delete Snap Card copy|Delete .*copy/ }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(page.locator('.project')).toHaveCount(1)
})

test('export dialog shows real code and downloads a zip', async ({ page }) => {
  await fresh(page)
  await page.getByRole('button', { name: 'Export component' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: 'HingeCard' })).toBeVisible()
  await expect(dialog.locator('textarea')).toHaveValue(/const BEHAVIOR: HingeBehavior = \{/)
  const download = page.waitForEvent('download')
  await dialog.getByRole('button', { name: /Download component/ }).click()
  expect((await download).suggestedFilename()).toBe('HingeCard.zip')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
})
