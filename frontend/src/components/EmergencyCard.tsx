import { useState } from 'react'
import { ShieldAlert, PhoneCall, Printer, AlertTriangle, Pill } from 'lucide-react'
import Modal from './Modal'
import { useLanguage } from '../context/LanguageContext'
import type { User, MedicineEntry } from '../types'

interface EmergencyCardProps {
  open: boolean
  onClose: () => void
  user: User | null
  medicines: MedicineEntry[]
}

export default function EmergencyCard({ open, onClose, user, medicines }: EmergencyCardProps) {
  const { lang } = useLanguage()
  const [emergencyContact, setEmergencyContact] = useState(() => {
    return localStorage.getItem(`emergency_phone_${user?.id}`) || '+91 98765 43210'
  })
  const [bloodGroup, setBloodGroup] = useState(() => {
    return localStorage.getItem(`emergency_blood_${user?.id}`) || 'O+'
  })
  const [allergies, setAllergies] = useState(() => {
    return localStorage.getItem(`emergency_allergies_${user?.id}`) || 'Penicillin (Mild), Dust'
  })
  const [isEditing, setIsEditing] = useState(false)

  const handleSaveInfo = () => {
    if (user?.id) {
      localStorage.setItem(`emergency_phone_${user.id}`, emergencyContact)
      localStorage.setItem(`emergency_blood_${user.id}`, bloodGroup)
      localStorage.setItem(`emergency_allergies_${user.id}`, allergies)
    }
    setIsEditing(false)
  }

  const handlePrint = () => {
    window.print()
  }

  if (!open) return null

  return (
    <Modal open={open} onClose={onClose} title="" variant="sheet">
      <div style={{ maxWidth: 520, margin: '0 auto', color: 'var(--text-primary)' }}>
        {/* Top Emergency Card Shield Header */}
        <div
          style={{
            background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
            borderRadius: 20,
            padding: '20px 18px',
            color: '#ffffff',
            marginBottom: 16,
            boxShadow: '0 10px 25px rgba(220, 38, 38, 0.3)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: '-20%',
              right: '-10%',
              width: 160,
              height: 160,
              background: 'radial-gradient(circle, rgba(255,255,255,0.2) 0%, rgba(0,0,0,0) 70%)',
              pointerEvents: 'none',
            }}
          />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldAlert size={26} color="#ffffff" />
              <div>
                <span style={{ fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 800, opacity: 0.9 }}>
                  DAWAISATHI EMERGENCY ID
                </span>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 900, margin: 0, color: '#ffffff' }}>
                  {user?.name || 'Patient Profile'}
                </h3>
              </div>
            </div>

            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 900,
                padding: '4px 10px',
                borderRadius: 12,
                background: 'rgba(255, 255, 255, 0.2)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
              }}
            >
              BLOOD {bloodGroup}
            </span>
          </div>

          {/* 1-Tap Emergency Phone Dial Button */}
          <a
            href={`tel:${emergencyContact}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              width: '100%',
              background: '#ffffff',
              color: '#dc2626',
              border: 'none',
              borderRadius: 14,
              padding: '12px',
              fontWeight: 800,
              fontSize: '0.92rem',
              textDecoration: 'none',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              marginTop: 10,
            }}
          >
            <PhoneCall size={18} />
            {lang === 'hi' ? 'आपातकालीन कॉल (Call SOS)' : 'Call Emergency Contact'}: {emergencyContact}
          </a>
        </div>

        {/* Patient Details & Allergies */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
          <div
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 16,
              padding: '14px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={15} color="#f59e0b" />
                {lang === 'hi' ? 'एलर्जी और चिकित्सा निर्देश' : 'Allergies & Medical Alerts'}
              </span>
              <button
                type="button"
                onClick={() => setIsEditing(!isEditing)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-teal)',
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                }}
              >
                {isEditing ? (lang === 'hi' ? 'सहेजें' : 'Save') : (lang === 'hi' ? 'संपादित करें' : 'Edit Info')}
              </button>
            </div>

            {isEditing ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div>
                  <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Emergency Phone:</label>
                  <input
                    type="text"
                    value={emergencyContact}
                    onChange={(e) => setEmergencyContact(e.target.value)}
                    style={{ width: '100%', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-subtle)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Blood Group:</label>
                  <input
                    type="text"
                    value={bloodGroup}
                    onChange={(e) => setBloodGroup(e.target.value)}
                    style={{ width: '100%', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-subtle)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Known Allergies:</label>
                  <input
                    type="text"
                    value={allergies}
                    onChange={(e) => setAllergies(e.target.value)}
                    style={{ width: '100%', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border-subtle)', background: 'var(--bg-subtle)', color: 'var(--text-primary)' }}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSaveInfo}
                  style={{ padding: '8px', borderRadius: 10, background: 'var(--accent-teal)', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer', marginTop: 4 }}
                >
                  Save Emergency Details
                </button>
              </div>
            ) : (
              <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', fontWeight: 600 }}>
                {allergies}
              </div>
            )}
          </div>

          {/* Active Medicines Table */}
          <div
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 16,
              padding: '14px',
            }}
          >
            <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <Pill size={15} color="var(--accent-teal)" />
              {lang === 'hi' ? 'वर्तमान सक्रिय दवाइयां' : 'Active Prescribed Medicines'} ({medicines.length})
            </span>

            {medicines.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {medicines.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      borderRadius: 10,
                      background: 'var(--bg-subtle)',
                      fontSize: '0.82rem',
                    }}
                  >
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

        {/* Bottom Actions */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={handlePrint}
            style={{
              flex: 1,
              padding: '12px',
              borderRadius: 14,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <Printer size={16} /> {lang === 'hi' ? 'प्रिंट / सेव करें' : 'Print Emergency Card'}
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
