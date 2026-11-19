import { test } from 'node:test'
import assert from 'node:assert/strict'
import { backup, belongs, fresh, futureDates, localDate, maintain, moveTask, offsetDate, restore, retention, type Task } from '../src/data/model.ts'

const now = new Date(2026, 10, 19, 11)
const timestamp = now.toISOString()
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

test('restore preserves future or clear dates and rolls past dates forward', () => {
  for (const [date, expected] of [[null, null], [tomorrow, tomorrow], [yesterday, today]]) {
    const row = restore(task('x', { date, completed: true, completedAt: timestamp }), today)
    assert.equal(row.date, expected)
    assert.equal(row.completedAt, null)
  }
  assert.equal(restore(task('x', { deletedAt: timestamp }), today, true).deletedAt, null)
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
