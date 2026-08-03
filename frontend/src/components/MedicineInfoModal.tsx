import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Sparkles, AlertCircle, Info, ShieldCheck, CheckCircle2 } from 'lucide-react'
import api from '../api/client'

interface MedicineInfoModalProps {
  isOpen: boolean
  onClose: () => void
  medicineName: string
  dosage?: string
}

interface InfoData {
  medicine_name: string
  purpose: string
  how_to_take: string
  side_effects: string
  disclaimer: string
}

// ── Section card colours — two palettes so light & dark are always readable ──
const SECTIONS = {
  purpose: {
    icon: <Info size={13} />,
    label: 'PURPOSE & USE',
    accent: { light: '#0d9488', dark: '#2dd4bf' },
    bg:     { light: 'rgba(13, 148, 136, 0.07)',  dark: 'rgba(45, 212, 191, 0.09)' },
    border: { light: 'rgba(13, 148, 136, 0.20)',  dark: 'rgba(45, 212, 191, 0.22)' },
  },
  how: {
    icon: <CheckCircle2 size={13} />,
    label: 'HOW TO TAKE',
    accent: { light: '#0369a1', dark: '#38bdf8' },
    bg:     { light: 'rgba(3, 105, 161, 0.07)',   dark: 'rgba(56, 189, 248, 0.09)' },
    border: { light: 'rgba(3, 105, 161, 0.20)',   dark: 'rgba(56, 189, 248, 0.22)' },
  },
  side: {
    icon: <AlertCircle size={13} />,
    label: 'PRECAUTIONS & SIDE EFFECTS',
    accent: { light: '#92400e', dark: '#fbbf24' },
    bg:     { light: 'rgba(146, 64, 14, 0.07)',   dark: 'rgba(251, 191, 36, 0.08)' },
    border: { light: 'rgba(146, 64, 14, 0.20)',   dark: 'rgba(251, 191, 36, 0.22)' },
  },
} as const

