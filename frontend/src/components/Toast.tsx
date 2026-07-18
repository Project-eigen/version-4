export type ToastType = 'success' | 'error'

interface ToastProps {
  message: string
  type?: ToastType
}

/** Unified floating toast — uses design-token z-scale */
export default function Toast({ message, type = 'success' }: ToastProps) {
  if (!message) return null
  return (
    <div className={`toast ${type}`} role="status" aria-live="polite">
      {message}
    </div>
  )
}
