import { expect, test, type Page } from '@playwright/test'
import { formatDate, fresh, futureDates, iso, localDate, offsetDate } from '../src/data/model'

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
  await expect(card(page, original).locator('.task-meta')).toHaveCount(0)
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
  await button(page, '明日以降').click()
  await expect(card(page, '買い物')).toContainText('1/1')

  await button(page, '買い物').click()
  await detail.locator('.detail-meta button').first().click()
  await page.getByRole('dialog', { name: '予定日を選択' }).getByRole('button', { name: '今日', exact: true }).click()
  await detail.getByRole('button', { name: 'シートを閉じる' }).click()
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

test('future headings list every date and allow quick-add with an editable, required date', async ({ page }) => {
  const dates = futureDates(localDate())
  await page.goto('/')
  await expect(page.locator('.tabs button')).toHaveText(['今日', '明日以降'])
  await expect(button(page, '今日')).toHaveAttribute('aria-pressed', 'true')
  await button(page, '明日以降').click()
  await expect(page.locator('.date-section')).toHaveCount(dates.length)
  expect(await page.locator('.date-section').evaluateAll(rows => rows.map(row => row.getAttribute('data-date')))).toEqual(dates)
  const section = (date: string) => page.locator(`[data-date="${date}"]`)
  await expect(section(dates[0]).locator('.task-list')).toHaveCount(0)
  await section(dates[0]).getByRole('button').click()
  const dialog = page.getByRole('dialog', { name: 'タスクを追加' })
  await expect(dialog.getByLabel('予定日')).toHaveValue(dates[0])
  await dialog.getByLabel('予定日').fill(dates[1])
  await dialog.getByLabel('タスク名').fill('日付から追加')
  await dialog.getByRole('button', { name: '追加' }).click()
  await expect(section(dates[1]).getByText('日付から追加')).toBeVisible()
  await expect(section(dates[0]).locator('.task-card')).toHaveCount(0)
  await expect(page.locator('.group-heading, .task-meta')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await button(page, 'タスクを追加').click()
  await dialog.getByLabel('タスク名').fill('日付が必要')
  await dialog.getByRole('button', { name: '追加' }).click()
  await expect(dialog).toBeVisible()
  expect(await dialog.getByLabel('予定日').evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true)
})

test('future date range updates across midnight without reopening the app', async ({ page }) => {
  await page.clock.install({ time: new Date(2026, 10, 30, 23, 59, 50) })
  await page.goto('/')
  await button(page, '明日以降').click()
  await expect(page.locator('.date-section').first()).toHaveAttribute('data-date', '2026-12-01')
  await expect(page.locator('.date-section').last()).toHaveAttribute('data-date', '2026-12-31')
  await page.clock.fastForward(31_000)
  await expect(page.locator('.date-section').first()).toHaveAttribute('data-date', '2026-12-02')
  await expect(page.locator('.date-section').last()).toHaveAttribute('data-date', '2027-01-31')
})

test('add sheet keeps the date anchor on save and cancel and preserves FAB scroll position', async ({ page }) => {
  await page.goto('/')
  await button(page, '明日以降').click()
  const heading = page.locator('.date-heading button').nth(10)
  const dialog = page.getByRole('dialog', { name: 'タスクを追加' })
  await heading.evaluate(element => window.scrollBy(0, element.getBoundingClientRect().top - 250))
  const top = () => heading.evaluate(element => element.getBoundingClientRect().top)
  const originalTop = await top()
  await heading.tap()
  await dialog.getByLabel('タスク名').fill('空の日から追加')
  await page.locator('.date-section').first().evaluate(element => { (element as HTMLElement).style.paddingTop = '45px' })
  await dialog.getByRole('button', { name: '追加', exact: true }).tap()
  await expect(dialog).toBeHidden()
  await expect.poll(async () => Math.abs(await top() - originalTop)).toBeLessThan(2)
  await expect(heading).toBeInViewport()
  await expect(card(page, '空の日から追加')).toBeInViewport()

  await heading.tap()
  await dialog.getByLabel('タスク名').fill('追加済みの日から追加')
  await dialog.getByRole('button', { name: '追加', exact: true }).tap()
  await expect(dialog).toBeHidden()
  await expect.poll(async () => Math.abs(await top() - originalTop)).toBeLessThan(2)
  await expect(card(page, '追加済みの日から追加')).toBeInViewport()

  await heading.tap()
  await dialog.getByRole('button', { name: 'シートを閉じる' }).tap()
  await expect.poll(async () => Math.abs(await top() - originalTop)).toBeLessThan(2)
  const y = await page.evaluate(() => scrollY)
  await button(page, 'タスクを追加').tap()
  await dialog.getByLabel('予定日').fill(futureDates(localDate())[0])
  await dialog.getByLabel('タスク名').fill('プラスから追加')
  await dialog.getByRole('button', { name: '追加', exact: true }).tap()
  await expect(dialog).toBeHidden()
  // The content above grows on FAB save; the original document offset still wins.
  await expect.poll(async () => Math.abs(await page.evaluate(() => scrollY) - y)).toBeLessThan(2)
})

test('add details disclosure preserves focused form fields through a keyboard viewport change', async ({ page }) => {
  await page.goto('/')
  await button(page, 'タスクを追加').tap()
  const dialog = page.getByRole('dialog', { name: 'タスクを追加' })
  const title = dialog.getByLabel('タスク名')
  const details = dialog.locator('details')
  const disclosure = details.locator('summary')
  await title.fill('詳細を入力するタスク')
  await expect(title).toBeFocused()
  await page.evaluate(() => {
    const viewport = visualViewport!
    Object.defineProperty(viewport, 'height', { configurable: true, value: 340 })
    viewport.dispatchEvent(new Event('resize'))
  })
  await disclosure.tap()
  await expect(details).toHaveAttribute('open', '')
  await expect(dialog).toBeVisible()
  await expect(title).toHaveValue('詳細を入力するタスク')
  const date = futureDates(localDate())[0]
  await dialog.getByLabel('予定日').fill(date)
  await dialog.getByLabel('重要').check()
  await dialog.getByLabel('メモ').fill('詳細に書いたメモ')
  await disclosure.tap()
  await expect(details).not.toHaveAttribute('open', '')
  await expect(dialog).toBeVisible()
  await expect(card(page, '詳細を入力するタスク')).toHaveCount(0)
  await disclosure.tap()
  await expect(dialog.getByLabel('予定日')).toHaveValue(date)
  await expect(dialog.getByLabel('メモ')).toHaveValue('詳細に書いたメモ')
  await dialog.getByRole('button', { name: '追加', exact: true }).tap()
  await expect(dialog).toBeHidden()
  await page.evaluate(() => {
    const viewport = visualViewport!
    Reflect.deleteProperty(viewport, 'height')
    viewport.dispatchEvent(new Event('resize'))
  })
  await button(page, '明日以降').tap()
  await expect(card(page, '詳細を入力するタスク').getByRole('button', { name: '重要' }))
    .toHaveAttribute('aria-pressed', 'true')
})

test('version 1 backup preserves undated tasks, sorting settings, and dates outside the range', async ({ page }) => {
  await page.goto('/')
  const today = localDate()
  const outside = offsetDate(futureDates(today).at(-1)!, 1)
  const time = iso()
  const legacy = fresh()
  legacy.settings.sort['今後の予定'] = '重要なタスクを先頭に表示'
  legacy.groups.push({ id: 'work', name: '仕事', color: '#a18bfa', collapsed: true })
  const base = { completed: false, completedAt: null, deletedAt: null, createdAt: time, updatedAt: time,
    important: true, note: '元のメモ', checklist: [{ id: 'check', title: '元の項目', checked: true }], groupId: 'work', order: 0 }
  legacy.tasks.push({ ...base, id: 'old', title: '既存の未設定タスク', date: null },
    { ...base, id: 'later', title: '表示期間外', date: outside })
  await button(page, '設定').click()
  page.once('dialog', dialog => dialog.accept())
  await page.locator('input[type=file]').setInputFiles({
    name: 'legacy.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacy)),
  })
  await expect(page.locator('.toast')).toContainText('復元しました')
  await button(page, '閉じる').click()
  await page.getByText('日付未設定（1件）').click()
  await button(page, '既存の未設定タスク').click()
  const detail = page.getByRole('dialog', { name: 'タスクの詳細' })
  await expect(detail.getByRole('button', { name: '日付未設定' })).toBeVisible()
  await expect(detail.getByText('仕事', { exact: true })).toBeVisible()
  await expect(detail.getByLabel('チェック項目名')).toHaveValue('元の項目')
  await expect(detail.getByRole('button', { name: '★ 重要' })).toHaveAttribute('aria-pressed', 'true')
  await detail.locator('summary').filter({ hasText: 'メモ' }).click()
  await expect(detail.getByLabel('メモ')).toHaveValue('元のメモ')
  await detail.getByRole('button', { name: 'シートを閉じる' }).click()
  await button(page, 'シートを閉じる').click()
  await page.reload()
  await button(page, '明日以降').click()
  await expect(page.getByLabel('並び替え')).toHaveValue('重要なタスクを先頭に表示')
  await expect(button(page, '表示期間外')).toHaveCount(0)
  await button(page, 'カレンダー').click()
  await button(page, '次の月').click()
  await button(page, '次の月').click()
  await button(page, formatDate(outside)).click()
  await expect(button(page, '表示期間外')).toBeVisible()
})

test('touch drag inserts at a line within a date and across dates including empty days', async ({ page, context }) => {
  await page.goto('/')
  await button(page, '明日以降').click()
  const [first, second, third] = futureDates(localDate()).map(date => page.locator(`[data-date="${date}"]`))
  const dialog = page.getByRole('dialog', { name: 'タスクを追加' })
  for (const [section, name] of [[first, 'ジム'], [first, '複合機'], [third, '買い物']] as const) {
    await section.locator('h2 button').click()
    await dialog.getByLabel('タスク名').fill(name)
    await dialog.getByRole('button', { name: '追加' }).click()
    await expect(dialog).toBeHidden()
  }
  const touch = await context.newCDPSession(page)
  async function drag(name: string, target: typeof first, yFraction: number) {
    const source = (await card(page, name).boundingBox())!
    const end = (await target.boundingBox())!
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchStart', touchPoints: [{ x: source.x + 10, y: source.y + 20 }],
    })
    await expect(page.locator('.floating-card')).toBeVisible()
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x: end.x + 14, y: end.y + end.height * yFraction }],
    })
    await expect(page.locator('.drop-line')).toBeVisible()
    expect((await page.locator('.drop-line').boundingBox())!.height).toBe(3)
    await expect(page.locator('.drop-space, .drop-hover')).toHaveCount(0)
    expect((await target.boundingBox())!.height).toBe(end.height)
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect(page.locator('.floating-card')).toHaveCount(0)
    await expect(page.getByRole('dialog')).toHaveCount(0)
  }
  await drag('ジム', card(page, '複合機'), .8)
  await expect(first.locator('.task-name')).toHaveText(['複合機', 'ジム'])
  await drag('ジム', second.locator('h2 button'), .85)
  await expect(second.locator('.task-name')).toHaveText(['ジム'])
  await drag('ジム', card(page, '買い物'), .2)
  await expect(third.locator('.task-name')).toHaveText(['ジム', '買い物'])
  await page.reload()
  await button(page, '明日以降').click()
  await expect(third.locator('.task-name')).toHaveText(['ジム', '買い物'])
  await expect(page.locator('.task-name')).toHaveCount(3)
  const source = (await card(page, 'ジム').boundingBox())!
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchStart', touchPoints: [{ x: source.x + 10, y: source.y + 20 }],
  })
  await expect(page.locator('.floating-card')).toBeVisible()
  const scrollStart = await page.evaluate(() => scrollY)
  await touch.send('Input.dispatchTouchEvent', {
    type: 'touchMove', touchPoints: [{ x: source.x + 10, y: (await page.evaluate(() => innerHeight)) - 14 }],
  })
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(scrollStart)
  await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] })
  await expect(page.locator('.floating-card')).toHaveCount(0)
  await button(page, 'ジム').click()
  await expect(page.locator('.detail-meta').getByRole('button').first())
    .toHaveText(formatDate(futureDates(localDate())[2]))
})

