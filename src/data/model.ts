import { z } from 'zod'

export const colors = ['#a18bfa', '#739cff', '#52bdee', '#51c7bd', '#62cb8b', '#a5c962',
  '#e6c45c', '#f5a367', '#f18285', '#f08eb7', '#cf8beb', '#c3a58b'] as const
export const tabs = ['今日', '明日以降'] as const
export type Tab = typeof tabs[number]
// Retain version 1 storage keys so existing settings and backups remain compatible.
const storedTabs = ['今日', 'すべて', '今後の予定'] as const
export const sortKey = (tab: Tab) => tab === '今日' ? '今日' : '今後の予定'
export const sorts = ['手動順', '重要なタスクを先頭に表示'] as const
const oldDateSort = '予定日の昇順'
function normalizeSort(sort: typeof sorts[number] | typeof oldDateSort) {
  return sort === oldDateSort ? '手動順' : sort
}
const id = z.string().min(1)
const timestamp = z.iso.datetime()
const date = z.iso.date()
const item = z.object({ id, title: z.string(), checked: z.boolean() })
const task = z.object({
  id, title: z.string().trim().min(1), groupId: id.nullable(), date: date.nullable(),
  important: z.boolean(), note: z.string(), checklist: z.array(item),
  completed: z.boolean(), createdAt: timestamp, updatedAt: timestamp,
  completedAt: timestamp.nullable(), order: z.number().int().nonnegative(), deletedAt: timestamp.nullable(),
  scheduledOn: date.optional(), promotedOn: date.optional(),
  todayTop: z.number().int().nonnegative().optional(),
}).refine(t => t.completed === Boolean(t.completedAt) && unique(t.checklist.map(i => i.id)))
export const backup = z.object({
  version: z.literal(1),
  tasks: z.array(task),
  groups: z.array(z.object({
    id, name: z.string().trim().min(1).refine(name => [...name].length <= 10 && name !== '未分類'),
    color: z.enum(colors), collapsed: z.boolean(),
  })).max(12),
  settings: z.object({
    sort: z.record(z.enum(storedTabs), z.enum([...sorts, oldDateSort]).transform(normalizeSort)),
    ungroupedCollapsed: z.boolean(),
    createdAt: timestamp, lastBackup: timestamp.nullable(),
  }),
}).refine(data => unique(data.tasks.map(t => t.id))
  && unique(data.groups.map(g => g.id)) && unique(data.groups.map(g => g.name))
  && unique(data.groups.map(g => g.color))
  && data.tasks.every(t => t.groupId === null || data.groups.some(g => g.id === t.groupId)))

