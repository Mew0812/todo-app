import { useEffect, useState, type ReactNode } from 'react'
import { DndContext, DragOverlay, pointerWithin, rectIntersection, useDraggable, useDroppable,
  type CollisionDetection, type DragEndEvent } from '@dnd-kit/core'
import { Check, ChevronDown, ListChecks, Star, Trash2 } from 'lucide-react'
import { formatDate, futureDates, todayPriority, type Data, type Tab, type Task } from '../data/model'
import { useLongPressSensors } from '../components/SortableRows'

type Destination = {
  groupId: string | null; date?: string; index: number;
  tasks: Task[]; collapsed: boolean
}
const collision: CollisionDetection = args => {
  const valid = args.droppableContainers.filter(container => Boolean(container.data.current?.date)
    === Boolean(args.active.data.current?.date))
  const options = { ...args, droppableContainers: valid }
  return args.pointerCoordinates ? pointerWithin(options) : rectIntersection(options)
}

export function HistoryRows({ tasks, onOpen, onRestore, onRemove }:
  { tasks: Task[]; onOpen: (task: Task) => void; onRestore: (task: Task) => void; onRemove?: (task: Task) => void }) {
  return <div className="history-list">{tasks.map(task => <div className="history-row" key={task.id}>
    <button className="text-button" onClick={() => onOpen(task)}>{task.title}</button>
    <button className="soft" onClick={() => onRestore(task)}>戻す</button>
    {onRemove && <button className="danger" onClick={() => onRemove(task)}>削除</button>}
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

function DragCard({ task, actions, animation, destination, showTargets }:
  { task: Task; actions: Actions; animation?: string; destination: Destination; showTargets: boolean }) {
  const { date, index } = destination
  const drag = useDraggable({ id: 'task:' + task.id, data: { task, date } })
  return <div className="drag-slot" id={'task-card-' + task.id}>
    <div ref={drag.setNodeRef} data-drag-row className="drag-card"
      style={drag.isDragging ? { opacity: .35, pointerEvents: 'none' } : undefined}
      {...drag.attributes} {...drag.listeners}
      onKeyDown={event => { if (event.target === event.currentTarget) drag.listeners?.onKeyDown?.(event) }}
      onContextMenu={event => event.preventDefault()}
      onClick={event => { if (!(event.target as Element).closest('button')) actions.open(task) }}>
      <Card task={task} actions={actions} animation={animation} />
    </div>
    {showTargets && <>
      <DropZone id={'before:' + task.id} destination={destination} className="card-target target-before" />
      <DropZone id={'after:' + task.id} destination={{ ...destination, index: index + 1 }} className="card-target target-after" />
    </>}
  </div>
}

function DropZone({ id, destination, children, className }:
  { id: string; destination: Destination; children?: ReactNode; className?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id, data: destination })
  return <div ref={setNodeRef} className={(className ?? '') + (isOver ? ' drop-active' : '')}>
    {children}{isOver && <span className="drop-line" aria-hidden="true" />}
  </div>
}

export function Todo({ data, tab, today, visible, completed, onAddDate, toggle, move, actions, onDragState,
  restore, animations, completedOpen, onCompletedToggle }:
  { data: Data; tab: Tab; today: string; visible: Task[]; completed: Task[];
    toggle: (group: string) => void
    onAddDate: (date: string, anchor: HTMLElement) => void; move: (task: Task, group: string | null, before?: string, date?: string) => void; actions: Actions
    restore: (task: Task) => void; animations: Record<string, string>; completedOpen: boolean
    onCompletedToggle: (open: boolean) => void; onDragState: (active: boolean) => void }) {
  const [dragging, setDragging] = useState<Task | null>(null)
  const [destination, setDestination] = useState<Destination | null>(null)
  const [expanded, setExpanded] = useState<string | null | undefined>()
  const sensors = useLongPressSensors()
  const groups = data.groups
  const future = tab === '明日以降'

  useEffect(() => {
    if (!dragging || !destination?.collapsed) return
    const timer = window.setTimeout(() => setExpanded(destination.groupId), 380)
    return () => window.clearTimeout(timer)
  }, [dragging, destination])

  function reset() { onDragState(false); setDragging(null); setDestination(null); setExpanded(undefined) }
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
      if (target.date !== task.date || former !== index) move(task, task.groupId, remaining[index]?.id, target.date)
      return
    }
    if (task.groupId === target.groupId && former === index) return
    if (target.groupId !== null && (target.collapsed || (expanded === target.groupId
      && groups.find(group => group.id === target.groupId)?.collapsed))) {
      toggle(target.groupId)
    }
    move(task, target.groupId, remaining[index]?.id)
  }

  function sortTasks(tasks: Task[]) {
    return tasks.sort((a, b) => a.order - b.order)
  }

  function taskList(target: Destination) {
    const { tasks } = target
    return <div className="task-list">
      {tasks.map((task, index) => <DragCard key={task.id} task={task} actions={actions}
        destination={{ ...target, index }} animation={animations[task.id]} showTargets={Boolean(dragging)} />)}
    </div>
  }

  function todayList() {
    const sections = [null, ...groups].map(group => {
      const tasks = sortTasks(visible.filter(task => task.groupId === (group?.id ?? null)))
      const priority = tasks.reduce((highest, task) => Math.max(highest, todayPriority(task, today)), 0)
      return { group, tasks, priority }
    }).sort((a, b) => b.priority - a.priority)
    return <div>
      {sections.map(({ group, tasks }) => {
        if (!tasks.length && !dragging) return null
        if (!group) {
          const target = { groupId: null, index: 0, tasks, collapsed: false }
          return tasks.length > 0 ? <div key="ungrouped" className="ungrouped-tasks">{taskList(target)}</div>
            : <DropZone key="ungrouped" id="ungrouped" destination={target} className="ungrouped-target" />
        }
        const collapsed = group.collapsed && group.id !== expanded
        const key = group.id
        const target = { groupId: group.id, index: 0, tasks, collapsed }
        return <div className="task-group" key={'group:' + key}>
          <DropZone id={'heading:' + key} destination={target} className="group-heading">
            <button aria-expanded={!collapsed} onClick={() => toggle(group.id)}>
              <i style={{ background: group.color }} /><span>{group.name}</span><small>{tasks.length}</small>
              <ChevronDown size={16} />
            </button>
          </DropZone>
          {!collapsed && taskList(target)}
        </div>
      })}
    </div>
  }

  return <>
    {!future && !visible.length && <div className="empty">
      <span className="empty-icon"><Check size={27} /></span>
      <p>今日のタスクはありません</p>
    </div>}
    <DndContext sensors={sensors} collisionDetection={collision} onDragEnd={finish} onDragCancel={reset}
      autoScroll={{ threshold: { x: 0, y: 0.16 }, acceleration: 14 }}
      onDragStart={({ active }) => {
        onDragState(true)
        setDragging(active.data.current?.task)
      }}
      onDragOver={({ over }) => {
        setDestination(over?.data.current as Destination ?? null)
      }}>
      {future ? futureDates(today).map(date => {
        const tasks = sortTasks(visible.filter(task => task.date === date))
        const target = { date, groupId: null, tasks, index: 0, collapsed: false }
        return <section className="date-section" key={date} data-date={date}>
          <DropZone id={'date:' + date} destination={target} className="date-target">
            <h2 className="date-heading"><button onClick={event => {
              if (!dragging) onAddDate(date, event.currentTarget)
            }}>{formatDate(date)}</button></h2>
          </DropZone>
          {tasks.length > 0 && taskList(target)}
        </section>
      }) : todayList()}
      <DragOverlay dropAnimation={{ duration: 200, easing: 'ease-out' }}>
        {dragging && <div className="floating-card" aria-hidden="true"><Card task={dragging} /></div>}
      </DragOverlay>
    </DndContext>
    {tab === '今日' && completed.length > 0 && <details className="today-completed" open={completedOpen}
      onToggle={event => onCompletedToggle(event.currentTarget.open)}>
      <summary>今日の完了済み（{completed.length}件）</summary>
      <HistoryRows tasks={completed} onOpen={actions.open} onRestore={restore} onRemove={actions.remove} />
    </details>}
  </>
}
