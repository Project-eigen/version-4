import { useState } from 'react'
import Modal from './Modal'

export interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  /** Destructive styling for leave / delete / unlink */
  destructive?: boolean
  /** Parent-controlled busy (preferred when parent tracks async) */
  busy?: boolean
  titleId?: string
}

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = true,
  busy: busyProp = false,
  titleId = 'confirm-dialog-title',
}: ConfirmDialogProps) {
  const [internalBusy, setInternalBusy] = useState(false)
  const busy = busyProp || internalBusy

  const handleConfirm = async () => {
    if (busy) return
    setInternalBusy(true)
    try {
      await onConfirm()
    } catch {
      // Parent toasts errors; keep dialog open for retry
    } finally {
      setInternalBusy(false)
    }
  }

  const handleClose = () => {
    if (busy) return
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={title}
      titleId={titleId}
      variant="center"
      className="confirm-dialog-panel"
    >
      <p className="confirm-dialog-desc" id={`${titleId}-desc`}>
        {description}
      </p>
      <div className="confirm-dialog-actions">
        <button
          type="button"
          className="btn-ghost"
          onClick={handleClose}
          disabled={busy}
          data-autofocus
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          className={destructive ? 'btn-danger' : 'btn-primary'}
          onClick={handleConfirm}
          disabled={busy}
          aria-busy={busy}
        >
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
