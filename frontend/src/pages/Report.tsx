import { useEffect, useState, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  Share2,
  Copy,
  ArrowLeft,
  Flame,
  CheckCircle2,
  Award,
  Calendar,
  AlertCircle,
  Minus,
  Clock,
  Sparkles,
  Sun,
  Sunrise,
  Sunset,
  Moon,
  Info,
  X,
  Printer,
} from 'lucide-react'
import html2canvas from 'html2canvas'
import api from '../api/client'
import AppLayout from '../components/AppLayout'
import Toast from '../components/Toast'
import Modal from '../components/Modal'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import type { User } from '../types'

interface DoseDetail {
  medicine_name: string
  dosage: string
  instructions?: string
  slot: 'morning' | 'afternoon' | 'evening' | 'night'
  taken: boolean
}

interface TimelineDay {
  day: string
  date_str: string
  full_date?: string
  status: 'complete' | 'partial' | 'missed' | 'pending' | 'untracked' | 'no_doses'
  taken: number
  total: number
  doses?: DoseDetail[]
}

interface SlotAnalytics {
  taken: number
  total: number
  pct: number
}

interface ReportData {
  userName: string
  adherencePct: number
  is_new_user?: boolean
  weekly_taken?: number
  weekly_scheduled?: number
  slot_analytics?: Record<string, SlotAnalytics>
  best_slot?: string | null
  weakest_slot?: string | null
  timeline: TimelineDay[]
  app_version: string
}

