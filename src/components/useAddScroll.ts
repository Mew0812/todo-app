import { useLayoutEffect, useRef } from 'react'

type ScrollPosition = {
  y: number
  anchor?: HTMLElement
  top: number
  viewportHeight: number
  viewportTop: number
  addedId?: string
}

export function useAddScroll(open: boolean) {
  const position = useRef<ScrollPosition | null>(null)
  const stopRestoring = useRef<() => void>(() => {})

  function capture(anchor?: HTMLElement) {
    stopRestoring.current()
    const viewport = window.visualViewport
    const y = window.scrollY
    position.current = {
      y, anchor, top: anchor?.getBoundingClientRect().top ?? 0,
      viewportHeight: viewport?.height ?? window.innerHeight, viewportTop: viewport?.offsetTop ?? 0,
    }
    document.body.style.setProperty('--add-scroll-top', `${-y}px`)
    document.body.classList.add('add-sheet-open')
  }

  useLayoutEffect(() => {
    if (open || !position.current) return
    const saved = position.current
    position.current = null
    const viewport = window.visualViewport
    document.body.classList.remove('add-sheet-open')
    document.body.style.removeProperty('--add-scroll-top')

    function restore() {
      if (!saved.anchor?.isConnected) {
        window.scrollTo(0, saved.y)
        return
      }
      const anchor = saved.anchor.getBoundingClientRect()
      let offset = anchor.top - saved.top
      if (saved.addedId) {
        const card = document.getElementById('task-card-' + saved.addedId)?.getBoundingClientRect()
        const bottom = document.querySelector('.bottom-nav')?.getBoundingClientRect().top ?? window.innerHeight
        if (card && card.bottom - offset > bottom && card.bottom - anchor.top < bottom) {
          offset = card.bottom - bottom
        }
      }
      window.scrollTo(0, window.scrollY + offset)
    }

    let frame = 0
    function stop() {
      window.cancelAnimationFrame(frame)
      viewport?.removeEventListener('resize', update)
      viewport?.removeEventListener('scroll', update)
      window.removeEventListener('pointerdown', stop, true)
      window.removeEventListener('touchstart', stop, true)
      window.removeEventListener('wheel', stop, true)
      window.removeEventListener('keydown', stop, true)
    }
    function update() {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        const settled = !viewport || (viewport.height >= saved.viewportHeight - 1
          && Math.abs(viewport.offsetTop - saved.viewportTop) <= 1)
        if (settled) { restore(); stop() }
      })
    }
    restore()
    // Safari can finish dismissing the keyboard after React has removed the sheet.
    viewport?.addEventListener('resize', update)
    viewport?.addEventListener('scroll', update)
    window.addEventListener('pointerdown', stop, true)
    window.addEventListener('touchstart', stop, true)
    window.addEventListener('wheel', stop, true)
    window.addEventListener('keydown', stop, true)
    stopRestoring.current = stop
    update()
    return stop
  }, [open])

  return {
    capture,
    reveal(id: string) { if (position.current) position.current.addedId = id },
  }
}
