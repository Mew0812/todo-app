import { useLayoutEffect, useRef, type ReactNode } from 'react'

export function Sheet({ title, onClose, children, compact = false }:
  { title: string; onClose: () => void; children: ReactNode; compact?: boolean }) {
  const panel = useRef<HTMLElement>(null)
  const gesture = useRef<{ x: number; y: number } | null>(null)
  useLayoutEffect(() => {
    const viewport = window.visualViewport
    const element = panel.current!
    const body = element.querySelector<HTMLElement>('.sheet-body')!
    const height = window.innerHeight
    element.style.setProperty('--sheet-height', height + 'px')
    function adjust() {
      const inset = viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0
      element.style.setProperty('--keyboard', inset + 'px')
      element.style.setProperty('--visible-height', (viewport?.height ?? window.innerHeight) + 'px')
      const focused = document.activeElement
      if (inset && focused && body.contains(focused)) {
        const field = focused.getBoundingClientRect()
        const bounds = body.getBoundingClientRect()
        if (field.bottom > bounds.bottom) body.scrollTop += field.bottom - bounds.bottom
        else if (field.top < bounds.top) body.scrollTop -= bounds.top - field.top
      }
    }
    viewport?.addEventListener('resize', adjust)
    viewport?.addEventListener('scroll', adjust)
    adjust()
    element.querySelector<HTMLElement>('[data-sheet-autofocus]')?.focus({ preventScroll: true })
    return () => {
      viewport?.removeEventListener('resize', adjust)
      viewport?.removeEventListener('scroll', adjust)
    }
  }, [])
  function close() {
    if (panel.current?.contains(document.activeElement) && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }
    onClose()
  }
  const backdropPress = useRef(false)
  return <div className="sheet-backdrop" onPointerDown={event => {
    backdropPress.current = event.target === event.currentTarget
  }} onClick={event => {
    if (!backdropPress.current || event.target !== event.currentTarget) return
    if (compact) close()
    else if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  }}>
    <section ref={panel} role="dialog" aria-modal="true" aria-label={title}
      className={'sheet' + (compact ? ' sheet-compact' : '')}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.stopPropagation(); close() }
        if (event.key === 'Enter' && !compact && event.target instanceof HTMLInputElement
          && event.target.type === 'text' && !event.nativeEvent.isComposing) {
          event.preventDefault()
          event.target.blur()
        }
      }}
      onPointerDown={event => {
        if (!(event.target instanceof Element) || !event.target.closest('input, textarea, select, button, label, summary')) {
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
        }
      }}
      onTouchStart={event => {
        const body = panel.current?.querySelector('.sheet-body')
        const target = event.target as Element
        gesture.current = null
        if (target.closest('.sheet-grip') || ((!body || body.scrollTop <= 0)
          && !target.closest('input,textarea,button,select,label,summary,[data-drag-row]'))) {
          const touch = event.touches[0]
          gesture.current = { x: touch.clientX, y: touch.clientY }
        }
      }}
      onTouchCancel={() => { gesture.current = null }}
      onTouchEnd={event => {
        const start = gesture.current
        gesture.current = null
        if (!start) return
        const touch = event.changedTouches[0]
        if (touch.clientY - start.y > 72 && Math.abs(touch.clientX - start.x) < 50) close()
      }}>
      <button type="button" className="sheet-grip" aria-label="シートを閉じる" onClick={close}><span /></button>
      <h2>{title}</h2>
      <div className="sheet-body">{children}</div>
    </section>
  </div>
}
