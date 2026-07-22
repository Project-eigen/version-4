import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Share2, Copy, ArrowLeft, Flame, CheckCircle2, Trophy, Award, Calendar, AlertCircle, Minus, Clock } from 'lucide-react'
import html2canvas from 'html2canvas'
import api from '../api/client'
import AppLayout from '../components/AppLayout'
import Toast from '../components/Toast'
import { useAuth } from '../context/AuthContext'
import type { User } from '../types'

interface TimelineDay {
  day: string
  date_str: string
  status: 'complete' | 'partial' | 'missed' | 'pending' | 'untracked' | 'no_doses'
  taken: number
  total: number
}

interface ReportData {
  userName: string
  adherencePct: number
  timeline: TimelineDay[]
  app_version: string
}

export default function Report() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const cardRef = useRef<HTMLDivElement>(null)
  
  const [sharing, setSharing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [report, setReport] = useState<ReportData | null>(null)
  const [streakDays, setStreakDays] = useState(0)
  const [familyMembers, setFamilyMembers] = useState<User[]>([])
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 3000)
  }

  useEffect(() => {
    async function loadData() {
      setLoading(true)
      try {
        const tzOffset = new Date().getTimezoneOffset()

        const [reportRes, streakRes, membersRes] = await Promise.all([
          api.get(`/medicine/report?tz_offset=${tzOffset}`),
          api.get(`/medicine/streak?tz_offset=${tzOffset}`).catch(() => ({ data: { streak_days: 0 } })),
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
  }, [])

  const handleCopyText = () => {
    const currentOrigin = window.location.origin
    const text = `💊 My DawaiSathi v4.1 Adherence Report:\n🏆 ${report?.adherencePct || 100}% Weekly Adherence\n🔥 ${streakDays} Day Streak!\n\nManaged safely with DawaiSathi v4.1: ${currentOrigin}`
    navigator.clipboard.writeText(text)
    showToast('Report summary copied to clipboard!')
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
              text: `Check out my medicine adherence on DawaiSathi v4.1! 💊`,
              files: [file],
            })
            showToast('Report shared successfully!')
          } catch (shareErr) {
            handleCopyText()
          }
        } else {
          // Download fallback
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
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '16px 16px 100px' }}>
        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'var(--bg-glass)',
              border: '1px solid var(--border-subtle)',
              padding: '8px 14px',
              borderRadius: 'var(--radius-full)',
              color: 'var(--text-primary)',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <ArrowLeft size={16} /> Back
          </button>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleCopyText}
              style={{
                background: 'var(--bg-glass)',
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
              <Copy size={14} /> Copy Text
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
              }}
            >
              <Share2 size={15} /> {sharing ? 'Generating...' : 'Share Card'}
            </button>
          </div>
        </div>

        {/* Shareable Weekly Adherence Report Card */}
        {loading ? (
          <div style={{ padding: '48px 0', textAlign: 'center' }}>
            <div className="loading-spinner" />
          </div>
        ) : (
          <motion.div
            ref={cardRef}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{
              background: 'linear-gradient(145deg, #0b1329 0%, #152238 100%)',
              borderRadius: '28px',
              border: '1px solid rgba(45, 212, 191, 0.35)',
              boxShadow: '0 20px 40px rgba(0,0,0,0.4), 0 0 35px rgba(45, 212, 191, 0.15)',
              padding: '28px 24px',
              color: '#ffffff',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Card Ambient Glow Background */}
            <div
              style={{
                position: 'absolute',
                top: '-20%',
                right: '-10%',
                width: '240px',
                height: '240px',
                background: 'radial-gradient(circle, rgba(45, 212, 191, 0.22) 0%, rgba(0,0,0,0) 70%)',
                pointerEvents: 'none',
              }}
            />

            {/* Card Header Brand */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '1px', color: '#2dd4bf', fontWeight: 800 }}>
                    DawaiSathi v4.1
                  </span>
                  <span style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: 8, background: 'rgba(45,212,191,0.2)', color: '#2dd4bf', fontWeight: 700 }}>
                    WEEKLY REPORT
                  </span>
                </div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#ffffff' }}>
                  {report?.userName || 'User'}&apos;s Health Record
                </h2>
              </div>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, rgba(45, 212, 191, 0.25), rgba(56, 189, 248, 0.25))',
                  border: '1px solid rgba(45, 212, 191, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#2dd4bf',
                }}
              >
                <Trophy size={22} />
              </div>
            </div>

            {/* Adherence Score & Streak Box */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
                marginBottom: 24,
              }}
            >
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '20px',
                  padding: '16px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <Award size={13} style={{ color: '#2dd4bf' }} /> ADHERENCE SCORE
                </div>
                <div style={{ fontSize: '2.2rem', fontWeight: 900, color: '#2dd4bf', marginTop: 4 }}>
                  {report?.adherencePct ?? 0}%
                </div>
              </div>

              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '20px',
                  padding: '16px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <Flame size={13} style={{ color: '#f97316' }} /> STREAK RECORD
                </div>
                <div style={{ fontSize: '2.2rem', fontWeight: 900, color: '#f97316', marginTop: 4 }}>
                  {streakDays} <span style={{ fontSize: '1rem', fontWeight: 600 }}>Days</span>
                </div>
              </div>
            </div>

            {/* 7-Day Compliance Timeline */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#cbd5e1', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Calendar size={14} style={{ color: '#38bdf8' }} /> LAST 7 DAYS TIMELINE
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
                {report?.timeline.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      background:
                        item.status === 'complete'
                          ? 'rgba(45, 212, 191, 0.16)'
                          : item.status === 'partial'
                          ? 'rgba(245, 158, 11, 0.16)'
                          : 'rgba(255, 255, 255, 0.03)',
                      border:
                        item.status === 'complete'
                          ? '1px solid rgba(45, 212, 191, 0.4)'
                          : item.status === 'partial'
                          ? '1px solid rgba(245, 158, 11, 0.4)'
                          : '1px solid rgba(255, 255, 255, 0.08)',
                      borderRadius: '14px',
                      padding: '10px 4px',
                      textAlign: 'center',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: item.status === 'complete' ? '#2dd4bf' : '#94a3b8' }}>
                      {item.day}
                    </span>

                    {item.status === 'complete' ? (
                      <CheckCircle2 size={16} style={{ color: '#2dd4bf' }} />
                    ) : item.status === 'partial' ? (
                      <AlertCircle size={16} style={{ color: '#f59e0b' }} />
                    ) : item.status === 'pending' ? (
                      <Clock size={16} style={{ color: '#38bdf8' }} />
                    ) : (
                      <Minus size={16} style={{ color: '#475569' }} />
                    )}

                    <span style={{ fontSize: '0.6rem', color: '#64748b' }}>{item.date_str}</span>
                  </div>
                ))}
              </div>
            </div>

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
              <span>Tracked with DawaiSathi v4.1</span>
              <span style={{ color: '#2dd4bf', fontWeight: 700 }}>{deployedUrl}</span>
            </div>
          </motion.div>
        )}

        {toastMsg && <Toast message={toastMsg} type="success" />}
      </div>
    </AppLayout>
  )
}
