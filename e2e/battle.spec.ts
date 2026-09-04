import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { RUN_CONFIG, opponentLevel } from '../src/domain/run'
import { BOSS_LIST } from '../src/data/species'
import { DRAFT_CONFIG } from '../src/domain/draft'
import { TIER_CONFIG } from '../src/domain/tiers'

/**
 * A fixed starting position, written straight into the save the app reads.
 *
 * Left to itself the app draws the opposing party at random, which can field
 * the same species the player has and makes assertions about who did what
 * ambiguous. Seeding pins it. HP above maximum is clamped on load, so 999 just
 * means full.
 */
const SEED = {
  version: 1,
  wins: 0,
  finished: false,
  winner: null,
  awaitingSwitch: null,
  player: {
    activeIndex: 0,
    members: [
      {
        speciesId: 'pikachu',
        level: RUN_CONFIG.playerLevel,
        currentHp: 999,
        status: null,
      },
      {
        speciesId: 'charmander',
        level: RUN_CONFIG.playerLevel,
        currentHp: 999,
        status: null,
      },
      {
        speciesId: 'bulbasaur',
        level: RUN_CONFIG.playerLevel,
        currentHp: 999,
        status: null,
      },
    ],
  },
  opponent: {
    activeIndex: 0,
    members: [
      {
        speciesId: 'squirtle',
        level: RUN_CONFIG.playerLevel,
        currentHp: 999,
        status: null,
      },
      { speciesId: 'zubat', level: RUN_CONFIG.playerLevel, currentHp: 999, status: null },
      {
        speciesId: 'geodude',
        level: RUN_CONFIG.playerLevel,
        currentHp: 999,
        status: null,
      },
    ],
  },
}

/** Take the first three candidates on the table and start the run. */
async function draft(page: Page) {
  const panel = page.getByTestId('draft-candidates')
  for (let i = 0; i < DRAFT_CONFIG.picks; i++) {
    await panel.getByRole('button').nth(i).click()
  }
  await page.getByRole('button', { name: 'この てもちで はじめる' }).click()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate((seed) => {
    localStorage.setItem('pokemon-battle:run', JSON.stringify(seed))
  }, SEED)
  await page.reload()
})

test('開始時は 0 れんしょう、手持ちフル', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'ポケモンバトル' })).toBeVisible()
  await expect(page.getByTestId('player-hp')).toHaveText('95 / 95 HP')
  await expect(page.getByTestId('run-status')).toContainText('れんしょう 0')
  await expect(page.getByTestId('run-status')).toContainText(
    `あいて Lv${RUN_CONFIG.playerLevel}`,
  )
  await expect(page.getByTestId('opponent-hp')).toHaveText('104 / 104 HP')
  await expect(page.getByTestId('battle-log')).toContainText(
    'やせいの ゼニガメが とびだしてきた！',
  )
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

test('被弾したダメージが数値で出る', async ({ page }) => {
  // あなをほる rather than 10まんボルト: the opponent switches to イシツブテ,
  // which でんき cannot touch, and a hit for nothing shows no figure.
  await page.getByRole('button', { name: /あなをほる/ }).click()
  await expect(page.getByTestId('opponent-card')).toContainText(/-\d+/)
})

