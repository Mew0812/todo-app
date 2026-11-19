import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatDate, localDate, offsetDate, parseDate } from '../data/model'

export function Calendar({ today, selected, onSelect, minimum, dots, initial = today }:
  { today: string; selected: string | null; onSelect: (date: string) => void
    minimum?: string; dots?: Set<string>; initial?: string }) {
  const [month, setMonth] = useState(initial.slice(0, 7) + '-01')
  const start = useRef<{ x: number; y: number } | null>(null)
  const current = parseDate(month)
  const leading = (current.getDay() + 6) % 7
  const count = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate()
  function step(delta: number) {
    setMonth(value => {
      const next = parseDate(value)
      next.setMonth(next.getMonth() + delta)
      return localDate(next)
    })
  }
  return <div className="calendar" onTouchStart={event => {
    const touch = event.touches[0]
    start.current = { x: touch.clientX, y: touch.clientY }
  }} onTouchEnd={event => {
    if (!start.current) return
    const touch = event.changedTouches[0]
    const x = touch.clientX - start.current.x
    const y = touch.clientY - start.current.y
    if (Math.abs(x) > 42 && Math.abs(x) > Math.abs(y)) step(x < 0 ? 1 : -1)
    start.current = null
  }}>
    <div className="month-header">
      <button type="button" className="icon-button" aria-label="前の月" onClick={() => step(-1)}><ChevronLeft /></button>
      <strong>{current.getFullYear()}年 {current.getMonth() + 1}月</strong>
      <button type="button" className="icon-button" aria-label="次の月" onClick={() => step(1)}><ChevronRight /></button>
    </div>
    <div className="calendar-grid">
      {Array.from('月火水木金土日').map(day => <span key={day} className="weekday">{day}</span>)}
      {Array.from({ length: leading }, (_, i) => <span key={'blank-' + i} />)}
      {Array.from({ length: count }, (_, i) => {
        const date = offsetDate(month, i)
        return <button type="button" key={date} className={date === today ? 'is-today' : ''}
          aria-label={formatDate(date)} aria-pressed={selected === date}
          disabled={Boolean(minimum && date < minimum)} onClick={() => onSelect(date)}>
          {i + 1}{dots?.has(date) && <i aria-label="予定あり" />}
        </button>
      })}
    </div>
  </div>
}

export function DatePicker({ today, value, onChange, onClose }:
  { today: string; value: string | null; onChange: (date: string) => void; onClose: () => void }) {
  function select(date: string) {
    if (date !== value) onChange(date)
    onClose()
  }
  return <div className="popover-backdrop" onClick={onClose}>
    <div className="date-popover" role="dialog" aria-label="予定日を選択" onClick={event => event.stopPropagation()}>
      <Calendar today={today} selected={value} minimum={today} onSelect={select} />
      <div className="date-shortcuts">
        <button type="button" onClick={() => select(today)}>今日</button>
        <button type="button" onClick={() => select(offsetDate(today, 1))}>明日</button>
      </div>
    </div>
  </div>
}