function unique(values: string[]) { return new Set(values).size === values.length }
export type Data = z.infer<typeof backup>
export type Task = z.infer<typeof task>
export type Item = z.infer<typeof item>
export const dayMs = 86_400_000
export const retention = 30 * dayMs
export const iso = () => new Date().toISOString()
export const fresh = (): Data => ({
  version: 1, tasks: [], groups: [],
  settings: { sort: { 今日: '手動順', すべて: '手動順', 今後の予定: '手動順' },
    ungroupedCollapsed: false, createdAt: iso(), lastBackup: null },
})
export function localDate(date = new Date()) {
  const part = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}`
}
export const parseDate = (value: string) => new Date(value + 'T00:00:00')
export function offsetDate(value: string, days: number) {
  const date = parseDate(value)
  date.setDate(date.getDate() + days)
  return localDate(date)
}
export function futureRange(today: string) {
  const end = parseDate(today)
  end.setDate(1)
  end.setMonth(end.getMonth() + 2)
  end.setDate(0)
  return { start: offsetDate(today, 1), end: localDate(end) }
}
export function futureDates(today: string) {
  const { start, end } = futureRange(today)
  const dates: string[] = []
  for (let date = start; date <= end; date = offsetDate(date, 1)) dates.push(date)
  return dates
}
export const formatDate = (value: string | null) => value
  ? new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' }).format(parseDate(value))
  : '日付未設定'
export function maintain(data: Data, now = new Date()): Data {
  // IndexedDB may contain a sort value written by an older version.
  const sort = data.settings.sort
  const normalized = {
    今日: normalizeSort(sort.今日), すべて: normalizeSort(sort.すべて), 今後の予定: normalizeSort(sort.今後の予定),
  }
  if (storedTabs.some(tab => normalized[tab] !== sort[tab])) {
    data = { ...data, settings: { ...data.settings, sort: normalized } }
  }
  const today = localDate(now)
  const cutoff = now.getTime() - retention
  let changed = false
  const tasks = data.tasks.flatMap(task => {
    const expiry = task.deletedAt ?? task.completedAt
    if (expiry && Date.parse(expiry) <= cutoff) {
      changed = true
      return []
    }
    if (!expiry && task.date === today && task.promotedOn !== today
      && (task.scheduledOn ?? localDate(new Date(task.createdAt))) < today) {
      changed = true
      return [{ ...task, promotedOn: today, important: true, updatedAt: now.toISOString() }]
    }
    return [task]
  })
  return changed ? { ...data, tasks } : data
}
export function belongs(task: Task, tab: Tab, today: string) {
  if (task.completed || task.deletedAt || !task.date) return false
  return tab === '今日' ? task.date <= today : task.date > today && task.date <= futureRange(today).end
}

export function todayPriority(task: Task, today: string) {
  return task.date === today && localDate(new Date(task.createdAt)) === today ? task.todayTop ?? 0 : 0
}

export function addTask(data: Data, task: Task, atTop: boolean): Data {
  const groupId = data.groups.some(group => group.id === task.groupId) ? task.groupId : null
  const order = data.tasks.reduce((next, row) => Math.max(next, row.order + 1), 0)
  if (!atTop) return { ...data, tasks: [...data.tasks, { ...task, groupId, order }] }

  const todayTop = data.tasks.reduce((next, row) => Math.max(next, (row.todayTop ?? 0) + 1), 1)
  // Make room in the date/group's manual order while retaining existing relative positions.
  const tasks = data.tasks.map(row => row.groupId === groupId && row.date === task.date
    ? { ...row, order: row.order + 1 } : row)
  return {
    ...data, tasks: [...tasks, { ...task, groupId, order: 0, todayTop }],
    groups: data.groups.map(group => group.id === groupId && group.collapsed ? { ...group, collapsed: false } : group),
  }
}

export function changeDate(task: Task, date: string): Task {
  return task.date === date ? task : { ...task, date, scheduledOn: localDate(), todayTop: undefined }
}

export function moveWithinDate(data: Data, id: string, date: string, beforeId?: string): Data {
  const ordered = [...data.tasks].sort((a, b) => a.order - b.order)
  const eligible = (task: Task) => task.date === date && !task.completed && !task.deletedAt
  const moved = ordered.find(task => task.id === id && task.date && !task.completed && !task.deletedAt)
  if (!moved) return data
  const sameDay = ordered.filter(task => eligible(task) && task.id !== id)
  const destination = sameDay.findIndex(task => task.id === beforeId)
  sameDay.splice(destination < 0 ? sameDay.length : destination, 0, { ...changeDate(moved, date), updatedAt: iso() })
  let next = 0
  const positions = new Map(ordered.map((task, order) => {
    const row = eligible(task) || task.id === id ? sameDay[next++] : task
    return [row.id, row.order === order ? row : { ...row, order }]
  }))
  return { ...data, tasks: data.tasks.map(task => positions.get(task.id)!) }
}
export function restore(task: Task, fromTrash = false): Task {
  return fromTrash ? { ...task, deletedAt: null } : { ...task, completed: false, completedAt: null }
}
export function moveTask(data: Data, id: string, groupId: string | null, beforeId?: string, date?: string): Data {
  const task = data.tasks.find(t => t.id === id)
  if (!task || (groupId !== null && !data.groups.some(g => g.id === groupId))) return data
  const ordered = data.tasks.filter(t => t.id !== id && t.groupId === groupId)
    .sort((a, b) => a.order - b.order)
  const index = ordered.findIndex(t => t.id === beforeId)
  ordered.splice(index < 0 ? ordered.length : index, 0, {
    ...task, groupId, date: date ?? task.date, todayTop: undefined, updatedAt: iso(),
  })
  const updates = new Map(ordered.map((t, order) => [t.id, { ...t, order }]))
  return { ...data, tasks: data.tasks.map(t => updates.get(t.id) ?? t) }
}
