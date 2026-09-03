import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('opens with both Pokemon at full health', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Pokémon Battle' })).toBeVisible()
  await expect(page.getByTestId('player-hp')).toHaveText('95 / 95 HP')
  await expect(page.getByTestId('opponent-hp')).toHaveText('104 / 104 HP')
  await expect(page.getByTestId('battle-log')).toContainText('A wild Squirtle appeared!')
})

test('using a move damages the opponent and writes to the log', async ({ page }) => {
  await page.getByRole('button', { name: /Thunderbolt/ }).click()

  await expect(page.getByTestId('battle-log')).toContainText('Pikachu used Thunderbolt!')
  await expect(page.getByTestId('opponent-hp')).not.toHaveText('104 / 104 HP')
})

test('a battle can be played to a result and restarted', async ({ page }) => {
  const thunderbolt = page.getByRole('button', { name: /Thunderbolt/ })

  for (let i = 0; i < 15 && (await thunderbolt.count()) > 0; i++) {
    await thunderbolt.click()
  }

  await expect(page.getByRole('status')).toContainText(/win|lose/)

  await page.getByRole('button', { name: 'Battle again' }).click()
  await expect(page.getByTestId('player-hp')).toHaveText('95 / 95 HP')
  await expect(page.getByTestId('opponent-hp')).toHaveText('104 / 104 HP')
})

test('reports no console errors during a battle', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))

  await page.getByRole('button', { name: /Thunderbolt/ }).click()
  await page.getByRole('button', { name: /Quick Attack/ }).click()

  expect(errors).toEqual([])
})