test('midnight promotes due tasks above carryovers and preserves a later manual star change', async ({ page, context }) => {
  await page.clock.install({ time: new Date(2026, 10, 20, 23, 58) })
  await page.goto('/')
  await add(page, '洗濯')
  await button(page, '明日以降').click()
  const heading = page.locator('[data-date="2026-11-21"] h2 button')
  const dialog = page.getByRole('dialog', { name: 'タスクを追加' })
  for (const name of ['ジム', '買い物']) {
    await heading.click()
    await dialog.getByLabel('タスク名').fill(name)
    await dialog.getByRole('button', { name: '追加' }).click()
    await expect(dialog).toBeHidden()
  }
  await button(page, '今日').click()
  await expect(page.locator('.task-name')).toHaveText(['洗濯'])
  await page.clock.fastForward(121_000)
  await expect(page.locator('.task-name')).toHaveText(['ジム', '買い物', '洗濯'])
  const star = (target: Page, name: string) => card(target, name).getByRole('button', { name: '重要' })
  await expect(star(page, 'ジム')).toHaveAttribute('aria-pressed', 'true')
  await expect(star(page, '買い物')).toHaveAttribute('aria-pressed', 'true')
  await expect(star(page, '洗濯')).toHaveAttribute('aria-pressed', 'false')
  await star(page, 'ジム').click()
  await expect(star(page, 'ジム')).toHaveAttribute('aria-pressed', 'false')
  await page.close()
  const reopened = await context.newPage()
  await reopened.clock.install({ time: new Date(2026, 10, 21, 8) })
  await reopened.goto('/')
  await expect(star(reopened, 'ジム')).toHaveAttribute('aria-pressed', 'false')
  await expect(reopened.locator('.task-name')).toHaveText(['ジム', '買い物', '洗濯'])
  await button(reopened, '洗濯').click()
  await expect(reopened.locator('.detail-meta').getByRole('button').first()).toHaveText(formatDate('2026-11-20'))
})

