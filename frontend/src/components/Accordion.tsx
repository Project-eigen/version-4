import type { ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

interface AccordionProps {
  id: string
  title: string
  open: boolean
  onToggle: () => void
  children: ReactNode
  icon?: ReactNode
  leading?: ReactNode
}

/** Accessible accordion card used on Settings and similar surfaces */
export default function Accordion({
  id,
  title,
  open,
  onToggle,
  children,
  icon,
  leading,
}: AccordionProps) {
  const triggerId = `${id}-trigger`
  const panelId = `${id}-panel`

  return (
    <div className="accordion-card card">
      <button
        type="button"
        id={triggerId}
        className="accordion-header accordion-header-btn"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
      >
        <div className="accordion-header-left">
          {leading}
          {icon}
          <span className="accordion-title">{title}</span>
        </div>
        {open ? (
          <ChevronUp size={16} color="var(--text-muted)" aria-hidden="true" />
        ) : (
          <ChevronDown size={16} color="var(--text-muted)" aria-hidden="true" />
        )}
      </button>
      {open && (
        <div
          id={panelId}
          role="region"
          aria-labelledby={triggerId}
          className="accordion-content accordion-content-pad"
        >
          {children}
        </div>
      )}
    </div>
  )
}
