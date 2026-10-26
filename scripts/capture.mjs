// Design-review capture: screenshots at four viewports in Chromium and WebKit,
// plus a short Chromium recording of play → tune → export.
// Usage (dev server running): node scripts/capture.mjs <label>
// Writes docs/design-review/<label>/ and prints a layout report (overflow, tab order).
import { chromium, webkit } from '@playwright/test'
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'

const label = process.argv[2] ?? 'current'
const APP = process.env.HINGE_URL ?? 'http://localhost:5401/'
const OUT = new URL(`../docs/design-review/${label}/`, import.meta.url).pathname
const SPECIMEN = '[data-testid="stage-specimen"] > *'
const VIEWPORTS = [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1280x800', width: 1280, height: 800 },
  { name: '768x1024', width: 768, height: 1024, touch: true },
  { name: '390x844', width: 390, height: 844, touch: true },
]

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
const report = { label, url: APP, takenAt: new Date().toISOString(), engines: {} }

async function open(browser, vp, extra = {}) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    hasTouch: !!vp.touch,
    isMobile: !!vp.touch && browser.browserType().name() === 'chromium' && vp.width < 800,
    ...extra,
  })
  const page = await ctx.newPage()
  await page.goto(APP)
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.waitForSelector(SPECIMEN)
  await page.waitForTimeout(300)
  return { ctx, page }
}

for (const [name, type] of [['chromium', chromium], ['webkit', webkit]]) {
  const browser = await type.launch(name === 'chromium' ? { args: ['--use-angle=metal'] } : {})
  report.engines[name] = { version: browser.version(), viewports: {} }
  for (const vp of VIEWPORTS) {
    const { ctx, page } = await open(browser, vp)
    await page.screenshot({ path: `${OUT}${name}-${vp.name}.jpg`, type: 'jpeg', quality: 72 })
    const layout = await page.evaluate((sel) => {
      const el = document.querySelector(sel)
      const r = el?.getBoundingClientRect()
      const stage = document.querySelector('[data-testid="stage-specimen"]')?.closest('section')?.getBoundingClientRect()
      return {
        horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
        pageHeight: document.documentElement.scrollHeight,
        specimen: r && { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        stage: stage && { w: Math.round(stage.width), h: Math.round(stage.height), shareOfViewport: +((stage.width * stage.height) / (innerWidth * innerHeight)).toFixed(2) },
      }
    }, SPECIMEN)
    const tabs = []
    if (vp.name === '1440x900') {
      for (let i = 0; i < 14; i++) {
        await page.keyboard.press('Tab')
        tabs.push(await page.evaluate(() => {
          const a = document.activeElement
          return a ? `${a.tagName.toLowerCase()}${a.getAttribute('role') ? `[${a.getAttribute('role')}]` : ''} "${(a.getAttribute('aria-label') ?? a.textContent ?? '').trim().slice(0, 32)}"` : 'none'
        }))
      }
    }
    report.engines[name].viewports[vp.name] = { ...layout, ...(tabs.length ? { tabOrder: tabs } : {}) }
    await ctx.close()
  }
  await browser.close()
}

// Recording: hover, drag & throw, tune a spring, export.
{
  const browser = await chromium.launch({ args: ['--use-angle=metal'] })
  const vp = { width: 1280, height: 800 }
  const { ctx, page } = await open(browser, vp, { recordVideo: { dir: OUT, size: vp } })
  const box = await page.locator(SPECIMEN).boundingBox()
  const c = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await page.mouse.move(c.x, c.y, { steps: 20 })
  await page.waitForTimeout(1200)
  await page.mouse.down()
  await page.mouse.move(c.x + 220, c.y - 60, { steps: 25 })
  await page.mouse.move(c.x + 300, c.y - 90, { steps: 3 })
  await page.mouse.up()
  await page.waitForTimeout(1500)
  await page.mouse.move(c.x, c.y, { steps: 10 })
  await page.mouse.down()
  await page.mouse.move(c.x - 260, c.y + 40, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(1500)
  const reveal = page.getByRole('button', { name: /^(Tune|Spring)/ })
  if (await reveal.count()) await reveal.first().click()
  const stiffness = page.getByRole('textbox', { name: 'Stiffness' })
  if (await stiffness.count()) {
    await stiffness.fill('420')
    await stiffness.press('Enter')
  }
  await page.mouse.move(5, 5)
  await page.waitForTimeout(400)
  await page.mouse.move(c.x, c.y, { steps: 8 })
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: /Export/ }).first().click()
  await page.waitForTimeout(2000)
  await ctx.close()
  await browser.close()
  const video = readdirSync(OUT).find((f) => f.endsWith('.webm'))
  if (video) renameSync(`${OUT}${video}`, `${OUT}recording-1280x800.webm`)
}

writeFileSync(`${OUT}report.json`, JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
