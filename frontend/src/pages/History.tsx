import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { FileText, ArrowLeft, Trash2, Calendar, Pill, Plus, Eye, X, RefreshCw } from 'lucide-react'
import api, { getImageUrl } from '../api/client'
import AppLayout from '../components/AppLayout'
import FamilyPills from '../components/FamilyPills'
import Toast from '../components/Toast'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import type { User } from '../types'

interface MedicineItem {
  name: string
  dosage?: string
  schedule?: string[]
  days?: number | string
  instructions?: string
}

interface ScanRecord {
  id: number
  user_id: number
  family_id: number | null
  scan_image_url: string | null
  medicines: MedicineItem[]
  created_at: string
}

export default function History() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { lang } = useLanguage()

  const [activeMemberId, setActiveMemberId] = useState<number>(0)
  const [familyMembers, setFamilyMembers] = useState<User[]>([])
  const [scans, setScans] = useState<ScanRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [zoomImage, setZoomImage] = useState<string | null>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 3000)
  }

  useEffect(() => {
    if (!user?.id) return
    api.get('/family/members')
      .then((res: any) => setFamilyMembers(res.data.members || []))
      .catch(() => {})
  }, [user])

  const loadHistory = async (memberId?: number) => {
    setLoading(true)
    try {
      const url = memberId && memberId !== user?.id ? `/medicine/history?user_id=${memberId}` : '/medicine/history'
      const res: any = await api.get(url)
      setScans(res.data.scans || [])
    } catch (e) {
      if (import.meta.env.DEV) console.error('[History] fetch error:', e)
      showToast(lang === 'hi' ? 'इतिहास लोड करने में विफल' : 'Failed to load prescription history')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const targetId = activeMemberId || user?.id || 0
    if (targetId) {
      loadHistory(targetId)
    }
  }, [activeMemberId, user?.id])

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/medicine/history/${id}`)
      setScans((prev) => prev.filter((s) => s.id !== id))
      showToast(lang === 'hi' ? 'पर्चा रिकॉर्ड हटा दिया गया' : 'Prescription record deleted')
    } catch (e) {
      showToast(lang === 'hi' ? 'रिकॉर्ड हटाने में विफल' : 'Failed to delete record')
    }
  }

  const handleReAdd = (scan: ScanRecord) => {
    // Navigate to ScanApproval confirmation page pre-filled with extracted medicines
    navigate('/scan/approve', {
      state: {
        scanData: {
          extracted: { medicines: scan.medicines },
          scan_image_url: scan.scan_image_url || '',
        },
        capturedImage: scan.scan_image_url || '',
        targetMemberId: scan.user_id,
      },
    })
  }

  const currentMemberId = activeMemberId || user?.id || 0

  return (
    <AppLayout
      familyMembers={familyMembers}
      activeMemberId={currentMemberId}
      onSelectMember={(id) => setActiveMemberId(id)}
    >
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '16px 16px 100px' }}>
        {/* Top Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              onClick={() => navigate(-1)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
              }}
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                {lang === 'hi' ? 'पर्चा इतिहास (History)' : 'Prescription History'}
              </h2>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0 }}>
                {lang === 'hi' ? 'स्कैन किए गए पर्चे और कैबिनेट में जोड़ें' : 'Archived doctor scans & quick cabinet re-add'}
              </p>
            </div>
          </div>

          <button
            onClick={() => navigate('/scan')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'linear-gradient(135deg, var(--accent-teal) 0%, #0d9488 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 'var(--radius-full)',
              padding: '8px 14px',
              fontWeight: 700,
              fontSize: '0.82rem',
              cursor: 'pointer',
            }}
          >
            <Plus size={15} /> {lang === 'hi' ? 'नया पर्चा स्कैन' : 'Scan New'}
          </button>
        </div>

        {/* Family Member Switcher */}
        {familyMembers.length > 1 && (
          <div style={{ marginBottom: 16 }}>
            <FamilyPills
              members={familyMembers}
              activeMemberId={currentMemberId}
              onSelect={(id) => setActiveMemberId(id)}
              currentUserId={user?.id || 0}
            />
          </div>
        )}

        {/* Scan List */}
        {loading ? (
          <div className="loading-spinner-container">
            <div className="loading-spinner" />
          </div>
        ) : scans.length === 0 ? (
          <div style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--text-secondary)', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)' }}>
            <FileText size={40} style={{ margin: '0 auto 12px', color: 'var(--text-muted)', opacity: 0.6 }} />
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              {lang === 'hi' ? 'कोई संग्रह पर्चा नहीं' : 'No Archived Prescriptions'}
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 4, marginBottom: 16 }}>
              {lang === 'hi' ? 'आपके द्वारा स्कैन किए गए पर्चे यहां सुरक्षित रहेंगे।' : 'Scanned doctor prescriptions will be automatically archived here.'}
            </p>
            <button
              onClick={() => navigate('/scan')}
              style={{
                background: 'var(--bg-glass-card)',
                border: '1px solid var(--accent-teal)',
                color: 'var(--accent-teal)',
                fontWeight: 700,
                fontSize: '0.85rem',
                padding: '10px 18px',
                borderRadius: 'var(--radius-full)',
                cursor: 'pointer',
              }}
            >
              {lang === 'hi' ? 'पहला पर्चा स्कैन करें' : 'Scan Your First Prescription'}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {scans.map((scan) => (
              <motion.div
                key={scan.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '24px',
                  padding: '18px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)',
                }}
              >
                {/* Card Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 700 }}>
                    <Calendar size={15} style={{ color: 'var(--accent-teal)' }} />
                    {new Date(scan.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      • {new Date(scan.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <button
                    onClick={() => handleDelete(scan.id)}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
                    title="Delete record"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                {/* Content: Photo Thumbnail + Extracted Medicines List */}
                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  {scan.scan_image_url ? (
                    <div
                      onClick={() => setZoomImage(getImageUrl(scan.scan_image_url!))}
                      style={{
                        width: 80,
                        height: 80,
                        borderRadius: 16,
                        overflow: 'hidden',
                        position: 'relative',
                        cursor: 'pointer',
                        border: '1px solid var(--border-subtle)',
                        flexShrink: 0,
                      }}
                    >
                      <img
                        src={getImageUrl(scan.scan_image_url)}
                        alt="Prescription scan"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                        <Eye size={20} />
                      </div>
                    </div>
                  ) : (
                    <div style={{ width: 80, height: 80, borderRadius: 16, background: 'var(--bg-subtle)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', flexShrink: 0 }}>
                      <FileText size={28} />
                    </div>
                  )}

                  {/* Medicines Breakdown */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Pill size={15} style={{ color: 'var(--accent-teal)' }} />
                      {scan.medicines.length} {scan.medicines.length === 1 ? (lang === 'hi' ? 'दवा' : 'Medicine') : (lang === 'hi' ? 'दवाइयां' : 'Medicines')} Prescribed
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {scan.medicines.map((m: MedicineItem, idx: number) => (
                        <div
                          key={idx}
                          style={{
                            background: 'var(--bg-subtle)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: 12,
                            padding: '8px 10px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 3,
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                              {m.name} {m.dosage ? `(${m.dosage})` : ''}
                            </span>

                            {m.schedule && m.schedule.length > 0 && (
                              <div style={{ display: 'flex', gap: 4 }}>
                                {m.schedule.map((slot) => (
                                  <span
                                    key={slot}
                                    style={{
                                      fontSize: '0.62rem',
                                      fontWeight: 700,
                                      textTransform: 'capitalize',
                                      padding: '1px 6px',
                                      borderRadius: 8,
                                      background: 'rgba(45, 212, 191, 0.15)',
                                      color: 'var(--accent-teal)',
                                    }}
                                  >
                                    {slot}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          {m.instructions && (
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                              📝 {m.instructions}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Bottom Primary Action: Re-add via Confirmation Page */}
                <button
                  onClick={() => handleReAdd(scan)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    borderRadius: '16px',
                    background: 'linear-gradient(135deg, var(--accent-teal) 0%, #0d9488 100%)',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    boxShadow: '0 4px 12px rgba(13, 148, 136, 0.25)',
                  }}
                  className="hover:scale-[1.01] active:scale-[0.99] transition-transform"
                >
                  <RefreshCw size={16} /> {lang === 'hi' ? 'कैबिनेट में दोबारा जोड़ें (Review & Confirm)' : 'Re-add to Cabinet (Review & Confirm)'}
                </button>
              </motion.div>
            ))}
          </div>
        )}

        {/* Image Zoom Lightbox Modal */}
        <AnimatePresence>
          {zoomImage && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 120,
                background: 'rgba(0,0,0,0.88)',
                backdropFilter: 'blur(10px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 16,
              }}
              onClick={() => setZoomImage(null)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                style={{ position: 'relative', maxWidth: '100%', maxHeight: '90vh' }}
                onClick={(e) => e.stopPropagation()}
              >
                <img
                  src={zoomImage}
                  alt="Prescription zoomed"
                  style={{ maxWidth: '100%', maxHeight: '85vh', borderRadius: 16, objectFit: 'contain' }}
                />
                <button
                  onClick={() => setZoomImage(null)}
                  style={{
                    position: 'absolute',
                    top: -16,
                    right: -16,
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: '#1e293b',
                    border: '1px solid #475569',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <X size={18} />
                </button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {toastMsg && <Toast message={toastMsg} type="success" />}
      </div>
    </AppLayout>
  )
}
