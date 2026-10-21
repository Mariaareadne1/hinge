// Captures README screenshots from the running dev server (pnpm dev).
// Usage: node scripts/screenshots.mjs
import { chromium } from '@playwright/test'

const APP = process.env.HINGE_URL ?? 'http://localhost:5401/'
const OUT = new URL('../docs/media/', import.meta.url).pathname
const browser = await chromium.launch({ args: ['--use-angle=metal'] })

async function page(viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, ...opts })
  const p = await ctx.newPage()
  await p.goto(APP)
  await p.evaluate(() => localStorage.clear())
  await p.reload()
  await p.waitForSelector('[data-testid="stage-specimen"] > *')
  return p
}

const desk = await page({ width: 1440, height: 900 })
const card = desk.locator('[data-testid="stage-specimen"] > *')
let box = await card.boundingBox()
await desk.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
await desk.waitForTimeout(1200)
await desk.screenshot({ path: `${OUT}hinge-hover.png` })

await desk.mouse.down()
await desk.mouse.move(box.x + box.width / 2 + 170, box.y + box.height / 2 - 40, { steps: 12 })
await desk.waitForTimeout(120)
await desk.getByRole('tab', { name: /Drag/ }).evaluate((el) => el.click())
await desk.waitForTimeout(500)
await desk.screenshot({ path: `${OUT}hinge-drag.png` })
await desk.mouse.up()
await desk.waitForTimeout(1500)

await desk.getByRole('button', { name: /Magnet/ }).click()
await desk.getByRole('radio', { name: /Token/ }).click()
await desk.getByRole('tab', { name: /Hover/ }).click()
box = await card.boundingBox()
await desk.mouse.move(5, 5)
await desk.waitForTimeout(400)
await desk.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
await desk.waitForTimeout(1200)
await desk.screenshot({ path: `${OUT}hinge-token-magnet.png` })

await desk.getByRole('button', { name: 'Export component' }).click()
await desk.waitForTimeout(300)
await desk.screenshot({ path: `${OUT}hinge-export.png` })

const phone = await page({ width: 390, height: 844 }, { hasTouch: true, isMobile: true })
await phone.screenshot({ path: `${OUT}hinge-mobile.png` })

await browser.close()
console.log('screenshots written to', OUT)
