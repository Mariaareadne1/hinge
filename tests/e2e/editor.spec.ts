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
  await page.getByRole('button', { name: 'Drag', exact: true }).click()
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
  await page.getByRole('button', { name: /start fresh/ }).click()
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
  await page.getByRole('button', { name: /^Button/ }).click()
  await expect(page.locator(SPECIMEN)).toHaveClass(/hinge-button/)
  await page.getByRole('button', { name: /Library/ }).click()
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

test('a keyboard flick keeps the hover pose (rise) while it springs home', async ({ page }) => {
  await fresh(page)
  await page.locator(SPECIMEN).focus()
  await page.waitForTimeout(900)
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(1500)
  const t = await transformOf(page)
  expect(t.x).toBeCloseTo(0, 0)
  expect(t.y).toBeCloseTo(-10, 0)
})

test('grabbing the specimen mid-glide continues from where it is', async ({ page }) => {
  await fresh(page)
  const c = await center(page)
  await page.mouse.move(c.x, c.y)
  await page.mouse.down()
  await page.mouse.move(c.x + 100, c.y, { steps: 8 })
  await page.waitForTimeout(300)
  await page.mouse.up()
  await page.waitForTimeout(60)
  // Record where the element is at the instant it is grabbed again.
  await page.locator(SPECIMEN).evaluate((el) => {
    el.addEventListener('pointerdown', () => {
      ;(window as unknown as { __atDown: number }).__atDown = new DOMMatrix(getComputedStyle(el).transform).m41
    }, { capture: true, once: true })
  })
  await page.mouse.down()
  await page.mouse.move(c.x + 106, c.y, { steps: 2 })
  const atDown = await page.evaluate(() => (window as unknown as { __atDown: number }).__atDown)
  const after = (await transformOf(page)).x
  expect(atDown).toBeGreaterThan(5)
  // Continues from the grabbed position plus the 6 px of pointer travel (one frame of glide tolerance);
  // the old behaviour jumped to the full 106 px offset from the original grab point.
  expect(Math.abs(after - (atDown + 6))).toBeLessThan(20)
  expect(after).toBeLessThan(90)
  await page.mouse.up()
})

test('blur while the pointer is over the specimen keeps it hovered', async ({ page }) => {
  await fresh(page)
  const c = await center(page)
  await page.mouse.move(c.x, c.y)
  await page.keyboard.press('Tab') // move focus somewhere; the specimen may or may not receive it
  await page.locator(SPECIMEN).focus()
  await page.locator(SPECIMEN).blur()
  await expect(page.getByTestId('live-state')).toHaveText('hover')
})

// ── Motion Workshop layout: regressions for the redesign ─────────────────────

test('the rail edits one state while reporting the live state independently', async ({ page }) => {
  await fresh(page)
  const stiffness = page.getByRole('textbox', { name: 'Stiffness' })
  await expect(stiffness).toHaveValue(String(lift.hover.spring.stiffness))
  await page.getByRole('tab', { name: /Press/ }).click()
  await expect(page.getByRole('tab', { name: /Press/ })).toHaveAttribute('aria-selected', 'true')
  await expect(stiffness).toHaveValue(String(lift.press.spring.stiffness))
  // Playing with the object does not change which state is being edited.
  const c = await center(page)
  await page.mouse.move(c.x, c.y)
  await expect(page.getByTestId('live-state')).toHaveText('hover')
  await expect(page.getByRole('tab', { name: /Press/ })).toHaveAttribute('aria-selected', 'true')
  await page.mouse.move(5, 5)
  // Number keys switch the edited state; arrow keys move along the rail.
  await page.locator('body').press('4')
  await expect(page.getByRole('tab', { name: /Drag/ })).toHaveAttribute('aria-selected', 'true')
  await expect(stiffness).toHaveValue(String(lift.drag.spring.stiffness))
  await page.getByRole('tab', { name: /Drag/ }).focus()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('tab', { name: /Hover/ })).toBeFocused()
  await expect(page.getByRole('tab', { name: /Hover/ })).toHaveAttribute('aria-selected', 'true')
})

