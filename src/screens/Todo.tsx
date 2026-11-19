import { useEffect, useState, type ReactNode } from 'react'
import { DndContext, DragOverlay, pointerWithin, rectIntersection, useDraggable, useDroppable,
  type CollisionDetection, type DragEndEvent } from '@dnd-kit/core'
import { ArrowDownUp, Check, ChevronDown, ListChecks, Star, Trash2 } from 'lucide-react'
import { formatDate, futureDates, sortKey, sorts, tabs, type Data, type Tab, type Task } from '../data/model'
import { useLongPressSensors } from '../components/SortableRows'

type Destination = { groupId: string | null; date?: string; index: number; tasks: Task[]; collapsed: boolean }
const collision: CollisionDetection = args => {
  const valid = args.droppableContainers.filter(container => container.data.current?.date === args.active.data.current?.date)
  const options = { ...args, droppableContainers: valid }
  return args.pointerCoordinates ? pointerWithin(options) : rectIntersection(options)
}

export function HistoryRows({ tasks, onOpen, onRestore }:
  { tasks: Task[]; onOpen: (task: Task) => void; onRestore: (task: Task) => void }) {
  return <div className="history-list">{tasks.map(task => <div className="history-row" key={task.id}>
    <button className="text-button" onClick={() => onOpen(task)}>{task.title}</button>
    <button className="soft" onClick={() => onRestore(task)}>戻す</button>
  </div>)}</div>
}

export type Actions = {
  open: (task: Task) => void; complete: (task: Task) => void; remove: (task: Task) => void
  importance: (task: Task) => void
}

export function Card({ task, actions, animation }: { task: Task; actions?: Actions; animation?: string }) {
  const progress = task.checklist.filter(item => item.checked).length
  return <article className={['task-card', task.important ? 'important' : '', animation ?? ''].join(' ')}>
    <button className="icon-button complete" aria-label="完了にする" tabIndex={actions ? 0 : -1}
      onClick={() => actions?.complete(task)}><span><Check size={13} /></span></button>
    <div className="task-copy">
      <button className="text-button task-name" tabIndex={actions ? 0 : -1}
        onClick={() => actions?.open(task)}>{task.title}</button>
      {task.checklist.length > 0 && <div className="task-meta"><span><ListChecks size={15} />{progress}/{task.checklist.length}</span></div>}
    </div>
    <button className="icon-button star" aria-label="重要" aria-pressed={task.important} tabIndex={actions ? 0 : -1}
      onClick={() => actions?.importance(task)}><Star size={19} fill={task.important ? 'currentColor' : 'none'} /></button>
    <button className="icon-button delete" aria-label="削除" tabIndex={actions ? 0 : -1}
      onClick={() => actions?.remove(task)}><Trash2 size={18} /></button>
  </article>
}

function DragCard({ task, date, actions, animation, destination, hovered, height }:
  { task: Task; date?: string; actions: Actions; animation?: string; destination: Destination; hovered: string; height: number }) {
  const drag = useDraggable({ id: 'task:' + task.id, data: { task, date } })
  const dropId = 'card:' + task.id
  const drop = useDroppable({ id: dropId, data: destination })
  return <div ref={drop.setNodeRef}>
    {hovered === dropId && !drag.isDragging && <div className="drop-space" style={{ height }} />}
    <div ref={drag.setNodeRef} data-drag-row className="drag-card"
      style={drag.isDragging ? { opacity: 0, pointerEvents: 'none' } : undefined}
      {...drag.attributes} {...drag.listeners}
      onKeyDown={event => { if (event.target === event.currentTarget) drag.listeners?.onKeyDown?.(event) }}
      onContextMenu={event => event.preventDefault()}
      onClick={event => { if (!(event.target as Element).closest('button')) actions.open(task) }}>
      <Card task={task} actions={actions} animation={animation} />
    </div>
  </div>
}

function DropZone({ id, destination, children, className }:
  { id: string; destination: Destination; children?: ReactNode; className?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id, data: destination })
  return <div ref={setNodeRef} className={(className ?? '') + (isOver ? ' drop-hover' : '')}>{children}</div>
}

