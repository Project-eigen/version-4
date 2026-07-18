import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function isVisible(node: HTMLElement): boolean {
  // offsetParent is null for position:fixed — use client rects instead
  if (node.getClientRects().length === 0) return false
  const style = window.getComputedStyle(node)
  if (style.visibility === 'hidden' || style.display === 'none') return false
  return true
}

/**
 * Focus trap + Escape + restore focus for dialogs / sheets.
 */
export function useDialogA11y(
  open: boolean,
  onClose: () => void,
  containerRef: RefObject<HTMLElement | null>,
) {
  const previousFocus = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return

    previousFocus.current = document.activeElement as HTMLElement | null
    const el = containerRef.current
    if (!el) return

    const getFocusable = () =>
      Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isVisible)

    const prefer =
      el.querySelector<HTMLElement>('[data-autofocus]') || getFocusable()[0]
    requestAnimationFrame(() => prefer?.focus())

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const list = getFocusable()
      if (list.length === 0) return
      const first = list[0]
      const last = list[list.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
      previousFocus.current?.focus?.()
    }
  }, [open, containerRef])
}
