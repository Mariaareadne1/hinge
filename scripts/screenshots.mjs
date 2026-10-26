// Captures README screenshots from the running dev server (pnpm dev).
// Usage: node scripts/screenshots.mjs
import { chromium } from '@playwright/test'

const APP = process.env.HINGE_URL ?? 'http://localhost:5401/'
const OUT = new URL('../docs/media/', import.meta.url).pathname
const SPECIMEN = '[data-testid="stage-specimen"] > *'
const browser = await chromium.launch({ args: ['--use-angle=metal'] })

async function page(viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, ...opts })
  const p = await ctx.newPage()
  await p.goto(APP)
  await p.evaluate(() => localStorage.clear())
  await p.reload()
  await p.waitForSelector(SPECIMEN)
  return p
}

const center = async (p) => {
  const b = await p.locator(SPECIMEN).boundingBox()
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
}

const desk = await page({ width: 1440, height: 900 })
let c = await center(desk)
await desk.mouse.move(c.x, c.y)
await desk.waitForTimeout(1200)
await desk.screenshot({ path: `${OUT}hinge-hover.png` })

await desk.getByRole('tab', { name: /Drag/ }).click()
await desk.getByRole('button', { name: 'Drag', exact: true }).click()
await desk.mouse.move(c.x, c.y)
await desk.mouse.down()
await desk.mouse.move(c.x + 300, c.y - 30, { steps: 14 })
await desk.waitForTimeout(200)
await desk.screenshot({ path: `${OUT}hinge-drag.png` })
await desk.mouse.up()
await desk.waitForTimeout(1500)

await desk.getByRole('button', { name: /Magnet/ }).click()
await desk.getByRole('button', { name: /^Token/ }).click()
await desk.getByRole('tab', { name: /Hover/ }).click()
await desk.getByRole('button', { name: 'Spring', exact: true }).click()
await desk.mouse.move(5, 5)
await desk.waitForTimeout(500)
c = await center(desk)
await desk.mouse.move(c.x, c.y)
await desk.waitForTimeout(1200)
await desk.screenshot({ path: `${OUT}hinge-token-magnet.png` })

await desk.getByRole('button', { name: 'Export component' }).click()
await desk.waitForTimeout(300)
await desk.screenshot({ path: `${OUT}hinge-export.png` })

const phone = await page({ width: 390, height: 844 }, { hasTouch: true, isMobile: true })
await phone.screenshot({ path: `${OUT}hinge-mobile.png` })
await phone.getByRole('button', { name: /Tune/ }).click()
await phone.waitForTimeout(200)
await phone.screenshot({ path: `${OUT}hinge-mobile-tune.png` })

await browser.close()
console.log('screenshots written to', OUT)
