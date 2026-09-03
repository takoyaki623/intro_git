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

test('決着まで戦えて、やりなおせる', async ({ page }) => {
  const thunderbolt = page.getByRole('button', { name: /10まんボルト/ })

  for (let i = 0; i < 15 && (await thunderbolt.count()) > 0; i++) {
    await thunderbolt.click()
  }

  await expect(page.getByRole('status')).toContainText(/たおした|たおれてしまった/)

  await page.getByRole('button', { name: 'もういちど たたかう' }).click()
  await expect(page.getByTestId('player-hp')).toHaveText('95 / 95 HP')
  await expect(page.getByTestId('opponent-hp')).toHaveText('104 / 104 HP')
})

test('戦闘中にコンソールエラーが出ない', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))

  await page.getByRole('button', { name: /10まんボルト/ }).click()
  await page.getByRole('button', { name: /でんこうせっか/ }).click()

  expect(errors).toEqual([])
})