export default function Report() {
  const navigate = useNavigate()
  const { user, activeMemberId } = useAuth()
  const { lang, t } = useLanguage()
  const cardRef = useRef<HTMLDivElement>(null)

  const [sharing, setSharing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [report, setReport] = useState<ReportData | null>(null)
  const [streakDays, setStreakDays] = useState(0)
  const [familyMembers, setFamilyMembers] = useState<User[]>([])
  const [selectedDay, setSelectedDay] = useState<TimelineDay | null>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 3000)
  }

  const location = useLocation()

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      try {
        const tzOffset = new Date().getTimezoneOffset()
        const targetId = activeMemberId || user?.id || 0

        const [reportRes, streakRes, membersRes] = await Promise.all([
          api.get(`/medicine/report?user_id=${targetId}&tz_offset=${tzOffset}`),
          api.get(`/medicine/streak?user_id=${targetId}&tz_offset=${tzOffset}`).catch(() => ({ data: { streak_days: 0 } })),
          api.get('/family/members').catch(() => ({ data: { members: [] } })),
        ])

        setReport(reportRes.data)
        setStreakDays(streakRes.data?.streak_days || 0)
        setFamilyMembers(membersRes.data?.members || [])
      } catch (e) {
        if (import.meta.env.DEV) console.error('[Report] load error:', e)
      } finally {
        setLoading(false)
      }
    }

    loadData()
    window.addEventListener('focus', loadData)
    return () => window.removeEventListener('focus', loadData)
  }, [activeMemberId, user?.id, location.key])

  // Calculate Tier Badge & Status Feedback
  const getAdherenceTier = (pct: number) => {
    if (report?.weekly_scheduled === 0 || pct >= 95) {
      return {
        badge: 'S+ TIER',
        label: lang === 'hi' ? 'उत्कृष्ट पालन (Perfect)' : 'Perfect Adherence',
        desc: lang === 'hi' ? 'शानदार! आपकी दिनचर्या पूरी तरह से ट्रैक पर है।' : 'Outstanding! You maintained near-flawless medicine schedule compliance.',
        color: '#2dd4bf',
        bg: 'rgba(45, 212, 191, 0.15)',
        border: 'rgba(45, 212, 191, 0.4)',
      }
    }
    if (pct >= 85) {
      return {
        badge: 'A+ TIER',
        label: lang === 'hi' ? 'बहुत अच्छा (Great)' : 'Great Compliance',
        desc: lang === 'hi' ? 'बहुत बढ़िया प्रयास! आपकी स्वास्थ्य दिनचर्या बहुत मजबूत है।' : 'Great effort! Your routine is strong with consistent dosage tracking.',
        color: '#38bdf8',
        bg: 'rgba(56, 189, 248, 0.15)',
        border: 'rgba(56, 189, 248, 0.4)',
      }
    }
    if (pct >= 70) {
      return {
        badge: 'B TIER',
        label: lang === 'hi' ? 'अच्छा प्रदर्शन (Good)' : 'Consistent Routine',
        desc: lang === 'hi' ? 'अच्छा प्रयास! टेलीग्राम रिमाइंडर ऑन करके इसे और बेहतर बनाएं।' : 'Good progress! Enable Telegram reminders to avoid missing remaining evening/night doses.',
        color: '#f59e0b',
        bg: 'rgba(245, 158, 11, 0.15)',
        border: 'rgba(245, 158, 11, 0.4)',
      }
    }
    return {
      badge: 'C TIER',
      label: lang === 'hi' ? 'ध्यान दें (Needs Focus)' : 'Needs Focus',
      desc: lang === 'hi' ? 'कृपया अपनी दवाओं के समय पर ध्यान दें। रिमाइंडर सेट करें।' : 'Adherence fell below 70%. Set up alarm notifications to stay safely on track.',
      color: '#f43f5e',
      bg: 'rgba(244, 63, 94, 0.15)',
      border: 'rgba(244, 63, 94, 0.4)',
    }
  }

  const tier = getAdherenceTier(report?.adherencePct ?? 0)

  const getSlotIcon = (slot: string) => {
    switch (slot) {
      case 'morning': return <Sunrise size={14} color="#f59e0b" />
      case 'afternoon': return <Sun size={14} color="#38bdf8" />
      case 'evening': return <Sunset size={14} color="#f97316" />
      case 'night': return <Moon size={14} color="#818cf8" />
      default: return <Clock size={14} color="#2dd4bf" />
    }
  }

  const handleCopyText = () => {
    const currentOrigin = window.location.origin
    const pct = report?.adherencePct || 0
    const text = lang === 'hi'
      ? `💊 मेरी दवासाथी v4.1 साप्ताहिक हेल्थ रिपोर्ट:\n🏆 ${pct}% अनुपालन (${tier.badge})\n🔥 ${streakDays} दिन लगातार (Streak)!\n\nदवासाथी के साथ सुरक्षित रहें: ${currentOrigin}`
      : `💊 My DawaiSathi v4.1 Weekly Adherence Report:\n🏆 ${pct}% Weekly Compliance (${tier.badge})\n🔥 ${streakDays} Day Active Streak!\n\nManaged safely with DawaiSathi: ${currentOrigin}`
    
    navigator.clipboard.writeText(text)
    showToast(lang === 'hi' ? 'रिपोर्ट विवरण क्लिपबोर्ड में कॉपी हो गया!' : 'Report summary copied to clipboard!')
  }

  const handleShareImage = async () => {
    if (!cardRef.current || sharing) return
    setSharing(true)

    try {
      const canvas = await html2canvas(cardRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: null,
      })

      canvas.toBlob(async (blob) => {
        if (!blob) {
          showToast('Failed to render image')
          setSharing(false)
          return
        }

        const file = new File([blob], 'dawaisathi-v4.1-weekly-report.png', { type: 'image/png' })

        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({
              title: 'DawaiSathi v4.1 Weekly Adherence Card',
              text: `Check out my medicine adherence report on DawaiSathi! 💊`,
              files: [file],
            })
            showToast('Report shared successfully!')
          } catch (shareErr) {
            handleCopyText()
          }
        } else {
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = 'dawaisathi-v4.1-weekly-report.png'
          a.click()
          URL.revokeObjectURL(url)
          showToast('Report image downloaded!')
        }
        setSharing(false)
      }, 'image/png')
    } catch (e) {
      if (import.meta.env.DEV) console.error('[Report] export error:', e)
      showToast('Export failed — copying text summary instead')
      handleCopyText()
      setSharing(false)
    }
  }

  const deployedUrl = window.location.origin.includes('localhost') 
    ? 'https://dawaisathi-api.onrender.com' 
    : window.location.origin

  return (
    <AppLayout
      familyMembers={familyMembers}
      activeMemberId={user?.id || 0}
      onSelectMember={() => {}}
    >
      <div style={{ maxWidth: 620, margin: '0 auto', padding: '16px 16px 100px' }}>
        {/* Top bar chrome */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              padding: '8px 14px',
              borderRadius: 'var(--radius-full)',
              color: 'var(--text-primary)',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            <ArrowLeft size={16} /> {t('back') || 'Back'}
          </button>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleCopyText}
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                padding: '8px 12px',
                borderRadius: 'var(--radius-full)',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: '0.8rem',
              }}
            >
              <Copy size={14} /> {lang === 'hi' ? 'कॉपी करें' : 'Copy Text'}
            </button>

            <button
              onClick={() => window.print()}
              disabled={loading}
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                padding: '8px 14px',
                borderRadius: 'var(--radius-full)',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: '0.8rem',
              }}
            >
              <Printer size={15} color="var(--accent-teal)" />
              {lang === 'hi' ? 'डॉक्टर PDF रिपोर्ट' : 'Doctor PDF'}
            </button>

            <button
              onClick={handleShareImage}
              disabled={sharing || loading}
              style={{
                background: 'linear-gradient(135deg, var(--accent-teal) 0%, #0d9488 100%)',
                color: '#ffffff',
                border: 'none',
                padding: '8px 16px',
                borderRadius: 'var(--radius-full)',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: '0.82rem',
                opacity: sharing || loading ? 0.7 : 1,
              }}
            >
              <Share2 size={15} /> {sharing ? (lang === 'hi' ? 'जनरेट हो रहा है…' : 'Generating…') : (lang === 'hi' ? 'कार्ड शेयर करें' : 'Share Card')}
            </button>
          </div>
        </div>

        {/* Report Card */}
        {loading ? (
          <div style={{ padding: '60px 0', textAlign: 'center' }}>
            <div className="loading-spinner" />
          </div>
        ) : (
          <motion.div
            ref={cardRef}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              background: 'linear-gradient(150deg, #0b1329 0%, #111c35 50%, #152542 100%)',
              borderRadius: '28px',
              border: `1px solid ${tier.border}`,
              boxShadow: `0 24px 48px rgba(0,0,0,0.45), 0 0 40px ${tier.bg}`,
              padding: '28px 24px',
              color: '#ffffff',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Ambient Top Glow */}
            <div
              style={{
                position: 'absolute',
                top: '-25%',
                right: '-15%',
                width: '300px',
                height: '300px',
                background: `radial-gradient(circle, ${tier.color}25 0%, rgba(0,0,0,0) 70%)`,
                pointerEvents: 'none',
              }}
            />

            {/* Header Brand & Tier Badge */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '1px', color: tier.color, fontWeight: 800 }}>
                    DawaiSathi v4.1
                  </span>
                  <span
                    style={{
                      fontSize: '0.65rem',
                      padding: '2px 8px',
                      borderRadius: 10,
                      background: tier.bg,
                      color: tier.color,
                      border: `1px solid ${tier.border}`,
                      fontWeight: 800,
                      letterSpacing: '0.5px',
                    }}
                  >
                    {tier.badge}
                  </span>
                </div>
                <h2 style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0, color: '#ffffff' }}>
                  {report?.userName || 'User'}&apos;s {lang === 'hi' ? 'साप्ताहिक रिपोर्ट' : 'Health Adherence'}
                </h2>
              </div>

              <div
                style={{
                  padding: '8px 14px',
                  borderRadius: 16,
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  color: '#f97316',
                  fontWeight: 800,
                  fontSize: '0.88rem',
                }}
              >
                <Flame size={18} fill="#f97316" /> {streakDays} {lang === 'hi' ? 'दिन' : 'Days'}
              </div>
            </div>

            {/* Central Score Card with SVG Circular Ring */}
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.035)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '24px',
                padding: '20px',
                marginBottom: 24,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
              }}
            >
              {/* Left Side: Score & Description */}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: tier.color, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <Award size={16} /> {tier.label}
                </div>
                <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: '0 0 12px', lineHeight: 1.45 }}>
                  {tier.desc}
                </p>

                <div style={{ display: 'flex', gap: 16 }}>
                  <div>
                    <span style={{ display: 'block', fontSize: '0.68rem', color: '#64748b', fontWeight: 600 }}>
                      {lang === 'hi' ? 'ली गई खुराक' : 'Doses Logged'}
                    </span>
                    <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#f8fafc' }}>
                      {report?.weekly_taken ?? 0} <span style={{ fontSize: '0.78rem', color: '#64748b' }}>/ {report?.weekly_scheduled ?? 0}</span>
                    </span>
                  </div>
                  <div>
                    <span style={{ display: 'block', fontSize: '0.68rem', color: '#64748b', fontWeight: 600 }}>
                      {lang === 'hi' ? 'सक्रिय स्ट्रिक' : 'Active Streak'}
                    </span>
                    <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#f97316' }}>
                      {streakDays} {lang === 'hi' ? 'दिन' : 'Days'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Side: Animated SVG Radial Ring */}
              <div style={{ position: 'relative', width: 96, height: 96, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="96" height="96" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
                  <circle cx="50" cy="50" r="40" stroke="rgba(255, 255, 255, 0.08)" strokeWidth="10" fill="transparent" />
                  <motion.circle
                    cx="50"
                    cy="50"
                    r="40"
                    stroke={tier.color}
                    strokeWidth="10"
                    strokeDasharray="251.2"
                    initial={{ strokeDashoffset: 251.2 }}
                    animate={{ strokeDashoffset: 251.2 - (251.2 * (report?.adherencePct || 0)) / 100 }}
                    transition={{ duration: 1.2, ease: 'easeOut' }}
                    strokeLinecap="round"
                    fill="transparent"
                  />
                </svg>
                <div style={{ position: 'absolute', textAlign: 'center' }}>
                  <span style={{ display: 'block', fontSize: '1.35rem', fontWeight: 900, color: tier.color, lineHeight: 1 }}>
                    {report?.adherencePct ?? 0}%
                  </span>
                  <span style={{ fontSize: '0.58rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    {lang === 'hi' ? 'स्कोर' : 'SCORE'}
                  </span>
                </div>
              </div>
            </div>

            {/* 7-Day Compliance Timeline Grid */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#cbd5e1', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Calendar size={14} style={{ color: '#38bdf8' }} />
                  <span>{lang === 'hi' ? 'पिछले 7 दिनों का टाइमलाइन' : 'LAST 7 DAYS TIMELINE'}</span>
                </div>
                <span style={{ fontSize: '0.68rem', color: '#64748b', fontWeight: 500 }}>
                  {lang === 'hi' ? 'विवरण के लिए टैप करें' : 'Tap day for details'}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
                {report?.timeline.map((item, idx) => (
                  <motion.button
                    key={idx}
                    type="button"
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => setSelectedDay(item)}
                    style={{
                      background:
                        item.status === 'complete'
                          ? 'rgba(45, 212, 191, 0.14)'
                          : item.status === 'partial'
                          ? 'rgba(245, 158, 11, 0.14)'
                          : item.status === 'missed'
                          ? 'rgba(244, 63, 94, 0.14)'
                          : 'rgba(255, 255, 255, 0.03)',
                      border:
                        item.status === 'complete'
                          ? '1px solid rgba(45, 212, 191, 0.35)'
                          : item.status === 'partial'
                          ? '1px solid rgba(245, 158, 11, 0.35)'
                          : item.status === 'missed'
                          ? '1px solid rgba(244, 63, 94, 0.35)'
                          : '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '16px',
                      padding: '12px 4px',
                      textAlign: 'center',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 6,
                      cursor: 'pointer',
                      color: '#ffffff',
                    }}
                  >
                    <span style={{ fontSize: '0.72rem', fontWeight: 800, color: item.status === 'complete' ? '#2dd4bf' : '#94a3b8' }}>
                      {item.day}
                    </span>

                    {item.status === 'complete' ? (
                      <CheckCircle2 size={18} style={{ color: '#2dd4bf' }} />
                    ) : item.status === 'partial' ? (
                      <AlertCircle size={18} style={{ color: '#f59e0b' }} />
                    ) : item.status === 'pending' ? (
                      <Clock size={18} style={{ color: '#38bdf8' }} />
                    ) : item.status === 'missed' ? (
                      <X size={18} style={{ color: '#f43f5e' }} />
                    ) : (
                      <Minus size={18} style={{ color: '#475569' }} />
                    )}

                    <span style={{ fontSize: '0.62rem', color: '#64748b', fontWeight: 600 }}>
                      {item.total > 0 ? `${item.taken}/${item.total}` : item.date_str}
                    </span>
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Weekly Slot Analytics Insights */}
            {report?.slot_analytics && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#cbd5e1', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={14} style={{ color: '#f59e0b' }} />
                  <span>{lang === 'hi' ? 'समय अनुसार अनुपालन विश्लेषण' : 'SLOT COMPLIANCE BREAKDOWN'}</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  {(['morning', 'afternoon', 'evening', 'night'] as const).map((slot) => {
                    const data = report.slot_analytics?.[slot]
                    const pct = data?.pct ?? 100
                    return (
                      <div
                        key={slot}
                        style={{
                          background: 'rgba(255, 255, 255, 0.03)',
                          border: '1px solid rgba(255, 255, 255, 0.07)',
                          borderRadius: '16px',
                          padding: '10px 8px',
                          textAlign: 'center',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 4 }}>
                          {getSlotIcon(slot)}
                          <span style={{ fontSize: '0.65rem', textTransform: 'capitalize', color: '#94a3b8', fontWeight: 700 }}>
                            {slot}
                          </span>
                        </div>
                        <span style={{ fontSize: '1rem', fontWeight: 800, color: pct >= 85 ? '#2dd4bf' : pct >= 70 ? '#f59e0b' : '#f43f5e' }}>
                          {data?.total ? `${pct}%` : '—'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Footer Watermark */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: 16,
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                fontSize: '0.72rem',
                color: '#64748b',
              }}
            >
              <span>Tracked safely with DawaiSathi v4.1</span>
              <span style={{ color: '#2dd4bf', fontWeight: 700 }}>{deployedUrl}</span>
            </div>
          </motion.div>
        )}

        {/* Day Detail Bottom-Sheet Modal */}
        <Modal
          open={Boolean(selectedDay)}
          onClose={() => setSelectedDay(null)}
          title={`${selectedDay?.day} (${selectedDay?.date_str}) ${lang === 'hi' ? 'दवा विवरण' : 'Dose Breakdown'}`}
          variant="sheet"
        >
          {selectedDay && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8 }}>
              {/* Header summary badge */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'var(--bg-surface-elevated)',
                  padding: '12px 16px',
                  borderRadius: 16,
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Calendar size={18} color="var(--accent-teal)" />
                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                    {selectedDay.date_str}
                  </span>
                </div>

                <span
                  style={{
                    padding: '4px 10px',
                    borderRadius: 12,
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    background:
                      selectedDay.status === 'complete'
                        ? 'rgba(45, 212, 191, 0.15)'
                        : selectedDay.status === 'partial'
                        ? 'rgba(245, 158, 11, 0.15)'
                        : 'rgba(244, 63, 94, 0.15)',
                    color:
                      selectedDay.status === 'complete'
                        ? '#2dd4bf'
                        : selectedDay.status === 'partial'
                        ? '#f59e0b'
                        : '#f43f5e',
                  }}
                >
                  {selectedDay.status === 'complete'
                    ? (lang === 'hi' ? '100% पूर्ण' : 'Fully Logged')
                    : selectedDay.status === 'partial'
                    ? (lang === 'hi' ? 'आंशिक' : 'Partially Taken')
                    : (lang === 'hi' ? 'कोई खुराक नहीं' : 'No Doses Logged')}
                </span>
              </div>

              {/* Doses List */}
              {selectedDay.doses && selectedDay.doses.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                  {selectedDay.doses.map((dose, dIdx) => (
                    <div
                      key={dIdx}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 14px',
                        borderRadius: 14,
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            background: dose.taken ? 'rgba(45, 212, 191, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {dose.taken ? (
                            <CheckCircle2 size={18} color="#2dd4bf" />
                          ) : (
                            <X size={18} color="#f43f5e" />
                          )}
                        </div>

                        <div>
                          <span style={{ display: 'block', fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                            {dose.medicine_name} {dose.dosage ? `(${dose.dosage})` : ''}
                          </span>
                          {dose.instructions && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                              {dose.instructions}
                            </span>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            textTransform: 'capitalize',
                            padding: '3px 8px',
                            borderRadius: 10,
                            background: 'var(--bg-subtle)',
                            color: 'var(--text-secondary)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          {getSlotIcon(dose.slot)} {dose.slot}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  <Info size={24} style={{ marginBottom: 6, opacity: 0.5 }} />
                  <p style={{ margin: 0 }}>
                    {lang === 'hi'
                      ? 'इस तारीख के लिए कोई दवा निर्धारित नहीं थी।'
                      : 'No medicine doses were scheduled for this date.'}
                  </p>
                </div>
              )}

              <button
                type="button"
                className="bottom-sheet-cancel"
                onClick={() => setSelectedDay(null)}
                style={{ marginTop: 12 }}
              >
                {lang === 'hi' ? 'बंद करें' : 'Close Details'}
              </button>
            </div>
          )}
        </Modal>

        {toastMsg && <Toast message={toastMsg} type="success" />}
      </div>
    </AppLayout>
  )
}
