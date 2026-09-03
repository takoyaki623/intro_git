import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  // A run is remembered, so clear it before each test.
  await page.evaluate(() => localStorage.clear())
  await page.reload()
})

test('開始時は 0 れんしょう、手持ちフル', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'ポケモンバトル' })).toBeVisible()
  await expect(page.getByTestId('player-hp')).toHaveText('95 / 95 HP')
  await expect(page.getByTestId('run-status')).toContainText('れんしょう 0')
  await expect(page.getByTestId('run-status')).toContainText('あいて Lv50')
  await expect(page.getByTestId('battle-log')).toContainText('とびだしてきた！')
})

test('リロードしても つづきから 再開する', async ({ page }) => {
  await page.getByRole('region', { name: 'わざ' }).getByRole('button').first().click()
  const hp = await page.getByTestId('player-hp').textContent()
  const opponent = await page
    .getByTestId('opponent-card')
    .getByRole('strong')
    .textContent()

  await page.reload()

  await expect(page.getByTestId('player-hp')).toHaveText(hp!)
  await expect(page.getByTestId('opponent-card').getByRole('strong')).toHaveText(
    opponent!,
  )
})

test('わざを使うと相手が削れ、ログに残る', async ({ page }) => {
  await page.getByRole('button', { name: /10まんボルト/ }).click()

  await expect(page.getByTestId('battle-log')).toContainText(
    'ピカチュウの 10まんボルト！',
  )
  await expect(page.getByTestId('opponent-hp')).not.toHaveText('104 / 104 HP')
})

test('こうたいは 1 ターンを消費する', async ({ page }) => {
  await page
    .getByRole('region', { name: 'こうたい' })
    .getByRole('button', { name: /フシギダネ/ })
    .click()

  await expect(page.getByTestId('battle-log')).toContainText('ゆけっ！ フシギダネ！')
  await expect(page.getByTestId('battle-log')).not.toContainText('ピカチュウの')
  await expect(page.getByRole('button', { name: /はっぱカッター/ })).toBeVisible()
})

test('決着がつき、勝てば連戦・負ければ最初から', async ({ page }) => {
  const replacement = page.getByRole('region', { name: /つぎに だす/ })
  const moves = page.getByRole('region', { name: 'わざ' })

  for (let i = 0; i < 80; i++) {
    if (await replacement.count()) {
      await replacement
        .getByRole('button')
        .and(page.locator(':not([disabled])'))
        .first()
        .click()
      continue
    }
    if (!(await moves.count())) break
    await moves.getByRole('button').first().click()
  }

  await expect(page.getByRole('status')).toContainText(/たおした|たおれてしまった/)

  const nextOpponent = page.getByRole('button', { name: 'つぎの あいて' })
  if (await nextOpponent.count()) {
    await nextOpponent.click()
    await expect(page.getByTestId('run-status')).toContainText('れんしょう 1')
    await expect(page.getByTestId('run-status')).toContainText('あいて Lv52')
  } else {
    await page.getByRole('button', { name: 'はじめから' }).click()
    await expect(page.getByTestId('run-status')).toContainText('れんしょう 0')
    await expect(page.getByTestId('player-hp')).toHaveText('95 / 95 HP')
  }
})

test('でんじは が当たると まひ が表示される', async ({ page }) => {
  const denjiha = page.getByRole('button', { name: /でんじは/ })
  const badge = page.getByTestId('opponent-card').getByText('まひ', { exact: true })

  // でんじは is 90% accurate and always paralyses, so a few tries will land it.
  for (let i = 0; i < 8; i++) {
    if (await badge.count()) break
    if (!(await denjiha.count())) break
    await denjiha.click()
  }

  await expect(badge).toBeVisible()
  await expect(page.getByTestId('battle-log')).toContainText(
    'まひして わざが でにくくなった',
  )
})

test('戦闘中にコンソールエラーが出ない', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))

  const moves = page.getByRole('region', { name: 'わざ' })
  for (let i = 0; i < 6; i++) {
    if (!(await moves.count())) break
    await moves
      .getByRole('button')
      .nth(i % 4)
      .click()
  }

  expect(errors).toEqual([])
})