export default function MedicineInfoModal({ isOpen, onClose, medicineName, dosage }: MedicineInfoModalProps) {
  const [loading, setLoading] = useState(true)
  const [info, setInfo]       = useState<InfoData | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [isDark, setIsDark]   = useState(false)

  // Detect active theme so we can pick the right colour palette
  useEffect(() => {
    const check = () =>
      setIsDark(document.documentElement.getAttribute('data-theme') === 'dark')
    check()
    const obs = new MutationObserver(check)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (!isOpen || !medicineName) return

    const cacheKey = `ds_med_info_${medicineName.toLowerCase().trim()}`
    const cached = localStorage.getItem(cacheKey)

    if (cached) {
      try {
        setInfo(JSON.parse(cached))
        setLoading(false)
        return
      } catch {
        localStorage.removeItem(cacheKey)
      }
    }

    setLoading(true)
    setError(null)

    api.post('/medicine/info', { name: medicineName, dosage })
      .then((res: any) => {
        setInfo(res.data)
        try { localStorage.setItem(cacheKey, JSON.stringify(res.data)) } catch {}
      })
      .catch(() => setError('Failed to fetch AI information. Please try again.'))
      .finally(() => setLoading(false))
  }, [isOpen, medicineName, dosage])

  if (!isOpen) return null

  const mode = isDark ? 'dark' : 'light'

  return (
    <AnimatePresence>
      {/* ── Backdrop ─────────────────────────────────────────────────────── */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 100,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          background: 'rgba(0, 0, 0, 0.55)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
        }}
        onClick={onClose}
      >
        {/* ── Bottom sheet ─────────────────────────────────────────────── */}
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: 520,
            // bg-secondary = #ffffff in light, #0f172a in dark — always high-contrast
            background: 'var(--bg-secondary)',
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            border: '1px solid var(--border-subtle)',
            boxShadow: isDark
              ? '0 -24px 60px rgba(0,0,0,0.6), 0 -4px 16px rgba(0,0,0,0.4)'
              : '0 -16px 40px rgba(15,23,42,0.12), 0 -2px 8px rgba(15,23,42,0.06)',
            paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)',
          }}
        >
          {/* Drag handle */}
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 12, paddingBottom: 2 }}>
            <div style={{
              width: 36, height: 4, borderRadius: 999,
              background: 'var(--text-muted)', opacity: 0.35,
            }} />
          </div>

          {/* ── Header ─────────────────────────────────────────────────── */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 20px 14px',
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* AI badge */}
              <div style={{
                width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                background: isDark
                  ? 'linear-gradient(135deg, rgba(45,212,191,0.18), rgba(56,189,248,0.14))'
                  : 'linear-gradient(135deg, rgba(13,148,136,0.12), rgba(6,182,212,0.10))',
                border: '1.5px solid ' + (isDark ? 'rgba(45,212,191,0.3)' : 'rgba(13,148,136,0.25)'),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--accent-teal)',
              }}>
                <Sparkles size={18} />
              </div>

              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                  {medicineName}
                </h3>
                {dosage && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500, display: 'block', marginTop: 2 }}>
                    {dosage}
                  </span>
                )}
                <span style={{
                  fontSize: '0.67rem', fontWeight: 700, letterSpacing: '0.06em',
                  color: 'var(--accent-teal)', display: 'block', marginTop: 3, opacity: 0.8,
                }}>
                  AI PHARMACIST
                </span>
              </div>
            </div>

            {/* Close button */}
            <button
              onClick={onClose}
              aria-label="Close medicine info"
              style={{
                width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                background: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* ── Scrollable body ─────────────────────────────────────────── */}
          <div style={{
            padding: '16px 20px 20px',
            overflowY: 'auto',
            maxHeight: '60dvh',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}>
            {loading ? (
              <div style={{ padding: '40px 0', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                <div className="loading-spinner" />
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
                  Asking DawaiSathi AI Pharmacist…
                </p>
              </div>
            ) : error ? (
              <div style={{
                padding: '14px 16px', borderRadius: 14,
                background: 'rgba(220,38,38,0.08)', border: '1.5px solid rgba(220,38,38,0.2)',
                color: isDark ? '#f87171' : '#b91c1c',
                fontSize: '0.85rem', fontWeight: 500,
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                {error}
              </div>
            ) : info ? (
              <>
                {/* ── Purpose card ───────────────────────────────────── */}
                {([
                  { key: 'purpose', text: info.purpose,      section: SECTIONS.purpose },
                  { key: 'how',     text: info.how_to_take,  section: SECTIONS.how    },
                  { key: 'side',    text: info.side_effects, section: SECTIONS.side   },
                ] as const).map(({ key, text, section }) => (
                  <div
                    key={key}
                    style={{
                      borderRadius: 16,
                      padding: '14px 16px',
                      background: section.bg[mode],
                      border: `1.5px solid ${section.border[mode]}`,
                    }}
                  >
                    {/* Section label pill */}
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.07em',
                      textTransform: 'uppercase' as const,
                      color: section.accent[mode],
                      background: isDark
                        ? `color-mix(in srgb, ${section.accent.dark} 14%, transparent)`
                        : `color-mix(in srgb, ${section.accent.light} 12%, transparent)`,
                      border: `1px solid ${isDark
                        ? `color-mix(in srgb, ${section.accent.dark} 28%, transparent)`
                        : `color-mix(in srgb, ${section.accent.light} 24%, transparent)`}`,
                      borderRadius: 999,
                      padding: '3px 10px 3px 8px',
                      marginBottom: 10,
                    }}>
                      {section.icon}
                      {section.label}
                    </div>

                    {/* Body text — text-primary is always correct via CSS token */}
                    <p style={{
                      fontSize: '0.875rem', margin: 0,
                      color: 'var(--text-primary)',
                      lineHeight: 1.65, fontWeight: 400,
                    }}>
                      {text}
                    </p>
                  </div>
                ))}

                {/* ── Disclaimer ─────────────────────────────────────── */}
                <div style={{
                  fontSize: '0.72rem',
                  color: 'var(--text-muted)',
                  display: 'flex', alignItems: 'flex-start', gap: 8,
                  padding: '10px 14px', borderRadius: 12,
                  background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)',
                  border: '1px solid var(--border-subtle)',
                  lineHeight: 1.55,
                }}>
                  <ShieldCheck size={13} style={{ color: 'var(--accent-teal)', flexShrink: 0, marginTop: 1 }} />
                  <span>{info.disclaimer || "Always follow your doctor's exact instructions."}</span>
                </div>
              </>
            ) : null}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
