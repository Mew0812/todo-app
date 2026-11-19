import { useEffect, useRef, type ReactNode } from 'react'

export function Sheet({ title, onClose, children, compact = false }:
  { title: string; onClose: () => void; children: ReactNode; compact?: boolean }) {
  const panel = useRef<HTMLElement>(null)
  const gesture = useRef<{ x: number; y: number } | null>(null)
  useEffect(() => {
    const viewport = window.visualViewport
    const element = panel.current!
    const height = window.innerHeight
    element.style.setProperty('--sheet-height', height + 'px')
    function adjust() {
      const inset = viewport ? Math.max(0, height - viewport.height - viewport.offsetTop) : 0
      element.style.setProperty('--keyboard', inset + 'px')
      if (inset && element.contains(document.activeElement)) {
        document.activeElement?.scrollIntoView({ block: 'nearest' })
      }
    }
    viewport?.addEventListener('resize', adjust)
    viewport?.addEventListener('scroll', adjust)
    return () => {
      viewport?.removeEventListener('resize', adjust)
      viewport?.removeEventListener('scroll', adjust)
    }
  }, [])
  return <div className="sheet-backdrop" onClick={event => {
    if (event.target !== event.currentTarget) return
    if (compact) onClose()
    else if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  }}>
    <section ref={panel} role="dialog" aria-modal="true" aria-label={title}
      className={'sheet' + (compact ? ' sheet-compact' : '')}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.stopPropagation(); onClose() }
        if (event.key === 'Enter' && !compact && event.target instanceof HTMLInputElement
          && event.target.type === 'text' && !event.nativeEvent.isComposing) {
          event.preventDefault()
          event.target.blur()
        }
      }}
      onPointerDown={event => {
        if (!(event.target instanceof Element) || !event.target.closest('input, textarea, select, button, label')) {
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
        }
      }}
      onTouchStart={event => {
        const body = panel.current?.querySelector('.sheet-body')
        const target = event.target as Element
        gesture.current = null
        if (target.closest('.sheet-grip') || ((!body || body.scrollTop <= 0)
          && !target.closest('input,textarea,button,select,[data-drag-row]'))) {
          const touch = event.touches[0]
          gesture.current = { x: touch.clientX, y: touch.clientY }
        }
      }}
      onTouchEnd={event => {
        const start = gesture.current
        gesture.current = null
        if (!start) return
        const touch = event.changedTouches[0]
        if (touch.clientY - start.y > 72 && Math.abs(touch.clientX - start.x) < 50) onClose()
      }}>
      <button type="button" className="sheet-grip" aria-label="シートを閉じる" onClick={onClose}><span /></button>
      <h2>{title}</h2>
      <div className="sheet-body">{children}</div>
    </section>
  </div>
}
