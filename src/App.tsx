import { useEffect, useRef, useState } from 'react'
import { CalendarDays, Check, ClipboardList, Plus, Settings2 } from 'lucide-react'
import { Calendar } from './components/Calendar'
import { useAddScroll } from './components/useAddScroll'
import { addTask, belongs, changeDate, formatDate, iso, localDate, moveTask, moveWithinDate, sortKey, restore as restoreTask, retention, colors,
  type Data, type Tab, type Task } from './data/model'
import { readBackup, update, type Change } from './data/storage'
import { Settings } from './screens/Settings'
import { AddTask, TaskDetail } from './screens/TaskSheets'
import { Todo, type Actions } from './screens/Todo'

type Detail = { task: Task; snapshot: Data }
type Leaving = { task: Task; tab: Tab }
const newest = (a: string | null, b: string | null) => (b ?? '').localeCompare(a ?? '')

export default function App() {
  const [data, setData] = useState<Data>()
  const [today, setToday] = useState(localDate)
  const [tab, setTab] = useState<Tab>('今日')
  const [screen, setScreen] = useState<'todo' | 'calendar'>('todo')
  const [selected, setSelected] = useState(localDate)
  const [settings, setSettings] = useState(false)
  const [adding, setAdding] = useState<{ date?: string }>()
  const addScroll = useAddScroll(Boolean(adding))
  const [completedOpen, setCompletedOpen] = useState(false)
  const [detail, setDetail] = useState<Detail>()
  const [undo, setUndo] = useState<Task>()
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [backupDismissed, setBackupDismissed] = useState(false)
  const [animations, setAnimations] = useState<Record<string, string>>({})
  const [leaving, setLeaving] = useState<Record<string, Leaving>>({})
  const undoTimer = useRef<number>(undefined)
  const refreshRef = useRef<() => void>(() => {})

  async function save(change?: Change) {
    try {
      const next = await update(change)
      setData(next)
      setError('')
      return next
    } catch (cause) {
      console.error(cause)
      setError('端末への保存に失敗しました。空き容量とブラウザの設定を確認して、もう一度お試しください。')
    }
  }
  refreshRef.current = () => { setToday(localDate()); void save() }
  useEffect(() => {
    let midnight: number
    const refresh = () => {
      if (!document.hidden) refreshRef.current()
      window.clearTimeout(midnight)
      const next = new Date()
      next.setHours(24, 0, 0, 0)
      midnight = window.setTimeout(refresh, Math.max(1, next.getTime() - Date.now()))
    }
    refresh()
    const timer = window.setInterval(refresh, 30_000)
    window.addEventListener('pageshow', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      clearInterval(timer)
      clearTimeout(midnight)
      clearTimeout(undoTimer.current)
      window.removeEventListener('pageshow', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  if (!data) return <main className="loading">{error ? <><p role="alert">{error}</p>
    <button className="soft" onClick={() => save()}>再試行</button></> : '読み込み中…'}</main>

  const view = detail?.snapshot ?? data
  const active = view.tasks.filter(task => !task.deletedAt && !task.completed)
  const completed = view.tasks.filter(task => !task.deletedAt && task.completed)
    .sort((a, b) => newest(a.completedAt, b.completedAt))
  const trash = view.tasks.filter(task => task.deletedAt).sort((a, b) => newest(a.deletedAt, b.deletedAt))
  const visible = active.filter(task => belongs(task, tab, today))
  for (const row of Object.values(leaving)) {
    if (row.tab === tab && belongs(row.task, tab, today) && !visible.some(task => task.id === row.task.id)) visible.push(row.task)
  }
  const todaysCompleted = completed.filter(task => !leaving[task.id] && localDate(new Date(task.completedAt!)) === today)
  const calendarDate = (task: Task) => task.date && task.date < today ? today : task.date
  const calendarTasks = active.filter(task => calendarDate(task) === selected).sort((a, b) => a.order - b.order)
  const dots = new Set(active.map(calendarDate).filter((date): date is string => date !== null))
  const remind = !backupDismissed && Date.now() - Date.parse(data.settings.lastBackup ?? data.settings.createdAt) >= retention

  function patch(id: string, apply: (task: Task) => Task) {
    return save(current => ({ ...current, tasks: current.tasks.map(task => task.id !== id ? task
      : { ...apply(task), updatedAt: iso() }) }))
  }
  function animate(id: string, name: 'entering' | 'leaving') {
    setAnimations(current => ({ ...current, [id]: name }))
    window.setTimeout(() => setAnimations(current => {
      if (current[id] !== name) return current
      const next = { ...current }
      delete next[id]
      return next
    }), 220)
  }
  async function leave(task: Task, remove: boolean) {
    if (leaving[task.id]) return
    setLeaving(current => ({ ...current, [task.id]: { task, tab } }))
    animate(task.id, 'leaving')
    window.setTimeout(() => setLeaving(current => {
      const next = { ...current }
      delete next[task.id]
      return next
    }), 205)
    const time = iso()
    const saved = await patch(task.id, row => remove ? { ...row, deletedAt: time }
      : { ...row, completed: true, completedAt: time })
    if (saved && remove && !task.completed) {
      setUndo(task)
      clearTimeout(undoTimer.current)
      undoTimer.current = window.setTimeout(() => setUndo(undefined), 2000)
    }
  }
  async function restore(task: Task, fromTrash = false) {
    const saved = await patch(task.id, row => restoreTask(row, fromTrash))
    if (saved) {
      if (saved.tasks.some(row => row.id === task.id && belongs(row, tab, today))) animate(task.id, 'entering')
      if (undo?.id === task.id) setUndo(undefined)
    }
  }
  function toggle(id: string) {
    return save(current => ({ ...current, groups: current.groups.map(group => group.id === id
      ? { ...group, collapsed: !group.collapsed } : group) }))
  }
  function openTask(task: Task) { setDetail({ task, snapshot: data! }) }
  async function editGroup(id: string | null, patch: Partial<Data['groups'][number]>) {
    let problem: string | undefined
    const saved = await save(current => {
      const name = patch.name?.trim()
      if (patch.name !== undefined && (!name || [...name].length > 10)) problem = 'グループ名は1〜10文字で入力してください。'
      else if (name && (name === '未分類' || current.groups.some(group => group.id !== id && group.name === name))) {
        problem = '同じ名前のグループがあります。'
      } else if (patch.color && current.groups.some(group => group.id !== id && group.color === patch.color)) {
        problem = 'この色はすでに使用されています。'
      }
      if (problem) return current
      if (id !== null) return { ...current, groups: current.groups.map(group => group.id === id
        ? { ...group, ...patch, name: name ?? group.name } : group) }
      const color = colors.find(color => !current.groups.some(group => group.color === color))
      if (!color || !name) { problem = 'グループは12個まで追加できます。'; return current }
      return { ...current, groups: [...current.groups, { id: crypto.randomUUID(), name, color, collapsed: false }] }
    })
    return problem ?? (saved ? undefined : 'グループを保存できませんでした。')
  }
  async function exportData() {
    const saved = await save(current => ({ ...current, settings: { ...current.settings, lastBackup: iso() } }))
    if (!saved) return
    const url = URL.createObjectURL(new Blob([JSON.stringify(saved, null, 2)], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'mytodo-' + today + '.json'
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
  async function importData(file: File) {
    try {
      const imported = readBackup(await file.text())
      if (!confirm('現在のタスク・グループ・設定をすべてバックアップの内容で置き換えますか？')) return
      if (await save(() => imported)) {
        setUndo(undefined)
        setBackupDismissed(false)
        setCompletedOpen(false)
        setLeaving({})
        setAnimations({})
        setMessage('バックアップを復元しました')
      }
    } catch {
      setMessage('バックアップを読み込めません。MyTodoから書き出したJSONファイルを選んでください。')
    }
  }

  const actions: Actions = {
    open: openTask, complete: task => leave(task, false), remove: task => leave(task, true),
    importance: task => patch(task.id, row => ({ ...row, important: !row.important })),
  }

  return <div className="app">
    <header className="app-header">
      <div className="brand"><span className="brand-mark"><Check size={17} strokeWidth={3} /></span><span>MyTodo</span></div>
      <button className="icon-button settings-button" aria-label="設定" onClick={() => setSettings(true)}><Settings2 size={20} /></button>
    </header>
    <main className={screen === 'todo' && tab === '明日以降' ? 'main main-future' : 'main'}>
      <div className="page-title"><h1>{screen === 'todo' ? 'ToDo' : 'カレンダー'}</h1><span>{formatDate(today)}</span></div>
      {remind && <div className="backup-reminder"><button onClick={() => setSettings(true)}>JSONバックアップを保存する</button>
        <button className="icon-button" aria-label="案内を閉じる" onClick={() => setBackupDismissed(true)}>×</button></div>}
      {screen === 'todo' ? <Todo data={view} tab={tab} today={today} visible={visible}
        completed={todaysCompleted} completedOpen={completedOpen} onCompletedToggle={setCompletedOpen} onTab={setTab}
        toggle={toggle} restore={restore} animations={animations}
        onAddDate={(date, anchor) => { addScroll.capture(anchor); setAdding({ date }) }}
        onSort={sort => save(current => {
          const key = sortKey(tab)
          if (current.settings.sort[key] === sort) return current
          return {
            ...current,
            settings: { ...current.settings, sort: { ...current.settings.sort, [key]: sort } },
            tasks: tab === '今日' ? current.tasks.map(task => task.todayTop
              ? { ...task, todayTop: undefined } : task) : current.tasks,
          }
        })}
        move={async (task, group, before, date) => {
          const saved = await save(current => date
            ? (date > localDate() ? moveWithinDate(current, task.id, date, before) : current)
            : moveTask(current, task.id, group, before))
          if (saved) animate(task.id, 'entering')
        }}
        actions={actions} /> : <>
        <div className="calendar-panel"><Calendar today={today} selected={selected} initial={selected}
          onSelect={setSelected} dots={dots} /></div>
        <section className="calendar-tasks"><h2>{formatDate(selected)}</h2>
          {calendarTasks.length ? calendarTasks.map(task => <button key={task.id} className="calendar-task"
            onClick={() => openTask(task)}>{task.title}</button>) : <p className="muted">この日の予定はありません</p>}
        </section>
      </>}
    </main>
    {screen === 'todo' && tab === '今日' && <button className="fab" aria-label="タスクを追加"
      onClick={() => { addScroll.capture(); setAdding({}) }}><Plus size={27} /></button>}
    <nav className="bottom-nav" aria-label="メインナビゲーション">
      <button aria-current={screen === 'todo' ? 'page' : undefined} onClick={() => setScreen('todo')}><ClipboardList size={21} />ToDo</button>
      <button aria-current={screen === 'calendar' ? 'page' : undefined} onClick={() => setScreen('calendar')}><CalendarDays size={21} />カレンダー</button>
    </nav>
    {settings && <Settings data={view} onClose={() => setSettings(false)} completed={completed} trash={trash}
      undated={active.filter(task => task.date === null)} taskActions={actions}
      onGroup={editGroup} openTask={openTask} restore={restore}
      onGroups={ids => save(current => {
        const rank = new Map(ids.map((id, index) => [id, index]))
        return { ...current, groups: [...current.groups].sort((a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99)) }
      })}
      deleteGroup={id => save(current => {
        let order = Math.max(-1, ...current.tasks.filter(task => task.groupId === null).map(task => task.order)) + 1
        const displaced = current.tasks.filter(task => task.groupId === id).sort((a, b) => a.order - b.order)
        const positions = new Map(displaced.map(task => [task.id, order++]))
        return {
          ...current, groups: current.groups.filter(group => group.id !== id),
          tasks: current.tasks.map(task => task.groupId === id ? { ...task, groupId: null,
            order: positions.get(task.id)!, updatedAt: iso() } : task),
        }
      })}
      purge={task => save(current => ({ ...current, tasks: current.tasks.filter(row => row.id !== task.id || !row.deletedAt) }))}
      onExport={exportData} onImport={importData} />}
    {adding && <AddTask tab={tab} today={today} initialDate={adding.date} groups={data.groups} onClose={() => setAdding(undefined)}
      onAdd={async task => {
        const saved = await save(current => addTask(current, task, tab === '今日' && task.date === localDate()))
        if (saved && belongs(task, tab, today)) {
          if (adding.date === task.date) addScroll.reveal(task.id)
          animate(task.id, 'entering')
        }
        return Boolean(saved)
      }} />}
    {detail && <TaskDetail key={detail.task.id} task={detail.task} today={today}
      groupName={view.groups.find(group => group.id === detail.task.groupId)?.name}
      onClose={() => setDetail(undefined)}
      onSave={changes => patch(detail.task.id, row => {
        if (row.completed || row.deletedAt) return row
        return { ...(changes.date ? changeDate(row, changes.date) : row), ...changes }
      })} />}
    {(error || message || undo) && <div className="toast" role={error ? 'alert' : 'status'}>
      <span>{error || message || '削除しました'}</span>
      {error || message ? <button onClick={() => { setError(''); setMessage('') }}>閉じる</button>
        : undo && <button onClick={() => restore(undo, true)}>元に戻す</button>}
    </div>}
  </div>
}