test('a scrub track never jumps on first contact and drags relatively', async ({ page }) => {
  await fresh(page)
  const field = page.getByRole('textbox', { name: 'Damping' })
  const track = page.getByRole('slider', { name: 'Damping slider' })
  const before = await field.inputValue()
  const tb = (await track.boundingBox())!
  // Press far from the thumb and release without moving: nothing changes, nothing is added to history.
  await page.mouse.move(tb.x + tb.width * 0.9, tb.y + tb.height / 2)
  await page.mouse.down()
  await page.mouse.up()
  await expect(field).toHaveValue(before)
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled()
  // Drag 10 % of the track to the left from that point: the value moves by 10 % of the range, from where it was.
  await page.mouse.down()
  await page.mouse.move(tb.x + tb.width * 0.8, tb.y + tb.height / 2, { steps: 5 })
  await page.mouse.up()
  const moved = Number(await field.inputValue())
  expect(moved).toBeLessThan(Number(before))
  expect(moved).toBeGreaterThanOrEqual(0)
  // Keyboard: End goes to the maximum and is one undo step.
  await track.focus()
  await page.keyboard.press('End')
  await expect(track).toHaveAttribute('aria-valuenow', '200')
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(field).toHaveValue(moved.toFixed(1))
})

test('the graph handle stays under the pointer while it is dragged', async ({ page }) => {
  await fresh(page)
  const handle = page.getByRole('slider', { name: /Peak handle/ })
  const hb = (await handle.boundingBox())!
  const start = { x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  const target = { x: start.x + 30, y: start.y - 18 }
  await page.mouse.move(target.x, target.y, { steps: 12 })
  const during = (await handle.boundingBox())!
  // The time axis is frozen during the gesture, so the inverse mapping lands the peak under the pointer.
  expect(Math.abs(during.x + during.width / 2 - target.x)).toBeLessThan(2)
  expect(Math.abs(during.y + during.height / 2 - target.y)).toBeLessThan(2)
  await page.mouse.up()
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByRole('textbox', { name: 'Stiffness' })).toHaveValue('170')
})

test('the instrument collapses to a summary, and the choice is remembered', async ({ page }) => {
  await fresh(page)
  const toggle = page.getByRole('button', { name: /Hide/ })
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await toggle.click()
  await expect(page.getByRole('textbox', { name: 'Stiffness' })).toBeHidden()
  await expect(page.getByTestId('instrument-summary')).toHaveText(/ζ 0\.63/)
  await page.reload()
  await expect(page.getByRole('button', { name: /Tune/ })).toHaveAttribute('aria-expanded', 'false')
  await page.getByRole('button', { name: /Tune/ }).click()
  await expect(page.getByRole('textbox', { name: 'Stiffness' })).toBeVisible()
})

test('a held object travels above the instrument instead of under it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await fresh(page)
  const c = await center(page)
  const panel = (await page.locator('#instrument-panel').boundingBox())!
  await page.mouse.move(c.x, c.y)
  await page.mouse.down()
  await page.mouse.move(panel.x + 120, c.y, { steps: 12 })
  await expect(page.getByTestId('live-state')).toHaveText('drag')
  const box = (await page.locator(SPECIMEN).boundingBox())!
  expect(box.x + box.width).toBeGreaterThan(panel.x + 10)
  const onTop = await page.evaluate(([x, y]) => !!document.elementFromPoint(x!, y!)?.closest('[data-testid="stage-specimen"]'), [panel.x + 5, c.y])
  expect(onTop).toBe(true)
  await page.mouse.up()
})

test('library: malformed import is rejected with a reason; a valid config imports', async ({ page }) => {
  await fresh(page)
  await page.getByRole('button', { name: /Library/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Library' })
  await dialog.getByLabel('Import config file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"version": 1, "specimen": "lamp"}') })
  await expect(dialog.getByRole('alert')).toContainText('specimen must be card, button or token')
  const good = { version: 1, id: 'x', name: 'Imported Token', specimen: 'token', behavior: RECIPES.snap.behavior, updatedAt: 1 }
  await dialog.getByLabel('Import config file').setInputFiles({ name: 'good.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(good)) })
  await expect(dialog.getByRole('status')).toContainText('Imported “Imported Token”')
  await expect(dialog.locator('.project')).toHaveCount(2)
  await page.keyboard.press('Escape')
  await expect(page.locator(SPECIMEN)).toHaveClass(/hinge-token/)
  await expect(page.getByRole('textbox', { name: 'Stiffness' })).toHaveValue('900')
})

test('export bench: a blocked clipboard is reported, not claimed as copied', async ({ page }) => {
  await fresh(page)
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('denied')) } })
  })
  await page.getByRole('button', { name: 'Export component' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: /hinge\/spring\.ts/ }).click()
  await expect(dialog.locator('textarea')).toHaveValue(/export function springAt/)
  await dialog.getByRole('button', { name: 'Copy file' }).click()
  await expect(dialog.getByRole('status')).toContainText('clipboard is blocked')
  await expect(dialog.getByRole('status')).not.toContainText('Copied')
  await dialog.getByRole('button', { name: /Back to the stage/ }).click()
  await expect(dialog).toBeHidden()
})

