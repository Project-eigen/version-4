import { useRef, type ReactNode } from 'react'
import { useDialogA11y } from '../hooks/useDialogA11y'

export type ModalVariant = 'sheet' | 'center'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  titleId?: string
  children: ReactNode
  variant?: ModalVariant
  /** Extra class on the dialog panel */
  className?: string
  /** Extra class on the overlay */
  overlayClassName?: string
}

/**
 * Shared product dialog: Escape, focus trap, restore focus, aria-modal.
 * Sheet = bottom sheet; center = mid-screen panel.
 */
export default function Modal({
  open,
  onClose,
  title,
  titleId = 'dialog-title',
  children,
  variant = 'sheet',
  className = '',
  overlayClassName = '',
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  useDialogA11y(open, onClose, panelRef)

  if (!open) return null

  const overlayCls = [
    'modal-overlay',
    variant === 'center' ? 'modal-overlay-center' : '',
    overlayClassName,
  ]
    .filter(Boolean)
    .join(' ')

  const panelCls = [
    variant === 'sheet' ? 'modal-sheet' : 'modal-center-panel',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={overlayCls} onClick={onClose} role="presentation">
      <div
        ref={panelRef}
        className={panelCls}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        {variant === 'sheet' && <div className="modal-handle" aria-hidden="true" />}
        {title && (
          <h2 id={titleId} className="modal-title">
            {title}
          </h2>
        )}
        {children}
      </div>
    </div>
  )
}
