import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Camera, ShieldCheck, ArrowRight, CheckCircle2 } from 'lucide-react'

const SLIDES = [
  {
    id: 1,
    badge: 'AI Prescription Reader',
    title: 'Scan prescriptions in seconds',
    subtitle: 'Upload or snap a photo of any prescription. Our AI extracts medicine names, dosages, and daily schedules automatically.',
    icon: <Camera size={44} color="var(--accent-teal)" />,
    actionLabel: 'Next',
    bgGradient: 'linear-gradient(135deg, rgba(13, 148, 136, 0.12) 0%, rgba(6, 182, 212, 0.06) 100%)',
    border: 'rgba(13, 148, 136, 0.2)',
  },
  {
    id: 2,
    badge: 'Family Care',
    title: 'One cabinet for your whole family',
    subtitle: 'Manage prescriptions for yourself, aging parents, or children. Switch profiles in one tap with full schedule separation.',
    icon: <Sparkles size={44} color="#ea580c" />,
    actionLabel: 'Next',
    bgGradient: 'linear-gradient(135deg, rgba(234, 88, 12, 0.12) 0%, rgba(251, 146, 60, 0.06) 100%)',
    border: 'rgba(234, 88, 12, 0.2)',
  },
  {
    id: 3,
    badge: 'Smart Reminders',
    title: 'Never miss a dose again',
    subtitle: 'Receive timely notifications on web, push, or Telegram. Track daily adherence streaks and pill stock levels.',
    icon: <ShieldCheck size={44} color="#16a34a" />,
    actionLabel: 'Get Started',
    bgGradient: 'linear-gradient(135deg, rgba(22, 163, 74, 0.12) 0%, rgba(74, 222, 128, 0.06) 100%)',
    border: 'rgba(22, 163, 74, 0.2)',
  },
]

export default function Onboarding() {
  const [currentSlide, setCurrentSlide] = useState(0)
  const navigate = useNavigate()

  const handleFinish = (target: string = '/cabinet') => {
    localStorage.setItem('ds_onboarding_completed', 'true')
    navigate(target, { replace: true })
  }

  const handleNext = () => {
    if (currentSlide < SLIDES.length - 1) {
      setCurrentSlide((prev) => prev + 1)
    } else {
      handleFinish('/cabinet')
    }
  }

  const slide = SLIDES[currentSlide]

  return (
    <div className="app-shell" style={{ justifyContent: 'space-between', padding: '24px 20px 32px' }}>
      {/* Top Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {SLIDES.map((_, idx) => (
            <motion.div
              key={idx}
              animate={{
                width: currentSlide === idx ? 24 : 8,
                backgroundColor: currentSlide === idx ? 'var(--accent-teal)' : 'var(--border-subtle)',
              }}
              style={{ height: 6, borderRadius: 999 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => handleFinish('/cabinet')}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            fontWeight: 600,
            fontSize: 'var(--text-xs)',
            cursor: 'pointer',
          }}
        >
          Skip
        </button>
      </div>

      {/* Main Slide Card */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: 'auto 0' }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={slide.id}
            initial={{ opacity: 0, x: 40, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -40, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 280, damping: 26 }}
            style={{
              width: '100%',
              padding: '36px 24px',
              borderRadius: 'var(--radius-xl)',
              background: slide.bgGradient,
              border: `1px solid ${slide.border}`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              boxShadow: '0 16px 40px rgba(15, 23, 42, 0.06)',
            }}
          >
            <motion.div
              initial={{ scale: 0.7, rotate: -8 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 20, delay: 0.1 }}
              style={{
                width: 88,
                height: 88,
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.9)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 24,
                boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)',
              }}
            >
              {slide.icon}
            </motion.div>

            <span
              style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--text-secondary)',
                marginBottom: 8,
              }}
            >
              {slide.badge}
            </span>

            <h2
              style={{
                fontSize: 'var(--text-xl)',
                fontWeight: 700,
                color: 'var(--text-primary)',
                margin: '0 0 12px',
                lineHeight: 1.25,
              }}
            >
              {slide.title}
            </h2>

            <p
              style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--text-secondary)',
                lineHeight: 1.55,
                margin: 0,
                maxWidth: 320,
              }}
            >
              {slide.subtitle}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom Action Area */}
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {currentSlide === 0 && (
          <button
            type="button"
            className="btn-primary"
            onClick={() => handleFinish('/scan')}
            style={{ width: '100%', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <Camera size={18} />
            Scan Prescription Right Now
          </button>
        )}

        <button
          type="button"
          className={currentSlide === 0 ? 'btn-ghost' : 'btn-primary'}
          onClick={handleNext}
          style={{ width: '100%', justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 8 }}
        >
          {slide.actionLabel}
          {currentSlide === SLIDES.length - 1 ? <CheckCircle2 size={18} /> : <ArrowRight size={18} />}
        </button>
      </div>
    </div>
  )
}
