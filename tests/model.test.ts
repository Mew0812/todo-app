import { test } from 'node:test'
import assert from 'node:assert/strict'
import { backup, belongs, fresh, futureDates, localDate, maintain, moveTask, moveWithinDate, moveTomorrowToToday, offsetDate, preserveTomorrowMoves, restore, retention, updateTask, type Task } from '../src/data/model.ts'

const now = new Date(2026, 10, 19, 11)
const timestamp = now.toISOString()

test('manual tomorrow move preserves fields, excludes completed and trashed tasks, and keeps history after restore', () => {
  const current = localDate(now)
  const tomorrow = offsetDate(current, 1)
  const later = offsetDate(current, 2)
  const data = fresh()
  data.groups.push({ id: 'g', name: '仕事', color: '#a18bfa', collapsed: false })
  data.tasks = [
    task('target', { date: tomorrow, groupId: 'g', important: true, order: 6, note: 'メモ',
      checklist: [{ id: 'check', title: '確認', checked: true }] }),
    task('today', { date: current }), task('later', { date: later }),
    task('done', { date: tomorrow, completed: true, completedAt: timestamp }),
    task('trash', { date: tomorrow, deletedAt: timestamp }),
  ]
  const moved = moveTomorrowToToday(data, now)
  assert.deepEqual(moved.tasks[0], { ...data.tasks[0], date: current, updatedAt: timestamp })
  assert.deepEqual(moved.tasks.slice(1), data.tasks.slice(1))
  assert.deepEqual(backup.parse(JSON.parse(JSON.stringify(moved))).settings.tomorrowMoves, [current])
  const restored = preserveTomorrowMoves(moved, data)
  assert.equal(moveTomorrowToToday(restored, now), restored)
  const next = maintain(moved, new Date(2026, 10, 20))
  assert.equal(next.tasks[0].date, tomorrow)
  assert.equal(next.tasks[2].date, later)
})
const today = localDate(now)
const yesterday = offsetDate(today, -1)
const tomorrow = offsetDate(today, 1)
test('future date range is consecutive across month ends, years and leap days', () => {
  for (const [today, first, last, count] of [
    ['2026-11-19', '2026-11-20', '2026-12-31', 42],
    ['2026-11-30', '2026-12-01', '2026-12-31', 31],
    ['2026-12-15', '2026-12-16', '2027-01-31', 47],
    ['2028-01-10', '2028-01-11', '2028-02-29', 50],
    ['2027-01-10', '2027-01-11', '2027-02-28', 49],
  ] as const) {
    const dates = futureDates(today)
    assert.equal(dates[0], first)
    assert.equal(dates.at(-1), last)
    assert.equal(dates.length, count)
    dates.forEach((date, index) => assert.equal(date, offsetDate(first, index)))
  }
})
const task = (id: string, options: Partial<Task> = {}): Task => ({
  id, title: id, date: yesterday, groupId: null, important: false, note: '', checklist: [],
  completed: false, completedAt: null, deletedAt: null, order: 0, createdAt: timestamp, updatedAt: timestamp, ...options,
})

test('overdue tasks roll forward, unscheduled and future tasks keep their dates', () => {
  const result = maintain({ ...fresh(), tasks: [task('a'), task('b', { date: null }), task('c', { date: tomorrow })] }, now)
  assert.deepEqual(result.tasks.map(row => row.date), [today, null, tomorrow])
  assert.deepEqual(result.tasks.filter(row => belongs(row, '今日', today)).map(row => row.id), ['a'])
  assert.deepEqual(result.tasks.filter(row => belongs(row, '明日以降', today)).map(row => row.id), ['c'])
  assert.equal(maintain(result, now), result)
})

test('completion and trash expire at the 30-day boundary', () => {
  const end = new Date(now.getTime() - retention).toISOString()
  const before = new Date(now.getTime() - retention + 1).toISOString()
  const result = maintain({ ...fresh(), tasks: [
    task('completed', { completed: true, completedAt: end }), task('deleted', { deletedAt: end }),
    task('recent-completed', { completed: true, completedAt: before }), task('recent-trash', { deletedAt: before }),
  ] }, now)
  assert.deepEqual(result.tasks.map(row => row.id), ['recent-completed', 'recent-trash'])
})

test('restore retains original dates until active rollover', () => {
  for (const date of [null, tomorrow, yesterday]) {
    const row = restore(task('x', { date, completed: true, completedAt: timestamp }))
    assert.equal(row.date, date)
    assert.equal(row.completedAt, null)
    assert.equal(belongs(maintain({ ...fresh(), tasks: [row] }, now).tasks[0], '今日', today), date === yesterday)
  }
  assert.equal(restore(task('x', { deletedAt: timestamp }), true).deletedAt, null)
})

