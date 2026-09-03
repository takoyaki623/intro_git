import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('開始時は両者フル HP', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'ポケモンバトル' })).toBeVisible()
  await expect(page.getByTestId('player-hp')).toHaveText('95 / 95 HP')
  await expect(page.getByTestId('opponent-hp')).toHaveText('104 / 104 HP')
  await expect(page.getByTestId('battle-log')).toContainText(
    'やせいの ゼニガメが とびだしてきた！',
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

test('決着まで戦えて、やりなおせる', async ({ page }) => {
  const replacement = page.getByRole('region', { name: /つぎに だす/ })
  const moves = page.getByRole('region', { name: 'わざ' })

  for (let i = 0; i < 60; i++) {
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
  await expect(page.getByTestId('battle-log')).toContainText('くりだした')

  await page.getByRole('button', { name: 'もういちど たたかう' }).click()
  await expect(page.getByTestId('player-hp')).toHaveText('95 / 95 HP')
  await expect(page.getByTestId('opponent-hp')).toHaveText('104 / 104 HP')
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