export function Todo({ data, tab, today, visible, completed, onTab, onSort, onAddDate, toggle, move, actions,
  restore, animations, completedOpen, onCompletedToggle }:
  { data: Data; tab: Tab; today: string; visible: Task[]; completed: Task[];
    onTab: (tab: Tab) => void; onSort: (sort: typeof sorts[number]) => void; toggle: (group: string | null) => void
    onAddDate: (date: string) => void; move: (task: Task, group: string | null, before?: string) => void; actions: Actions
    restore: (task: Task) => void; animations: Record<string, string>; completedOpen: boolean
    onCompletedToggle: (open: boolean) => void }) {
  const [dragging, setDragging] = useState<Task | null>(null)
  const [height, setHeight] = useState(72)
  const [hovered, setHovered] = useState('')
  const [destination, setDestination] = useState<Destination | null>(null)
  const [expanded, setExpanded] = useState<string | null | undefined>()
  const sensors = useLongPressSensors()
  const sort = data.settings.sort[sortKey(tab)]
  const groups = [...data.groups, { id: null, name: '未分類', color: '#777f91', collapsed: data.settings.ungroupedCollapsed }]
  const future = tab === '明日以降'

  useEffect(() => {
    if (!dragging || !destination?.collapsed) return
    const timer = window.setTimeout(() => setExpanded(destination.groupId), 380)
    return () => window.clearTimeout(timer)
  }, [dragging, destination])

  function reset() { setDragging(null); setHovered(''); setDestination(null); setExpanded(undefined) }
  function finish({ active, over }: DragEndEvent) {
    reset()
    if (!over) return
    const task = active.data.current?.task as Task
    const target = over.data.current as Destination
    if (!task || !target) return
    const remaining = target.tasks.filter(row => row.id !== task.id)
    const former = target.tasks.findIndex(row => row.id === task.id)
    const index = target.index - (former >= 0 && former < target.index ? 1 : 0)
    if (future) {
      if (sort === '手動順' && former !== index) move(task, task.groupId, remaining[index]?.id)
      return
    }
    if (task.groupId === target.groupId && (sort !== '手動順' || former === index)) return
    if (target.collapsed || (expanded === target.groupId && groups.find(group => group.id === target.groupId)?.collapsed)) {
      toggle(target.groupId)
    }
    move(task, target.groupId, sort === '手動順' ? remaining[index]?.id : undefined)
  }

  function sortTasks(tasks: Task[]) {
    return tasks.sort((a, b) => sort === '重要なタスクを先頭に表示'
      ? Number(b.important) - Number(a.important) || a.order - b.order : a.order - b.order)
  }

  function taskList(key: string, target: Destination) {
    const { tasks, date } = target
    return <div className="task-list">
      {tasks.map((task, index) => <DragCard key={task.id} task={task} actions={actions} date={date}
        destination={{ ...target, index }} animation={animations[task.id]} hovered={hovered} height={height} />)}
      {dragging && (!date || dragging.date === date) &&
        <DropZone id={'end:' + key} destination={target} className="drop-end">
          {(hovered === 'end:' + key || hovered === 'heading:' + key) &&
            <div className="drop-space" style={{ height }} />}
        </DropZone>}
    </div>
  }

  return <>
    <div className="toolbar">
      <div className="tabs" aria-label="ToDoの表示">
        {tabs.map(item => <button key={item} aria-pressed={tab === item} onClick={() => onTab(item)}>{item}</button>)}
      </div>
      <label className="sort-control" title={sort}><ArrowDownUp size={18} />
        <select aria-label="並び替え" value={sort} onChange={event => onSort(event.target.value as typeof sorts[number])}>
          {sorts.map(value => <option key={value}>{value}</option>)}
        </select>
      </label>
    </div>
    {!future && !visible.length && <div className="empty">
      <span className="empty-icon"><Check size={27} /></span>
      <p>今日のタスクはありません</p>
    </div>}
    <DndContext sensors={sensors} collisionDetection={collision} onDragEnd={finish} onDragCancel={reset}
      autoScroll={{ threshold: { x: 0, y: 0.16 }, acceleration: 14 }}
      onDragStart={({ active }) => {
        setDragging(active.data.current?.task)
        setHeight(active.rect.current.initial?.height ?? 72)
      }}
      onDragOver={({ over }) => {
        setHovered(String(over?.id ?? ''))
        setDestination(over?.data.current as Destination ?? null)
      }}>
      {future ? futureDates(today).map(date => {
        const tasks = sortTasks(visible.filter(task => task.date === date))
        return <section className="date-section" key={date} data-date={date}>
          <h2 className="date-heading"><button onClick={() => onAddDate(date)}>{formatDate(date)}</button></h2>
          {tasks.length > 0 && taskList(date, { date, groupId: null, tasks, index: tasks.length, collapsed: false })}
        </section>
      }) : groups.map(group => {
        const tasks = sortTasks(visible.filter(task => task.groupId === group.id))
        if (!tasks.length && !dragging) return null
        const collapsed = group.collapsed && group.id !== expanded
        const key = JSON.stringify(group.id)
        const target = { groupId: group.id, index: tasks.length, tasks, collapsed }
        return <div className="task-group" key={key}>
          <DropZone id={'heading:' + key} destination={target} className="group-heading">
            <button aria-expanded={!collapsed} onClick={() => toggle(group.id)}>
              <i style={{ background: group.color }} /><span>{group.name}</span><small>{tasks.length}</small>
              <ChevronDown size={16} />
            </button>
          </DropZone>
          {!collapsed && taskList(key, target)}
        </div>
      })}
      <DragOverlay dropAnimation={{ duration: 200, easing: 'ease-out' }}>
        {dragging && <div className="floating-card" aria-hidden="true"><Card task={dragging} /></div>}
      </DragOverlay>
    </DndContext>
    {tab === '今日' && completed.length > 0 && <details className="today-completed" open={completedOpen}
      onToggle={event => onCompletedToggle(event.currentTarget.open)}>
      <summary>今日の完了済み（{completed.length}件）</summary>
      <HistoryRows tasks={completed} onOpen={actions.open} onRestore={restore} />
    </details>}
  </>
}
