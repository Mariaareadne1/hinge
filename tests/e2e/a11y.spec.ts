import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const SPECIMEN = '[data-testid="stage-specimen"] > *'

async function fresh(page: Page) {
  await page.goto('/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expect(page.locator(SPECIMEN)).toBeVisible()
}

async function scan(page: Page, label: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze()
  const summary = violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).slice(0, 4).join(' | ')}`)
  expect(summary, `${label} axe violations`).toEqual([])
}

test('workshop, library and export bench pass axe (WCAG 2.2 AA rules)', async ({ page }) => {
  await fresh(page)
  await scan(page, 'workshop')
  await page.getByRole('tab', { name: /Drag/ }).click()
  await page.getByRole('button', { name: 'Drag', exact: true }).click()
  await scan(page, 'drag tuning')
  await page.getByRole('button', { name: /Library/ }).click()
  await scan(page, 'library')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Export component' }).click()
  await scan(page, 'export bench')
})

test('phone layout with the tuning sheet open passes axe', async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  await fresh(page)
  await scan(page, 'phone')
  await page.getByRole('button', { name: /Tune/ }).click()
  await scan(page, 'phone sheet')
  await context.close()
})

test('closing a dialog returns focus to the control that opened it', async ({ page }) => {
  await fresh(page)
  const opener = page.getByRole('button', { name: /Library/ })
  await opener.click()
  await page.keyboard.press('Escape')
  await expect(opener).toBeFocused()
  const exportButton = page.getByRole('button', { name: 'Export component' })
  await exportButton.click()
  await page.keyboard.press('Escape')
  await expect(exportButton).toBeFocused()
})