test('ログは最新行まで自動でスクロールする', async ({ page }) => {
  const moves = page.getByRole('region', { name: 'わざ' })
  const replacement = page.getByRole('region', { name: /つぎに だす/ })
  const next = page.getByRole('button', { name: 'つぎの あいて' })
  const rewards = page.getByRole('region', { name: 'ごほうびを えらぶ' })

  // Play until the log is long enough to overflow its box.
  const log = page.getByTestId('battle-log')
  for (let i = 0; i < 40; i++) {
    const overflowing = await log.evaluate((el) => el.scrollHeight > el.clientHeight)
    if (overflowing) break
    if (await rewards.count()) {
      await rewards.getByRole('button').first().click()
      continue
    }
    if (await next.count()) {
      await next.click()
      continue
    }
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

  const state = await log.evaluate((el) => ({
    overflowing: el.scrollHeight > el.clientHeight,
    atBottom: el.scrollTop + el.clientHeight >= el.scrollHeight - 2,
  }))
  expect(state.overflowing).toBe(true)
  expect(state.atBottom).toBe(true)
})

test('こうたいは 1 ターンを消費する', async ({ page }) => {
  await page
    .getByRole('region', { name: 'こうたい' })
    .getByRole('button', { name: /フシギダネ/ })
    .click()

  await expect(page.getByTestId('battle-log')).toContainText('ゆけっ！ フシギダネ！')
  // ピカチュウ gave up its attack to switch. Which side used which move is
  // checked properly in battle.test.ts, where the events are readable.
  await expect(page.getByTestId('battle-log')).not.toContainText('10まんボルト')
  await expect(page.getByRole('button', { name: /はっぱカッター/ })).toBeVisible()
})

test('勝つと ごほうび を えらんでから 次の相手へ', async ({ page }) => {
  // A save that is already won, so the reward screen is one reload away.
  await page.evaluate((seed) => {
    localStorage.setItem(
      'pokemon-battle:run',
      JSON.stringify({ ...seed, winner: 'player' }),
    )
  }, SEED)
  await page.reload()

  const rewards = page.getByRole('region', { name: 'ごほうびを えらぶ' })
  await expect(rewards).toBeVisible()
  await expect(page.getByRole('region', { name: 'わざ' })).toHaveCount(0)

  await rewards.getByRole('button').first().click()

  await expect(page.getByTestId('run-status')).toContainText('れんしょう 1')
  await expect(page.getByRole('region', { name: 'わざ' })).toBeVisible()
  await expect(rewards).toHaveCount(0)
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

  const won = page.getByRole('region', { name: 'ごほうびを えらぶ' })
  if (await won.count()) {
    await won.getByRole('button').first().click()
    await expect(page.getByTestId('run-status')).toContainText('れんしょう 1')
    await expect(page.getByTestId('run-status')).toContainText(
      `あいて Lv${opponentLevel(1)}`,
    )
  } else {
    await page.getByRole('button', { name: 'はじめから' }).click()
    // A new run starts at the draft, so the party is picked before it exists.
    await expect(page.getByRole('region', { name: 'てもちを えらぶ' })).toBeVisible()
    await draft(page)
    await expect(page.getByTestId('run-status')).toContainText('れんしょう 0')
    await expect(page.getByTestId('player-hp')).toHaveText(/^(\d+) \/ \1 HP$/)
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

test('負けると殿堂入りに記録が残り、次のランに表示される', async ({ page }) => {
  // Start from a run that has already won a few and is on its last legs: a
  // streak of zero is deliberately not recorded, and a bot rarely wins one.
  await page.evaluate((seed) => {
    localStorage.setItem(
      'pokemon-battle:run',
      JSON.stringify({
        ...seed,
        wins: 3,
        player: {
          ...seed.player,
          members: seed.player.members.map((m) => ({ ...m, currentHp: 1 })),
        },
      }),
    )
  }, SEED)
  await page.reload()

  const moves = page.getByRole('region', { name: 'わざ' })
  const replacement = page.getByRole('region', { name: /つぎに だす/ })
  const next = page.getByRole('button', { name: 'つぎの あいて' })
  const rewards = page.getByRole('region', { name: 'ごほうびを えらぶ' })
  const over = page.getByRole('button', { name: 'はじめから' })

  for (let i = 0; i < 120; i++) {
    if (await over.count()) break
    if (await rewards.count()) {
      await rewards.getByRole('button').first().click()
      continue
    }
    if (await next.count()) {
      await next.click()
      continue
    }
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

  await expect(over).toBeVisible()
  const hall = page.getByTestId('hall-of-fame')
  await expect(hall).toBeVisible()
  await expect(hall).toContainText('3 れんしょう')
  // The party that got there is named.
  expect(await hall.locator('li').count()).toBeGreaterThan(0)

  await over.click()
  await expect(page.getByTestId('run-status')).toContainText('さいこう 3')
})

test('つるぎのまい で こうげき が あがり、こうたい で もどる', async ({ page }) => {
  // ヒトカゲ leads against ズバット rather than ゼニガメ: なみのり is 2x into
  // fire and knocks ヒトカゲ out in one, which would put a forced replacement
  // on screen instead of the switch panel this test needs.
  await page.evaluate((seed) => {
    localStorage.setItem(
      'pokemon-battle:run',
      JSON.stringify({
        ...seed,
        player: { ...seed.player, activeIndex: 1 },
        opponent: { ...seed.opponent, activeIndex: 1 },
      }),
    )
  }, SEED)
  await page.reload()

  await page.getByRole('button', { name: /つるぎのまい/ }).click()

  const playerCard = page.getByTestId('player-card')
  await expect(playerCard).toContainText('こうげき')
  await expect(page.getByTestId('battle-log')).toContainText(
    'こうげきが ぐーんと あがった',
  )

  // Leaving the field clears it.
  await page
    .getByRole('region', { name: 'こうたい' })
    .getByRole('button', { name: /フシギダネ/ })
    .click()
  await expect(playerCard).not.toContainText('こうげき')
})

test('小さい画面でも ログと わざ がスクロールなしで見える', async ({ page }) => {
  // 375x667 is an iPhone SE, the smallest phone worth designing for. The log
  // and the move buttons are what a player needs every single turn; the switch
  // panel is used rarely and is allowed to sit below the fold.
  await page.setViewportSize({ width: 375, height: 667 })
  await page.reload()
  await page.getByRole('region', { name: 'わざ' }).getByRole('button').first().click()

  const seen = await page.evaluate(() => {
    const share = (selector: string) => {
      const element = document.querySelector(selector)
      if (!element) return 0
      const box = element.getBoundingClientRect()
      const visible = Math.max(
        0,
        Math.min(innerHeight, box.bottom) - Math.max(0, box.top),
      )
      return visible / box.height
    }
    return { log: share('.log'), moves: share('.moves') }
  })

  expect(seen.log).toBe(1)
  expect(seen.moves).toBe(1)
})

test('とくせい が カードに出て、はたらく', async ({ page }) => {
  // イシツブテ has がんじょう and ゴース has ふゆう.
  await page.evaluate((seed) => {
    localStorage.setItem(
      'pokemon-battle:run',
      JSON.stringify({
        ...seed,
        opponent: {
          activeIndex: 0,
          members: [{ speciesId: 'gastly', level: 44, currentHp: 999, status: null }],
        },
      }),
    )
  }, SEED)
  await page.reload()

  await expect(page.getByTestId('opponent-card')).toContainText('ふゆう')

  // あなをほる is a ground move, which ふゆう ignores outright.
  await page.getByRole('button', { name: /あなをほる/ }).click()
  await expect(page.getByTestId('battle-log')).toContainText('ふゆう')
  await expect(page.getByTestId('opponent-hp')).toHaveText(/^(\d+) \/ \1 HP$/)
})

test('もちもの が ごほうび でもらえる', async ({ page }) => {
  await page.evaluate((seed) => {
    localStorage.setItem(
      'pokemon-battle:run',
      JSON.stringify({ ...seed, winner: 'player', offer: ['item'] }),
    )
  }, SEED)
  await page.reload()

  await page.getByRole('button', { name: /もちものを もらう/ }).click()
  // Somebody in the party is now holding something.
  await expect(page.getByTestId('player-card')).toContainText(
    /たべのこし|きあいのタスキ|たつじんのおび|オボンのみ/,
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

test.describe('ドラフト', () => {
  // The saved run from the outer beforeEach would skip the draft entirely.
  test.beforeEach(async ({ page }) => {
    await page.evaluate(() => localStorage.clear())
    await page.reload()
  })

  test('セーブがなければ 6 匹から 3 匹えらんでから始まる', async ({ page }) => {
    await expect(page.getByRole('region', { name: 'てもちを えらぶ' })).toBeVisible()
    const panel = page.getByTestId('draft-candidates')
    await expect(panel.getByRole('button')).toHaveCount(DRAFT_CONFIG.candidates)
    await expect(page.getByRole('region', { name: 'わざ' })).toHaveCount(0)

    const start = page.getByRole('button', { name: 'この てもちで はじめる' })
    await expect(start).toBeDisabled()

    const names: string[] = []
    for (let i = 0; i < DRAFT_CONFIG.picks; i++) {
      const candidate = panel.getByRole('button').nth(i)
      names.push((await candidate.locator('strong').textContent()) ?? '')
      await candidate.click()
      await expect(candidate).toHaveAttribute('aria-pressed', 'true')
    }
    await expect(start).toBeEnabled()
    await start.click()

    await expect(page.getByTestId('run-status')).toContainText('れんしょう 0')
    await expect(page.getByTestId('player-team')).toHaveAttribute(
      'aria-label',
      'てもち のこり 3',
    )
    // The first one taken leads the first battle.
    await expect(page.getByTestId('player-card')).toContainText(names[0]!)
  })

  test('もう一度おすと選択がもどる', async ({ page }) => {
    const first = page.getByTestId('draft-candidates').getByRole('button').first()
    await first.click()
    await expect(first).toHaveAttribute('aria-pressed', 'true')
    await first.click()
    await expect(first).toHaveAttribute('aria-pressed', 'false')
    await expect(
      page.getByRole('button', { name: 'この てもちで はじめる' }),
    ).toBeDisabled()
  })

  test('リロードしても 候補は引き直せない', async ({ page }) => {
    const panel = page.getByTestId('draft-candidates')
    const dealt = await panel.getByRole('button').locator('strong').allTextContents()

    await page.reload()
    expect(await panel.getByRole('button').locator('strong').allTextContents()).toEqual(
      dealt,
    )
  })

  test('小さい画面でも 6 匹ぜんぶ見える', async ({ page }) => {
    // Same 375x667 phone the battle screen is held to: a choice the player
    // cannot see all of is not a choice.
    await page.setViewportSize({ width: 375, height: 667 })
    await page.reload()

    const seen = await page.evaluate(() => {
      const box = document.querySelector('.draft')?.getBoundingClientRect()
      if (!box) return 0
      const visible = Math.max(
        0,
        Math.min(innerHeight, box.bottom) - Math.max(0, box.top),
      )
      return visible / box.height
    })
    expect(seen).toBe(1)
  })
})

test.describe('さいしゅうせん', () => {
  const wins = RUN_CONFIG.battlesToClear - 1
  const boss = BOSS_LIST[0]!

  // A save sitting on the last battle, with the boss on its last legs so the
  // clear is one click away rather than a whole fight's worth of luck.
  test.beforeEach(async ({ page }) => {
    await page.evaluate(
      ({ seed, wins, bossId, level }) => {
        localStorage.clear()
        localStorage.setItem(
          'pokemon-battle:run',
          JSON.stringify({
            ...seed,
            wins,
            opponent: {
              activeIndex: 0,
              members: [{ speciesId: bossId, level, currentHp: 1, status: null }],
            },
          }),
        )
      },
      { seed: SEED, wins, bossId: boss.id, level: opponentLevel(wins) },
    )
    await page.reload()
  })

  test('ラストだと分かり、ボスが 1 匹で出てくる', async ({ page }) => {
    await expect(page.getByTestId('run-status')).toContainText('さいしゅうせん')
    await expect(page.getByTestId('run-status')).toContainText(
      `れんしょう ${wins} / ${RUN_CONFIG.battlesToClear}`,
    )
    await expect(page.getByTestId('opponent-card')).toContainText(boss.name)
    await expect(page.getByTestId('opponent-team')).toHaveAttribute(
      'aria-label',
      'あいての てもち のこり 1',
    )
  })

  test('倒すとクリアになり、ごほうびは出ない', async ({ page }) => {
    const moves = page.getByRole('region', { name: 'わざ' })
    for (let i = 0; i < 20; i++) {
      if (!(await moves.count())) break
      await moves.getByRole('button').first().click()
    }

    await expect(page.getByRole('status')).toContainText('ぜんぶ かちぬいた')
    await expect(page.getByTestId('run-status')).toContainText(
      `れんしょう ${RUN_CONFIG.battlesToClear}`,
    )
    await expect(page.getByRole('region', { name: 'ごほうびを えらぶ' })).toHaveCount(0)
    await expect(page.getByTestId('hall-of-fame')).toContainText('クリア')

    // Reloading a cleared run keeps it cleared rather than resuming a battle.
    await page.reload()
    await expect(page.getByRole('status')).toContainText('ぜんぶ かちぬいた')

    // Clearing tier 1 from nothing opens tier 2, so the button points at it.
    await page.getByRole('button', { name: 'だんかい 2へ' }).click()
    await expect(page.getByRole('region', { name: 'てもちを えらぶ' })).toBeVisible()
  })
})

test.describe('とんぼがえり', () => {
  // ストライク leads, because it is the one that knows とんぼがえり.
  test.beforeEach(async ({ page }) => {
    const level = RUN_CONFIG.playerLevel
    await page.evaluate(
      ({ seed, level }) => {
        localStorage.setItem(
          'pokemon-battle:run',
          JSON.stringify({
            ...seed,
            player: {
              activeIndex: 0,
              members: ['scyther', 'pikachu', 'geodude'].map((speciesId) => ({
                speciesId,
                level,
                currentHp: 999,
                status: null,
              })),
            },
          }),
        )
      },
      { seed: SEED, level },
    )
    await page.reload()
  })

  test('だれを出すか選んでから、攻撃と交代が 1 ターンで起きる', async ({ page }) => {
    await page.getByRole('button', { name: /とんぼがえり/ }).click()

    const panel = page.getByRole('region', { name: /あとに だす/ })
    await expect(panel).toBeVisible()
    // The turn has not been spent yet.
    await expect(page.getByTestId('battle-log')).not.toContainText('とんぼがえり')

    await panel.getByRole('button').and(page.locator(':not([disabled])')).first().click()

    await expect(page.getByTestId('battle-log')).toContainText('とんぼがえり')
    await expect(page.getByTestId('player-card')).not.toContainText('ストライク')
  })

  test('やめる で ターンを使わずに戻れる', async ({ page }) => {
    await page.getByRole('button', { name: /とんぼがえり/ }).click()
    await page.getByRole('button', { name: 'やめる' }).click()

    await expect(page.getByRole('region', { name: 'わざ' })).toBeVisible()
    await expect(page.getByTestId('battle-log')).not.toContainText('とんぼがえり')
    await expect(page.getByTestId('player-card')).toContainText('ストライク')
  })
})

test.describe('だんかい', () => {
  test.beforeEach(async ({ page }) => {
    await page.evaluate(() => localStorage.clear())
    await page.reload()
  })

  test('最初は だんかい 1 だけ、ほかは 鍵がかかっている', async ({ page }) => {
    const tiers = page.getByTestId('tier-row').getByRole('button')
    await expect(tiers).toHaveCount(TIER_CONFIG.max)
    await expect(tiers.nth(0)).toHaveAttribute('aria-pressed', 'true')
    await expect(tiers.nth(1)).toBeDisabled()
    await expect(page.getByTestId('run-status')).toContainText('だんかい 1')
  })

  test('クリアすると つぎの だんかい が あく', async ({ page }) => {
    const wins = RUN_CONFIG.battlesToClear - 1
    await page.evaluate(
      ({ seed, wins, bossId, level }) => {
        localStorage.setItem(
          'pokemon-battle:run',
          JSON.stringify({
            ...seed,
            wins,
            opponent: {
              activeIndex: 0,
              members: [{ speciesId: bossId, level, currentHp: 1, status: null }],
            },
          }),
        )
      },
      { seed: SEED, wins, bossId: BOSS_LIST[0]!.id, level: opponentLevel(wins) },
    )
    await page.reload()

    const moves = page.getByRole('region', { name: 'わざ' })
    for (let i = 0; i < 20; i++) {
      if (!(await moves.count())) break
      await moves.getByRole('button').first().click()
    }

    await expect(page.getByRole('status')).toContainText('だんかい 2が あいた')
    await page.getByRole('button', { name: 'だんかい 2へ' }).click()

    const tiers = page.getByTestId('tier-row').getByRole('button')
    await expect(tiers.nth(1)).toHaveAttribute('aria-pressed', 'true')
    await expect(tiers.nth(2)).toBeDisabled()
    // The unlock outlives the run that earned it.
    await page.reload()
    await expect(tiers.nth(1)).toBeEnabled()
  })

  test('えらんだ だんかい の ぶんだけ 相手が強い', async ({ page }) => {
    await page.evaluate(() => {
      // The draft saved a moment ago remembers tier 1; a returning player with
      // no draft in progress is the case under test.
      localStorage.removeItem('pokemon-battle:draft')
      localStorage.setItem(
        'pokemon-battle:progress',
        JSON.stringify({ version: 1, cleared: 2 }),
      )
    })
    await page.reload()

    await expect(page.getByTestId('run-status')).toContainText('だんかい 3')
    await draft(page)
    await expect(page.getByTestId('run-status')).toContainText(
      `あいて Lv${opponentLevel(0, 3)}`,
    )
  })
})
