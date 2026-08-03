import { useState, useEffect, useRef } from 'react'
import {
  ShieldAlert, PhoneCall, Printer, AlertTriangle, Pill,
  MapPin, Navigation, CheckCircle2, AlertCircle, Clock,
  Users, Wifi,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import Modal from './Modal'
import { useLanguage } from '../context/LanguageContext'
import api from '../api/client'
import type { User, MedicineEntry } from '../types'

interface EmergencyCardProps {
  open: boolean
  onClose: () => void
  user: User | null
  medicines?: MedicineEntry[]
}

type SOSState =
  | 'idle'
  | 'locating'        // Getting GPS
  | 'sending'         // Calling backend
  | 'sent'            // Success
  | 'sent_no_loc'     // Success but no GPS available
  | 'error'           // Backend error

interface SOSResult {
  telegram_sent: number
  push_sent: number
  recipients: string[]
  maps_url: string | null
}

export default function EmergencyCard({ open, onClose, user, medicines: initialMedicines = [] }: EmergencyCardProps) {
  const { lang } = useLanguage()
  const [activeMeds, setActiveMeds] = useState<MedicineEntry[]>(initialMedicines)
  const containerRef = useRef<HTMLDivElement>(null)

  const [emergencyContact, setEmergencyContact] = useState(() =>
    localStorage.getItem(`emergency_phone_${user?.id}`) || '+91 98765 43210'
  )
  const [bloodGroup, setBloodGroup] = useState(() =>
    localStorage.getItem(`emergency_blood_${user?.id}`) || 'O+'
  )
  const [allergies, setAllergies] = useState(() =>
    localStorage.getItem(`emergency_allergies_${user?.id}`) || 'Penicillin (Mild), Dust'
  )
  const [isEditing, setIsEditing] = useState(false)

  // SOS state
  const [sosState, setSOSState] = useState<SOSState>('idle')
  const [sosResult, setSOSResult] = useState<SOSResult | null>(null)
  const [sosError, setSOSError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setSOSState('idle')
      setSOSResult(null)
      setSOSError(null)
      if (containerRef.current) containerRef.current.scrollTop = 0
    }
  }, [open])

  useEffect(() => {
    if (!open || !user?.id) return
    const tzOffset = new Date().getTimezoneOffset()
    const localDate = new Date().toLocaleDateString('sv-SE')
    api.get(`/medicine/cabinet?user_id=${user.id}&tz_offset=${tzOffset}&local_date=${localDate}`)
      .then((res) => setActiveMeds(res.data?.medicines || []))
      .catch(() => {})
  }, [open, user?.id])

  const handleSaveInfo = () => {
    if (user?.id) {
      localStorage.setItem(`emergency_phone_${user.id}`, emergencyContact)
      localStorage.setItem(`emergency_blood_${user.id}`, bloodGroup)
      localStorage.setItem(`emergency_allergies_${user.id}`, allergies)
    }
    setIsEditing(false)
  }

  // ── SOS with live location ─────────────────────────────────────────────────
  const handleSOSAlert = () => {
    if (sosState === 'sent' || sosState === 'sending' || sosState === 'locating') return

    setSOSState('locating')
    setSOSResult(null)
    setSOSError(null)

    const sendSOS = (lat?: number, lng?: number, accuracy?: number) => {
      setSOSState('sending')
      api.post('/emergency/sos', {
        lat: lat ?? null,
        lng: lng ?? null,
        accuracy: accuracy ?? 0,
        blood_group: bloodGroup,
        allergies,
        emergency_contact: emergencyContact,
      })
        .then((res) => {
          setSOSResult(res.data)
          setSOSState(lat != null ? 'sent' : 'sent_no_loc')
        })
        .catch((e) => {
          const msg = e?.response?.data?.error || (lang === 'hi' ? 'SOS भेजने में विफलता' : 'Failed to send SOS alert')
          setSOSError(msg)
          setSOSState('error')
        })
    }

    if (!navigator.geolocation) {
      sendSOS()
      return
    }

    const locTimeout = setTimeout(() => {
      // GPS timed out — send without location
      sendSOS()
    }, 8000)

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(locTimeout)
        sendSOS(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy)
      },
      () => {
        clearTimeout(locTimeout)
        sendSOS()
      },
      { enableHighAccuracy: true, timeout: 7500, maximumAge: 0 }
    )
  }

  // ── 108 call + SOS trigger ────────────────────────────────────────────────
  const handle108Call = () => {
    // Trigger SOS alert in parallel with calling 108
    handleSOSAlert()
    // Dial 108
    window.location.href = 'tel:108'
  }

  if (!open) return null

  const sosIdle = sosState === 'idle'
  const sosLoading = sosState === 'locating' || sosState === 'sending'
  const sosDone = sosState === 'sent' || sosState === 'sent_no_loc'

  return (
    <Modal open={open} onClose={onClose} title="" variant="sheet">
      <div
        ref={containerRef}
        style={{
          maxWidth: 520,
          maxHeight: '72vh',
          overflowY: 'auto',
          margin: '0 auto',
          paddingRight: 4,
          color: 'var(--text-primary)',
          scrollBehavior: 'smooth',
        }}
      >

        {/* ── Header Card ────────────────────────────────────────────────── */}
        <div
          style={{
            background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
            borderRadius: 20,
            padding: '18px 18px 16px',
            color: '#ffffff',
            marginBottom: 14,
            boxShadow: '0 10px 25px rgba(220, 38, 38, 0.3)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Ambient glow blob */}
          <div style={{
            position: 'absolute', top: '-20%', right: '-10%',
            width: 160, height: 160,
            background: 'radial-gradient(circle, rgba(255,255,255,0.18) 0%, rgba(0,0,0,0) 70%)',
            pointerEvents: 'none',
          }} />

          {/* Header row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldAlert size={26} color="#ffffff" />
              <div>
                <span style={{ fontSize: '0.66rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 800, opacity: 0.9 }}>
                  DAWAISATHI EMERGENCY ID
                </span>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 900, margin: 0, color: '#ffffff' }}>
                  {user?.name || 'Patient Profile'}
                </h3>
              </div>
            </div>
            <span style={{
              fontSize: '0.76rem', fontWeight: 900, padding: '4px 10px',
              borderRadius: 12, background: 'rgba(255, 255, 255, 0.2)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
            }}>
              BLOOD {bloodGroup}
            </span>
          </div>

          {/* ── 108 Dial + SOS trigger button ── */}
          <button
            type="button"
            onClick={handle108Call}
            disabled={sosLoading}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              width: '100%', background: '#ffffff', color: '#dc2626',
              border: 'none', borderRadius: 14, padding: '13px',
              fontWeight: 900, fontSize: '0.95rem', cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)', marginBottom: 10,
              opacity: sosLoading ? 0.8 : 1,
              transition: 'opacity 0.2s ease',
            }}
          >
            <PhoneCall size={20} />
            {lang === 'hi' ? 'कॉल 108 — आपातकाल' : 'Call 108 Emergency'}
          </button>

          {/* ── Emergency contact dial ── */}
          <a
            href={`tel:${emergencyContact}`}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              width: '100%', background: 'rgba(255, 255, 255, 0.15)',
              color: '#ffffff', border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: 14, padding: '10px',
              fontWeight: 700, fontSize: '0.85rem', textDecoration: 'none',
            }}
          >
            <PhoneCall size={16} />
            {lang === 'hi' ? 'परिवार' : 'Family'}: {emergencyContact}
          </a>
        </div>

        {/* ── Live Location SOS Panel ───────────────────────────────────── */}
        <div style={{
          background: 'var(--bg-surface)',
          border: sosDone
            ? '1.5px solid rgba(16, 185, 129, 0.5)'
            : sosState === 'error'
            ? '1.5px solid rgba(239, 68, 68, 0.4)'
            : '1px solid var(--border-subtle)',
          borderRadius: 18,
          padding: '14px 16px',
          marginBottom: 14,
          transition: 'border-color 0.3s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Navigation size={16} color={sosDone ? '#10b981' : '#dc2626'} />
              <span style={{ fontWeight: 800, fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                {lang === 'hi' ? 'लाइव लोकेशन SOS अलर्ट' : 'Live Location SOS Alert'}
              </span>
            </div>
            {sosDone && (
              <span style={{
                fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.5px',
                color: '#10b981', background: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: 8, padding: '2px 8px',
              }}>
                {lang === 'hi' ? 'भेजा गया' : 'SENT'}
              </span>
            )}
          </div>

          <AnimatePresence mode="wait">
            {/* Idle state */}
            {sosIdle && (
              <motion.div
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <p style={{ margin: '0 0 12px', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  {lang === 'hi'
                    ? 'परिवार के सभी सदस्यों को आपकी लाइव लोकेशन + मेडिकल जानकारी Telegram और Push Notification से तुरंत मिलेगी।'
                    : 'Instantly alerts all family members with your live GPS location, blood group, and medicine info via Telegram & push notification.'}
                </p>
                <button
                  type="button"
                  onClick={handleSOSAlert}
                  style={{
                    width: '100%', padding: '12px',
                    borderRadius: 14,
                    background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
                    color: '#ffffff', border: 'none',
                    fontWeight: 800, fontSize: '0.9rem',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    boxShadow: '0 4px 16px rgba(220, 38, 38, 0.3)',
                  }}
                >
                  <MapPin size={18} />
                  {lang === 'hi' ? 'SOS — परिवार को लोकेशन भेजें' : 'SOS — Share Location to Family'}
                </button>
              </motion.div>
            )}

            {/* Loading state */}
            {sosLoading && (
              <motion.div
                key="loading"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '6px 0' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                    style={{ width: 20, height: 20 }}
                  >
                    {sosState === 'locating'
                      ? <Navigation size={20} color="#dc2626" />
                      : <Wifi size={20} color="#dc2626" />
                    }
                  </motion.div>
                  <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-primary)' }}>
                    {sosState === 'locating'
                      ? (lang === 'hi' ? 'लोकेशन पहचानी जा रही है…' : 'Getting your GPS location…')
                      : (lang === 'hi' ? 'परिवार को अलर्ट भेजा जा रहा है…' : 'Alerting family members…')
                    }
                  </span>
                </div>
                <div style={{ width: '100%', height: 3, borderRadius: 99, background: 'var(--bg-subtle)', overflow: 'hidden' }}>
                  <motion.div
                    animate={{ x: ['-100%', '200%'] }}
                    transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
                    style={{ width: '50%', height: '100%', borderRadius: 99, background: 'linear-gradient(90deg, #dc2626, #f87171)' }}
                  />
                </div>
              </motion.div>
            )}

            {/* Success state */}
            {sosDone && sosResult && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#10b981', fontWeight: 800, fontSize: '0.9rem' }}>
                  <CheckCircle2 size={20} />
                  {lang === 'hi' ? 'SOS भेजा गया!' : 'SOS Alert Sent!'}
                </div>

                {/* Recipients */}
                {sosResult.recipients.length > 0 && (
                  <div style={{
                    background: 'rgba(16, 185, 129, 0.08)',
                    border: '1px solid rgba(16, 185, 129, 0.2)',
                    borderRadius: 12, padding: '8px 12px',
                    fontSize: '0.78rem', color: 'var(--text-secondary)',
                    display: 'flex', alignItems: 'flex-start', gap: 6,
                  }}>
                    <Users size={14} style={{ flexShrink: 0, marginTop: 1, color: '#10b981' }} />
                    <span>
                      <strong style={{ color: '#10b981' }}>{sosResult.recipients.join(', ')}</strong>
                      {' '}{lang === 'hi' ? 'को सूचित किया गया' : 'have been notified'}
                      {' '}(Telegram: {sosResult.telegram_sent}, Push: {sosResult.push_sent})
                    </span>
                  </div>
                )}

                {sosResult.recipients.length === 0 && (
                  <div style={{
                    background: 'rgba(245, 158, 11, 0.08)',
                    border: '1px solid rgba(245, 158, 11, 0.25)',
                    borderRadius: 12, padding: '8px 12px',
                    fontSize: '0.78rem', color: '#b45309', fontWeight: 600,
                    display: 'flex', gap: 6, alignItems: 'flex-start',
                  }}>
                    <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>
                      {lang === 'hi'
                        ? 'परिवार में कोई Telegram/Push नहीं लिंक है। Settings में जाकर जोड़ें।'
                        : 'No family members have Telegram or push enabled. Add them in Settings.'}
                    </span>
                  </div>
                )}

                {/* Maps link */}
                {sosResult.maps_url && (
                  <a
                    href={sosResult.maps_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '9px 14px', borderRadius: 12,
                      background: 'var(--bg-subtle)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--accent-teal)', textDecoration: 'none',
                      fontWeight: 700, fontSize: '0.78rem',
                    }}
                  >
                    <MapPin size={14} />
                    {lang === 'hi' ? 'अपनी लाइव लोकेशन देखें (Google Maps)' : 'View Your Shared Location (Google Maps)'}
                  </a>
                )}

                {sosState === 'sent_no_loc' && (
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'flex', gap: 5, alignItems: 'center' }}>
                    <Clock size={12} />
                    {lang === 'hi' ? 'GPS उपलब्ध नहीं था — बिना लोकेशन के SOS भेजा गया।' : 'GPS unavailable — SOS sent without live location.'}
                  </div>
                )}

                {/* Resend */}
                <button
                  type="button"
                  onClick={() => { setSOSState('idle'); setSOSResult(null) }}
                  style={{
                    marginTop: 2, padding: '7px', borderRadius: 10,
                    background: 'none', border: '1px solid var(--border-subtle)',
                    color: 'var(--text-muted)', fontSize: '0.74rem',
                    fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  {lang === 'hi' ? 'दोबारा भेजें' : 'Send Again'}
                </button>
              </motion.div>
            )}

            {/* Error state */}
            {sosState === 'error' && (
              <motion.div
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#ef4444', fontWeight: 700, fontSize: '0.85rem' }}>
                  <AlertCircle size={16} />
                  {sosError || (lang === 'hi' ? 'SOS भेजने में त्रुटि' : 'SOS failed to send')}
                </div>
                <button
                  type="button"
                  onClick={() => { setSOSState('idle'); setSOSError(null) }}
                  style={{
                    padding: '8px', borderRadius: 10, background: 'var(--bg-subtle)',
                    border: '1px solid var(--border-subtle)', color: 'var(--accent-teal)',
                    fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  {lang === 'hi' ? 'फिर कोशिश करें' : 'Retry'}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Patient Details & Allergies ─────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 }}>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={15} color="#f59e0b" />
                {lang === 'hi' ? 'एलर्जी और चिकित्सा निर्देश' : 'Allergies & Medical Alerts'}
              </span>
              <button
                type="button"
                onClick={() => setIsEditing(!isEditing)}
                style={{ background: 'none', border: 'none', color: 'var(--accent-teal)', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer' }}
              >
                {isEditing ? (lang === 'hi' ? 'सहेजें' : 'Save') : (lang === 'hi' ? 'संपादित करें' : 'Edit Info')}
              </button>
            </div>

            {isEditing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div>
                  <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    {lang === 'hi' ? 'आपातकालीन फोन:' : 'Emergency Phone:'}
                  </label>
                  <input
                    type="text"
                    value={emergencyContact}
                    onChange={(e) => setEmergencyContact(e.target.value)}
                    style={{ width: '100%', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-subtle)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    {lang === 'hi' ? 'रक्त समूह:' : 'Blood Group:'}
                  </label>
                  <select
                    value={bloodGroup}
                    onChange={(e) => setBloodGroup(e.target.value)}
                    style={{
                      width: '100%', padding: '7px 10px', borderRadius: 8,
                      border: '1px solid var(--border-subtle)', background: 'var(--bg-subtle)',
                      color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 600,
                    }}
                  >
                    {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((bg) => (
                      <option key={bg} value={bg}>{bg}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    {lang === 'hi' ? 'ज्ञात एलर्जी:' : 'Known Allergies:'}
                  </label>
                  <input
                    type="text"
                    value={allergies}
                    onChange={(e) => setAllergies(e.target.value)}
                    style={{ width: '100%', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-subtle)', color: 'var(--text-primary)', boxSizing: 'border-box' }}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSaveInfo}
                  style={{ padding: '8px', borderRadius: 10, background: 'var(--accent-teal)', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer', marginTop: 4 }}
                >
                  {lang === 'hi' ? 'आपातकालीन विवरण सहेजें' : 'Save Emergency Details'}
                </button>
              </div>
            ) : (
              <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                {allergies}
              </div>
            )}
          </div>

          {/* Active Medicines */}
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 16, padding: '14px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <Pill size={15} color="var(--accent-teal)" />
              {lang === 'hi' ? 'वर्तमान सक्रिय दवाइयां' : 'Active Prescribed Medicines'} ({activeMeds.length})
            </span>

            {activeMeds.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {activeMeds.map((m) => (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 10, background: 'var(--bg-subtle)', fontSize: '0.82rem' }}>
                    <div>
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{m.name}</span>
                      {m.dosage && <span style={{ color: 'var(--text-secondary)', marginLeft: 6 }}>({m.dosage})</span>}
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {m.schedule?.map((s) => (
                        <span key={s} style={{ fontSize: '0.6rem', fontWeight: 700, padding: '1px 5px', borderRadius: 6, background: 'rgba(45,212,191,0.15)', color: 'var(--accent-teal)' }}>
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                {lang === 'hi' ? 'कोई सक्रिय दवाइयां नहीं' : 'No active cabinet medicines'}
              </p>
            )}
          </div>
        </div>

        {/* ── Bottom Actions ──────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={() => window.print()}
            style={{
              flex: 1, padding: '12px', borderRadius: 14,
              background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)', fontWeight: 700, fontSize: '0.85rem',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <Printer size={16} />
            {lang === 'hi' ? 'प्रिंट / सेव करें' : 'Print Emergency Card'}
          </button>
          <button
            type="button"
            className="bottom-sheet-cancel"
            onClick={onClose}
            style={{ flex: 1, margin: 0 }}
          >
            {lang === 'hi' ? 'बंद करें' : 'Close'}
          </button>
        </div>

      </div>
    </Modal>
  )
}
