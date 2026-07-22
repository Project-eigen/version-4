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

export default function MedicineInfoModal({ isOpen, onClose, medicineName, dosage }: MedicineInfoModalProps) {
  const [loading, setLoading] = useState(true)
  const [info, setInfo] = useState<InfoData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen || !medicineName) return

    const cacheKey = `ds_med_info_${medicineName.toLowerCase().trim()}`
    const cached = localStorage.getItem(cacheKey)

    if (cached) {
      try {
        setInfo(JSON.parse(cached))
        setLoading(false)
        return
      } catch (e) {
        localStorage.removeItem(cacheKey)
      }
    }

    setLoading(true)
    setError(null)

    api.post('/medicine/info', { name: medicineName, dosage })
      .then((res: any) => {
        setInfo(res.data)
        try {
          localStorage.setItem(cacheKey, JSON.stringify(res.data))
        } catch (e) {}
      })
      .catch(() => {
        setError('Failed to fetch AI information. Please try again.')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [isOpen, medicineName, dosage])

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 100,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          background: 'rgba(0, 0, 0, 0.65)',
          backdropFilter: 'blur(8px)',
        }}
        onClick={onClose}
      >
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: 520,
            background: 'var(--bg-glass-card, rgba(15, 23, 42, 0.95))',
            borderTopLeftRadius: '28px',
            borderTopRightRadius: '28px',
            border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.12))',
            boxShadow: '0 -20px 40px rgba(0, 0, 0, 0.4)',
            padding: '24px',
            color: 'var(--text-primary, #ffffff)',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, rgba(45, 212, 191, 0.2), rgba(56, 189, 248, 0.2))', border: '1px solid rgba(45, 212, 191, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2dd4bf' }}>
                <Sparkles size={18} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  {medicineName}
                </h3>
                {dosage && <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{dosage}</span>}
              </div>
            </div>

            <button
              onClick={onClose}
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: 'var(--bg-glass)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          {loading ? (
            <div style={{ padding: '32px 0', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <div className="loading-spinner" />
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Asking DawaiSathi AI Pharmacist...</p>
            </div>
          ) : error ? (
            <div style={{ padding: '16px', borderRadius: 16, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#f87171', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertCircle size={16} /> {error}
            </div>
          ) : info ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Purpose */}
              <div style={{ background: 'var(--bg-glass, rgba(255, 255, 255, 0.04))', padding: '14px', borderRadius: 16, border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-teal, #2dd4bf)', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Info size={14} /> PURPOSE & USE
                </div>
                <p style={{ fontSize: '0.88rem', margin: 0, color: 'var(--text-primary)', lineHeight: 1.45 }}>
                  {info.purpose}
                </p>
              </div>

              {/* How to take */}
              <div style={{ background: 'var(--bg-glass, rgba(255, 255, 255, 0.04))', padding: '14px', borderRadius: 16, border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#38bdf8', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircle2 size={14} /> HOW TO TAKE
                </div>
                <p style={{ fontSize: '0.88rem', margin: 0, color: 'var(--text-primary)', lineHeight: 1.45 }}>
                  {info.how_to_take}
                </p>
              </div>

              {/* Side effects */}
              <div style={{ background: 'var(--bg-glass, rgba(255, 255, 255, 0.04))', padding: '14px', borderRadius: 16, border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#f59e0b', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertCircle size={14} /> PRECAUTIONS & SIDE EFFECTS
                </div>
                <p style={{ fontSize: '0.88rem', margin: 0, color: 'var(--text-primary)', lineHeight: 1.45 }}>
                  {info.side_effects}
                </p>
              </div>

              {/* Disclaimer */}
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, padding: '0 4px' }}>
                <ShieldCheck size={14} style={{ color: 'var(--accent-teal)' }} />
                <span>{info.disclaimer || "Always follow your doctor's exact instructions."}</span>
              </div>
            </div>
          ) : null}
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