test('first launch the next day promotes a scheduled task even if the app was closed', async ({ page, context }) => {
  await page.clock.install({ time: new Date(2026, 10, 20, 20) })
  await page.goto('/')
  await button(page, '明日以降').click()
  await page.locator('[data-date="2026-11-21"] h2 button').click()
  const dialog = page.getByRole('dialog', { name: 'タスクを追加' })
  await dialog.getByLabel('タスク名').fill('翌日初回起動')
  await dialog.getByRole('button', { name: '追加' }).click()
  await expect(dialog).toBeHidden()
  await page.close()
  const next = await context.newPage()
  await next.clock.install({ time: new Date(2026, 10, 21, 8) })
  await next.goto('/')
  await expect(card(next, '翌日初回起動').getByRole('button', { name: '重要' })).toHaveAttribute('aria-pressed', 'true')
  await expect(next.locator('.task-name')).toHaveCount(1)
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
  await expect(page.locator('.floating-card')).toHaveCount(0)
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
  await expect(page.locator('.ungrouped-tasks').getByRole('button', { name: '提出' })).toBeVisible()
  await expect(page.getByText('未分類')).toHaveCount(0)
})

test('legacy group-less tasks stay visible and can be reordered and moved in both directions', async ({ page }) => {
  await page.goto('/')
  const legacy = fresh()
  legacy.settings.ungroupedCollapsed = true
  legacy.groups.push({ id: 'clean', name: '掃除', color: '#a18bfa', collapsed: false })
  const time = iso()
  const base = { date: localDate(), createdAt: time, updatedAt: time, completed: false, completedAt: null,
    deletedAt: null, note: '保存済みのメモ', important: true, checklist: [], order: 0 }
  legacy.tasks.push({ ...base, id: 'a', title: '買い物', groupId: null },
    { ...base, id: 'b', title: '勉強', groupId: null, order: 1 },
    { ...base, id: 'c', title: '風呂', groupId: 'clean', order: 2 })
  await button(page, '設定').click()
  page.once('dialog', dialog => dialog.accept())
  await page.locator('input[type=file]').setInputFiles({
    name: 'previous.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(legacy)),
  })
  await expect(page.locator('.toast')).toContainText('復元しました')
  await button(page, '閉じる').click()
  await expect(page.getByText('未分類')).toHaveCount(0)
  await button(page, 'シートを閉じる').click()
  const cards = page.locator('.ungrouped-tasks .task-name')
  await expect(page.locator('main .task-name')).toHaveText(['買い物', '勉強', '風呂'])
  async function drag(name: string, destination: ReturnType<Page['locator']>, fraction: number) {
    const from = (await card(page, name).boundingBox())!
    await page.mouse.move(from.x + 15, from.y + 15)
    await page.mouse.down()
    await expect(page.locator('.floating-card')).toBeVisible()
    const to = (await destination.boundingBox())!
    await page.mouse.move(to.x + 15, to.y + to.height * fraction)
    await expect(page.locator('.drop-line')).toBeVisible()
    await page.mouse.up()
    await expect(page.locator('.floating-card')).toHaveCount(0)
  }
  await drag('勉強', card(page, '買い物'), .2)
  await expect(cards).toHaveText(['勉強', '買い物'])
  await drag('勉強', page.locator('.group-heading'), .5)
  await expect(page.locator('.task-group .task-name')).toHaveText(['勉強', '風呂'])
  await drag('買い物', page.locator('.group-heading'), .5)
  await expect(cards).toHaveCount(0)
  await drag('風呂', page.locator('.ungrouped-target'), .5)
  await expect(cards).toHaveText(['風呂'])
  await page.reload()
  await expect(cards).toHaveText(['風呂'])
  await expect(page.locator('main .task-name')).toHaveCount(3)
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
