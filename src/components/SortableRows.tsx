import { useRef, type ReactNode } from 'react'
import { closestCenter, DndContext, KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export function useLongPressSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { delay: 400, tolerance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 400, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
}
export function SortableRows<T extends { id: string }>({ items, onMove, render }:
  { items: T[]; onMove: (items: T[]) => void; render: (item: T) => ReactNode }) {
  const sensors = useLongPressSensors()
  return <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => {
    if (over && active.id !== over.id) {
      onMove(arrayMove(items, items.findIndex(item => item.id === active.id), items.findIndex(item => item.id === over.id)))
    }
  }}>
    <SortableContext items={items} strategy={verticalListSortingStrategy}>
      {items.map(item => <SortableRow key={item.id} id={item.id}>{render(item)}</SortableRow>)}
    </SortableContext>
  </DndContext>
}

function SortableRow({ id, children }: { id: string; children: ReactNode }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({ id })
  const suppressClick = useRef(false)
  if (isDragging) suppressClick.current = true
  return <div ref={setNodeRef} data-drag-row className={'sortable-row' + (isDragging ? ' dragging' : '')}
    style={{ transform: CSS.Transform.toString(transform), transition }}
    {...attributes} {...listeners}
    onClickCapture={event => { if (suppressClick.current) { suppressClick.current = false; event.stopPropagation() } }}
    onMouseDown={event => { suppressClick.current = false; listeners?.onMouseDown?.(event) }}
    onTouchStart={event => { suppressClick.current = false; listeners?.onTouchStart?.(event) }}
    onKeyDown={event => { if (event.target === event.currentTarget) listeners?.onKeyDown?.(event) }}
    onContextMenu={event => { if (!(event.target instanceof HTMLInputElement)) event.preventDefault() }}>
    {children}
  </div>
}