test('phone: no sideways overflow, no page scroll while dragging, sheet opens and closes', async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  const sizes = await page.evaluate(() => ({ w: document.documentElement.scrollWidth, h: document.documentElement.scrollHeight }))
  expect(sizes.w).toBeLessThanOrEqual(390)
  expect(sizes.h).toBeLessThanOrEqual(844)
  const tune = page.getByRole('button', { name: /Tune/ })
  await expect(tune).toHaveAttribute('aria-expanded', 'false')
  const box = (await page.locator(SPECIMEN).boundingBox())!
  // A touch drag on the object moves the object, not the page.
  const cdp = await context.newCDPSession(page).catch(() => null)
  if (cdp) {
    const x = box.x + box.width / 2
    const y = box.y + box.height / 2
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
    for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + i * 6, y: y - i * 12 }] })
    await expect(page.getByTestId('live-state')).toHaveText('drag')
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    expect(await page.evaluate(() => window.scrollY)).toBe(0)
  }
  await tune.click()
  await expect(page.getByRole('textbox', { name: 'Stiffness' })).toBeVisible()
  const sheet = (await page.locator('#instrument-panel').boundingBox())!
  expect(sheet.y + sheet.height).toBeLessThanOrEqual(844 + 1)
  await page.getByRole('button', { name: /Hide/ }).click()
  await expect(page.getByRole('textbox', { name: 'Stiffness' })).toBeHidden()
  await context.close()
})

test('arrow keys on the peak handle never rewrite a spring that has no peak', async ({ page }) => {
  await fresh(page)
  await page.getByRole('button', { name: /Snap/ }).click()
  const damping = page.getByRole('textbox', { name: 'Damping' })
  await expect(damping).toHaveValue('60.0')
  await page.getByRole('slider', { name: /Peak handle/ }).focus()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowLeft')
  await expect(damping).toHaveValue('60.0')
  await expect(page.locator('.graph__note')).toContainText('No peak to move')
})

test('scrubbing: pressing Shift mid-drag switches to fine control without a jump', async ({ page }) => {
  await fresh(page)
  const field = page.getByRole('textbox', { name: 'Stiffness' })
  const tb = (await page.getByRole('slider', { name: 'Stiffness slider' }).boundingBox())!
  const y = tb.y + tb.height / 2
  await page.mouse.move(tb.x + 20, y)
  await page.mouse.down()
  await page.mouse.move(tb.x + 80, y, { steps: 6 })
  const coarse = Number(await field.inputValue())
  await page.keyboard.down('Shift')
  await page.mouse.move(tb.x + 81, y)
  const afterShift = Number(await field.inputValue())
  // One pixel of fine scrubbing moves a tiny amount — not back toward the start.
  expect(Math.abs(afterShift - coarse)).toBeLessThan(2)
  await page.mouse.move(tb.x + 141, y, { steps: 6 })
  const fine = Number(await field.inputValue())
  expect(fine - afterShift).toBeGreaterThan(0)
  expect(fine - afterShift).toBeLessThan(coarse - 170)
  await page.keyboard.up('Shift')
  await page.mouse.up()
})

test('landscape phone: the rail and controls stay reachable', async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 844, height: 390 } })
  const page = await context.newPage()
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  const press = page.getByRole('tab', { name: /Press/ })
  await press.scrollIntoViewIfNeeded()
  await expect(press).toBeInViewport()
  await press.click()
  await expect(press).toHaveAttribute('aria-selected', 'true')
  const reduced = page.getByLabel(/Reduced motion/)
  await reduced.scrollIntoViewIfNeeded()
  await expect(reduced).toBeInViewport()
  await context.close()
})
