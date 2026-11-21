import { useLayoutEffect, useRef, type TouchEvent } from 'react'
import type { Tab } from '../data/model'

export function useScreenSwipe(tab: Tab, blocked: boolean, switchTab: (tab: Tab) => void) {
  const start = useRef<{ id: number; x: number; y: number; horizontal?: boolean } | null>(null)
  const scroll = useRef<Record<Tab, number>>({ 今日: 0, 明日以降: 0 })
  const dragging = useRef(false)

  useLayoutEffect(() => {
    window.scrollTo(0, scroll.current[tab])
  }, [tab])

  return {
    onDragState(active: boolean) {
      dragging.current = active
      if (active) start.current = null
    },
    handlers: {
      onTouchStart(event: TouchEvent<HTMLElement>) {
        start.current = null
        if (blocked || dragging.current || event.touches.length !== 1) return
        const touch = event.touches[0]
        // Leave Safari’s system back/forward gesture at the screen edges alone.
        if (touch.clientX < 24 || touch.clientX > window.innerWidth - 24) return
        start.current = { id: touch.identifier, x: touch.clientX, y: touch.clientY }
      },
      onTouchMove(event: TouchEvent<HTMLElement>) {
        const origin = start.current
        if (event.touches.length !== 1) { start.current = null; return }
        if (!origin || origin.horizontal !== undefined) return
        const touch = event.touches[0]
        const x = Math.abs(touch.clientX - origin.x)
        const y = Math.abs(touch.clientY - origin.y)
        if (Math.max(x, y) >= 14) origin.horizontal = x > y * 1.35
      },
      onTouchCancel() { start.current = null },
      onTouchEnd(event: TouchEvent<HTMLElement>) {
        const origin = start.current
        start.current = null
        if (blocked || dragging.current || !origin?.horizontal) return
        const touch = Array.from(event.changedTouches).find(item => item.identifier === origin.id)
        if (!touch) return
        event.preventDefault()
        const x = touch.clientX - origin.x
        const y = touch.clientY - origin.y
        if (Math.abs(x) < 60 || Math.abs(x) <= Math.abs(y) * 1.5) return
        if ((tab === '今日' && x < 0) || (tab === '明日以降' && x > 0)) {
          scroll.current[tab] = window.scrollY
          switchTab(tab === '今日' ? '明日以降' : '今日')
        }
      },
    },
  }
}
