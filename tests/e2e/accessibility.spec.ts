import { test, expect, type Page } from '@playwright/test'

const preferences = (page: Page) => page.getByRole('region', { name: 'Acessibilidade' }).filter({ visible: true })

async function expectScale(page: Page, pixels: string) {
  await expect(page.locator('html')).toHaveCSS('font-size', pixels)
}

test('font limits, reset, persistence, navigation, OS theme and tab synchronization', async ({ page, context }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  const controls = preferences(page)
  await controls.getByRole('button', { name: 'Aumentar fonte' }).click()
  await controls.getByRole('button', { name: 'Aumentar fonte' }).click()
  await expectScale(page, '20px')
  await expect(controls.getByRole('button', { name: 'Aumentar fonte' })).toBeDisabled()
  await controls.getByRole('button', { name: 'Tema escuro' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.reload()
  await expectScale(page, '20px')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('link', { name: 'Produtos', exact: true }).filter({ visible: true }).click()
  await expectScale(page, '20px')
  const second = await context.newPage()
  await second.goto('/vendas')
  await controls.getByRole('button', { name: 'Tema claro' }).click()
  await expect(second.locator('html')).toHaveAttribute('data-theme', 'light')
  await controls.getByRole('button', { name: 'Tema sistema' }).click()
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  for (let i = 0; i < 3; i++) await controls.getByRole('button', { name: 'Diminuir fonte' }).click()
  await expectScale(page, '14px')
  await expect(controls.getByRole('button', { name: 'Diminuir fonte' })).toBeDisabled()
  await controls.getByRole('button', { name: 'Restaurar fonte para 100%' }).click()
  await expectScale(page, '16px')
  expect(errors).toEqual([])
})

test('invalid or unavailable storage still allows using preferences', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('spo_theme_v1', 'invalid')
    localStorage.setItem('spo_font_scale_v1', '999')
  })
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/pin')
  await expectScale(page, '16px')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error('blocked') }
    Storage.prototype.setItem = () => { throw new Error('blocked') }
  })
  await page.reload()
  await preferences(page).getByRole('button', { name: 'Tema claro' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await preferences(page).getByRole('button', { name: 'Aumentar fonte' }).click()
  await expectScale(page, '18px')
})

test('375px mobile menu and PIN remain usable at maximum font size', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Abrir menu' }).click()
  const controls = preferences(page)
  await controls.getByRole('button', { name: 'Aumentar fonte' }).click()
  await controls.getByRole('button', { name: 'Aumentar fonte' }).click()
  await controls.getByRole('button', { name: 'Tema escuro' }).click()
  await expect(controls.getByRole('button', { name: 'Tema escuro' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  await page.screenshot({ path: testInfo.outputPath('mobile-menu-dark-125.png'), animations: 'disabled' })
  await page.getByRole('link', { name: 'Relatórios', exact: true }).filter({ visible: true }).click()
  await expect(page).toHaveURL(/\/pin/)
  await expectScale(page, '20px')
  await expect(page.getByRole('textbox', { name: 'Dígito 4 do PIN' })).toBeInViewport()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('mobile-pin-dark-125.png'), fullPage: true })
  for (let index = 0; index < 4; index++) await page.getByRole('textbox', { name: `Dígito ${index + 1} do PIN` }).fill('1357'[index]!)
  await expect(page).toHaveURL(/\/relatorios/)
  await page.getByRole('button', { name: 'Abrir menu' }).click()
  await expect(preferences(page).getByRole('button', { name: 'Tema escuro' })).toHaveAttribute('aria-pressed', 'true')
})

test('critical routes, sale totals and thermal print survive both themes and font extremes', async ({ page }, testInfo) => {
  expect((await page.request.post('/api/auth/pin', { data: { pin: '1357' } })).ok()).toBe(true)
  const category = await page.request.post('/api/categories', { data: { name: 'QA acessibilidade' } })
  expect(category.ok()).toBe(true)
  const categoryId = (await category.json()).data.id
  const productResponse = await page.request.post('/api/products', { data: {
    name: 'Blusa de teste com nome longo para conferir a comanda', categoryId,
    priceCents: 5990, variations: [{ size: 'M', color: 'Rosa', stockQuantity: 20, minStock: 2 }],
  } })
  expect(productResponse.ok()).toBe(true)
  const product = (await productResponse.json()).data
  const saleResponse = await page.request.post('/api/sales', { data: {
    items: [{ variationId: product.variations[0].id, quantity: 2 }], paymentMethod: 'CASH', discountCents: 1000,
  } })
  expect(saleResponse.ok()).toBe(true)
  const sale = (await saleResponse.json()).data
  expect(sale.totalCents).toBe(10980)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  for (const [theme, scale] of [['light', '87.5'], ['dark', '125']]) {
    await page.goto('/')
    await page.evaluate(({ theme, scale }) => {
      localStorage.setItem('spo_theme_v1', theme!)
      localStorage.setItem('spo_font_scale_v1', scale!)
    }, { theme, scale })
    for (const route of ['/', '/produtos', `/produtos/${product.id}`, '/produtos/novo', '/vendas', '/vendas/nova', '/estoque', '/relatorios', '/configuracoes', `/vendas/${sale.id}`]) {
      await page.goto(route)
      await expect(page.locator('h1')).toBeVisible()
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme!)
      await expect(preferences(page).getByRole('button', { name: 'Restaurar fonte para 100%' })).toBeEnabled()
      if (route === '/relatorios') {
        await page.getByRole('button', { name: 'Vendas', exact: true }).click()
        await expect(page.locator('.recharts-bar')).toBeVisible()
        await page.locator('.recharts-bar-rectangle').first().hover()
        await expect(page.locator('.recharts-tooltip-wrapper').filter({ visible: true }).first()).toBeVisible()
        await page.screenshot({ path: testInfo.outputPath(`reports-${theme}.png`), fullPage: true })
      }
    }
    await expect(page.locator('.receipt')).toContainText('109,80')
    await page.screenshot({ path: testInfo.outputPath(`sale-${theme}.png`), fullPage: true })
    await page.emulateMedia({ media: 'print' })
    await expectScale(page, '16px')
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
    await expect(page.locator('.receipt')).toHaveCSS('color', 'rgb(0, 0, 0)')
    await expect(page.locator('.receipt')).toHaveCSS('font-size', '11px')
    expect(await page.locator('.receipt').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    await expect(page.locator('.app-shell main')).toHaveCSS('overflow', 'visible')
    await page.screenshot({ path: testInfo.outputPath(`print-${theme}.png`), fullPage: true })
    await page.emulateMedia({ media: 'screen' })
  }
  await page.setViewportSize({ width: 375, height: 667 })
  for (const route of ['/', '/produtos', '/produtos/novo', '/vendas/nova', '/estoque', '/relatorios', '/configuracoes', `/vendas/${sale.id}`]) {
    await page.goto(route)
    await expect(page.locator('h1')).toBeVisible()
    expect(await page.locator('main').evaluate(el => el.scrollWidth <= el.clientWidth), route).toBe(true)
  }
  expect(errors).toEqual([])
})