test('rollover preserves stars, order, and the dates of completed and deleted tasks', () => {
  const before = { ...fresh(), tasks: [
    task('overdue', { important: true, order: 4, note: 'keep' }),
    task('due', { date: tomorrow, order: 2 }),
    task('closed', { completed: true, completedAt: timestamp }),
    task('trashed', { deletedAt: timestamp }),
  ] }
  const next = new Date(2026, 10, 20, 0)
  const rolled = maintain(before, next)
  assert.deepEqual(rolled.tasks.map(row => row.date), [tomorrow, tomorrow, yesterday, yesterday])
  assert.deepEqual(rolled.tasks.map(row => row.important), [true, false, false, false])
  assert.deepEqual(rolled.tasks.map(row => row.order), [4, 2, 0, 0])
  assert.equal(rolled.tasks[0].note, 'keep')
  assert.equal(rolled.tasks[2], before.tasks[2])
  assert.equal(rolled.tasks[3], before.tasks[3])
  const imported = backup.parse(JSON.parse(JSON.stringify(rolled)))
  assert.equal(maintain(imported, next), imported)
})
test('moving to an empty or populated date preserves task details and order on other dates', () => {
  const source = task('a', { date: today, groupId: 'g', note: 'memo', order: 3,
    checklist: [{ id: 'i', title: 'item', checked: true }] })
  const data = { ...fresh(), tasks: [task('b', { date: tomorrow }), task('c', { date: tomorrow, order: 1 }), source] }
  const moved = moveWithinDate(data, 'a', tomorrow, 'c')
  const ordered = [...moved.tasks].sort((a, b) => a.order - b.order)
  assert.deepEqual(ordered.map(row => row.id), ['b', 'a', 'c'])
  assert.deepEqual([ordered[1].date, ordered[1].groupId, ordered[1].note, ordered[1].checklist],
    [tomorrow, source.groupId, source.note, source.checklist])
  const emptyDate = offsetDate(tomorrow, 1)
  const empty = moveWithinDate(moved, 'a', emptyDate)
  assert.equal(empty.tasks.filter(row => row.date === emptyDate)[0].id, 'a')
  assert.equal(new Set(empty.tasks.map(row => row.id)).size, data.tasks.length)
})

test('manual move changes group and inserts before the destination task', () => {
  const data = { ...fresh(), groups: [{ id: 'g', name: '仕事', color: '#a18bfa' as const, collapsed: false }],
    tasks: [task('a', { groupId: 'g' }), task('b', { groupId: 'g', order: 1 }), task('c')] }
  const result = moveTask(data, 'c', 'g', 'b')
  assert.deepEqual(result.tasks.sort((a, b) => a.order - b.order).map(row => [row.id, row.groupId]),
    [['a', 'g'], ['c', 'g'], ['b', 'g']])
})

test('backup rejects duplicate IDs, invalid dates, invalid version and orphaned groups', () => {
  const data = { ...fresh(), tasks: [task('a')] }
  assert.deepEqual(backup.parse(JSON.parse(JSON.stringify(data))), data)
  for (const invalid of [{ ...data, version: 2 }, { ...data, tasks: [task('a'), task('a')] },
    { ...data, tasks: [task('a', { date: '2026-02-30' })] }, { ...data, tasks: [task('a', { groupId: 'missing' })] }]) {
    assert.equal(backup.safeParse(invalid).success, false)
  }
})

test('legacy backup drops the sort preference and keeps task positions', () => {
  const data = { ...fresh(), tasks: [task('a', { order: 7 }), task('b', { order: 2 })] }
  const legacy = { ...data, settings: { ...data.settings,
    sort: { 今日: '予定日の昇順', すべて: '予定日の昇順', 今後の予定: '重要なタスクを先頭に表示' } } }
  const migrated = backup.parse(legacy)
  assert.deepEqual(migrated.settings, data.settings)
  assert.deepEqual(migrated.tasks, data.tasks)
})

test('starring moves only within the Today group or the future date without changing membership', () => {
  const current = localDate()
  const future = offsetDate(current, 1)
  const data = { ...fresh(), tasks: [
    task('other-group', { date: current, groupId: 'other', order: 0 }),
    task('group-first', { date: current, groupId: 'work', order: 1 }),
    task('group-second', { date: current, groupId: 'work', order: 2 }),
    task('future-first', { date: future, groupId: 'other', order: 3 }),
    task('future-second', { date: future, groupId: 'work', order: 4 }),
  ] }
  const star = (data: ReturnType<typeof fresh>, id: string, important: boolean) =>
    updateTask(data, id, row => ({ ...row, important }))
  const ids = (data: ReturnType<typeof fresh>) => [...data.tasks].sort((a, b) => a.order - b.order).map(row => row.id)
  const todayStar = star(data, 'group-second', true)
  assert.deepEqual(ids(todayStar), ['other-group', 'group-second', 'group-first', 'future-first', 'future-second'])
  const futureStar = star(todayStar, 'future-second', true)
  assert.deepEqual(ids(futureStar), ['other-group', 'group-second', 'group-first', 'future-second', 'future-first'])
  assert.deepEqual(ids(star(futureStar, 'future-second', false)), ids(futureStar))
  assert.deepEqual(futureStar.tasks.map(row => row.groupId), data.tasks.map(row => row.groupId))
})
