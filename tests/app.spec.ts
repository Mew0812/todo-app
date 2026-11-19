import { expect, test, type Page } from '@playwright/test'

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const card = (page: Page, name: string) => page.locator('.task-card').filter({ has: button(page, name) })

async function add(page: Page, title: string, group?: string) {
  await button(page, 'タスクを追加').click()
  const sheet = page.getByRole('dialog', { name: 'タスクを追加' })
  await sheet.getByLabel('タスク名').fill(title)
  if (group) {
    await sheet.getByText('詳細設定').click()
    await sheet.getByLabel('グループ').selectOption({ label: group })
  }
  await sheet.getByRole('button', { name: '追加', exact: true }).click()
  await expect(sheet).toBeHidden()
}

async function createGroup(page: Page, name: string) {
  await button(page, 'グループを追加').click()
  await page.getByLabel('新しいグループ名').fill(name)
  await button(page, '追加').click()
  await expect(button(page, name)).toBeVisible()
}

test('mobile lifecycle, autosave, dates, reload and offline startup', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByText('今日のタスクはありません')).toBeVisible()
  const original = '折り返して表示する長いタスク名'.repeat(10)
  await add(page, original)
  await expect(card(page, original)).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)

  await button(page, original).click()
  const detail = page.getByRole('dialog', { name: 'タスクの詳細' })
  await detail.getByLabel('タスク名').fill('買い物')
  await detail.getByText('チェックリスト').click()
  await detail.getByLabel('新しい項目').fill('牛乳')
  await detail.getByRole('button', { name: 'チェック項目を追加' }).click()
  await detail.getByRole('checkbox', { name: '牛乳' }).check()
  await detail.locator('.detail-meta button').first().click()
  await page.getByRole('dialog', { name: '予定日を選択' }).getByRole('button', { name: '明日', exact: true }).click()
  await expect(card(page, original)).toHaveCount(1)
  const grip = (await detail.locator('.sheet-grip').boundingBox())!
  const touch = await context.newCDPSession(page)
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchStart', touchPoints: [{ x: grip.x + grip.width / 2, y: grip.y + 15 }],
  })
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchMove', touchPoints: [{ x: grip.x + grip.width / 2, y: grip.y + 110 }],
  })
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect(detail).toBeHidden()
  await expect(button(page, '買い物')).toHaveCount(0)
  await button(page, '今後の予定').click()
  await expect(card(page, '買い物')).toContainText('1/1')

  await card(page, '買い物').locator('.task-date').click()
  await page.getByRole('dialog', { name: '予定日を選択' }).getByRole('button', { name: '今日', exact: true }).click()
  await expect(button(page, '買い物')).toHaveCount(0)
  await button(page, '今日').click()
  await card(page, '買い物').getByRole('button', { name: '完了にする' }).click()
  await page.getByText('今日の完了済み（1件）').click()
  await button(page, '買い物').click()
  await expect(page.getByLabel('タスク名')).not.toBeEditable()
  await button(page, 'シートを閉じる').click()
  await button(page, '戻す').click()
  await card(page, '買い物').getByRole('button', { name: '削除', exact: true }).click()
  await button(page, '元に戻す').click()
  await expect(card(page, '買い物')).toBeVisible()

  await button(page, 'カレンダー').click()
  await expect(page.locator('.calendar-grid i')).toHaveCount(1)
  await expect(button(page, '買い物')).toBeVisible()
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
  await context.setOffline(true)
  await page.reload()
  await expect(card(page, '買い物')).toBeVisible()
})

test('group management, collapse persistence and touch long-press behavior', async ({ page, context }) => {
  await page.goto('/')
  await button(page, '設定').click()
  await createGroup(page, '仕事')
  await createGroup(page, '生活')
  const groupRow = page.locator('.sortable-row').filter({ has: button(page, '生活') })
  const workRow = page.locator('.sortable-row').filter({ has: button(page, '仕事') })
  const source = (await groupRow.boundingBox())!
  const target = (await workRow.boundingBox())!
  await page.mouse.move(source.x + 30, source.y + 24)
  await page.mouse.down()
  await page.waitForTimeout(460)
  await page.mouse.move(target.x + 30, target.y + 20, { steps: 10 })
  await page.mouse.up()
  await expect(page.locator('.settings-row .text-button').first()).toHaveText('生活')
  await button(page, 'シートを閉じる').click()
  await add(page, '提出', '仕事')
  await add(page, '水やり', '生活')

  const task = card(page, '提出')
  const original = (await task.boundingBox())!
  const group = (await page.locator('.group-heading').filter({ hasText: '生活' }).boundingBox())!
  const touch = await context.newCDPSession(page)
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchStart', touchPoints: [{ x: original.x + 10, y: original.y + 20 }],
  })
  await page.waitForTimeout(460)
  await expect(page.locator('.floating-card')).toBeVisible()
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchMove', touchPoints: [{ x: group.x + 12, y: group.y + 25 }],
  })
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect(page.locator('.task-group').filter({ hasText: '生活' }).getByRole('button', { name: '提出' })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: /生活\s*2/ }).click()
  await expect(card(page, '提出')).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('button', { name: /生活\s*2/ })).toHaveAttribute('aria-expanded', 'false')
  await expect(card(page, '提出')).toHaveCount(0)
  await page.getByRole('button', { name: /生活\s*2/ }).click()
  await expect(card(page, '提出')).toBeVisible()
  await button(page, '設定').click()
  await button(page, '生活のメニュー').click()
  await button(page, 'グループを削除').click()
  await button(page, 'シートを閉じる').click()
  await expect(page.locator('.task-group').filter({ hasText: '未分類' }).getByRole('button', { name: '提出' })).toBeVisible()
})

test('backup is downloadable and import replaces atomically after validation', async ({ page }) => {
  await page.goto('/')
  await add(page, 'バックアップ対象')
  await button(page, '設定').click()
  const download = page.waitForEvent('download')
  await button(page, 'エクスポート').click()
  const file = await download
  expect(file.suggestedFilename()).toMatch(/^mytodo-.*\.json$/)
  const input = page.locator('input[type=file]')
  await input.setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"version":0}') })
  await expect(page.locator('.toast')).toContainText('読み込めません')
  await button(page, '閉じる').click()
  await expect(card(page, 'バックアップ対象')).toHaveCount(1)
  await button(page, 'シートを閉じる').click()
  await add(page, 'あとで追加')
  await button(page, '設定').click()
  page.once('dialog', dialog => dialog.accept())
  await input.setInputFiles((await file.path())!)
  await expect(page.locator('.toast')).toContainText('復元しました')
  await expect(card(page, 'あとで追加')).toHaveCount(0)
  await expect(card(page, 'バックアップ対象')).toHaveCount(1)
})
