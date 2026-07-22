import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import AppLayout from '../components/AppLayout'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import SkeletonRow from '../components/SkeletonRow'
import api from '../api/client'
import type { User, JoinRequest } from '../types'
import Toast from '../components/Toast'
import EmptyState from '../components/EmptyState'
import { Users, Mail, Copy, Share2, RefreshCw, LogOut, Check, X, Bell, ShieldCheck, Pencil } from 'lucide-react'

export default function FamilySettings() {
  const { user, refreshUser, activeMemberId, setActiveMemberId } = useAuth()
  const [members, setMembers] = useState<User[]>([])
  const [requests, setRequests] = useState<JoinRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [familyData, setFamilyData] = useState<{ id: number; name: string; family_code: string } | null>(null)
  
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [leaveBusy, setLeaveBusy] = useState(false)
  const [regeneratingCode, setRegeneratingCode] = useState(false)
  
  // OTP box input state (6 digits)
  const [otp, setOtp] = useState<string[]>(['', '', '', '', '', ''])
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [requestedFamilyName, setRequestedFamilyName] = useState('')
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [processingReqId, setProcessingReqId] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)

  const otpRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ]

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const fetchFamilyData = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true)
    try {
      const [membersRes, inboxRes] = await Promise.all([
        api.get('/family/members'),
        api.get('/family/inbox'),
      ])
      setMembers(membersRes.data.members || [])
      setFamilyData(membersRes.data.family || null)
      setRequests(inboxRes.data.requests || [])
    } catch (e) {
      if (import.meta.env.DEV) console.error('[Family] fetch error:', e)
      showToast('Failed to load family data', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchFamilyData()
  }, [user, fetchFamilyData])

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search)
    const code = searchParams.get('join_code') || searchParams.get('code')
    if (code && code.length === 6 && /^\d+$/.test(code)) {
      setOtp(code.split(''))
      setShowJoinModal(true)
      showToast('1-Tap invite link loaded! Confirm below to join.')
    }
  }, [])

  const [editingFamilyName, setEditingFamilyName] = useState(false)
  const [newFamilyName, setNewFamilyName] = useState('')

  const handleUpdateFamilyName = async () => {
    if (!newFamilyName.trim()) return
    try {
      await api.put('/family/update_name', { name: newFamilyName.trim() })
      if (familyData) setFamilyData({ ...familyData, name: newFamilyName.trim() })
      setEditingFamilyName(false)
      showToast('✓ Family group name updated!', 'success')
    } catch {
      showToast('Failed to update family name', 'error')
    }
  }

  const handleAccept = async (reqId: number) => {
    setProcessingReqId(reqId)
    try {
      await api.post('/family/respond', { request_id: reqId, action: 'accept' })
      showToast('Request accepted', 'success')
      fetchFamilyData({ silent: true })
    } catch {
      showToast('Failed to accept request', 'error')
    } finally {
      setProcessingReqId(null)
    }
  }

  const handleReject = async (reqId: number) => {
    setProcessingReqId(reqId)
    try {
      await api.post('/family/respond', { request_id: reqId, action: 'reject' })
      showToast('Request rejected', 'success')
      fetchFamilyData({ silent: true })
    } catch {
      showToast('Failed to reject request', 'error')
    } finally {
      setProcessingReqId(null)
    }
  }

  const handleOtpChange = (val: string, idx: number) => {
    // Only allow digits
    const clean = val.replace(/[^0-9]/g, '')
    if (!clean) {
      const nextOtp = [...otp]
      nextOtp[idx] = ''
      setOtp(nextOtp)
      return
    }

    const lastChar = clean[clean.length - 1]
    const nextOtp = [...otp]
    nextOtp[idx] = lastChar
    setOtp(nextOtp)

    // Focus next box if exists
    if (idx < 5) {
      otpRefs[idx + 1].current?.focus()
    }
  }

  const handleOtpKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, idx: number) => {
    if (e.key === 'Backspace') {
      if (!otp[idx] && idx > 0) {
        const nextOtp = [...otp]
        nextOtp[idx - 1] = ''
        setOtp(nextOtp)
        otpRefs[idx - 1].current?.focus()
      } else {
        const nextOtp = [...otp]
        nextOtp[idx] = ''
        setOtp(nextOtp)
      }
    }
  }

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData('text').trim().replace(/[^0-9]/g, '')
    if (pastedData.length === 6) {
      const digits = pastedData.split('')
      setOtp(digits)
      otpRefs[5].current?.focus()
    }
  }

  const handleJoinFamily = async () => {
    const codeStr = otp.join('')
    if (codeStr.length !== 6) {
      setErrorMsg('Please enter all 6 digits')
      setStatus('error')
      return
    }

    setStatus('loading')
    setErrorMsg('')
    try {
      const res = await api.post('/family/join-by-code', { code: codeStr })
      if (res.data.code === 'ALREADY_PENDING') {
        setRequestedFamilyName(res.data.family_name || 'your family')
        setStatus('success')
      } else {
        setRequestedFamilyName(res.data.family_name || 'your family')
        setStatus('success')
        showToast('Join request sent successfully!', 'success')
      }
      // Trigger a soft refresh of current page to show request waiting state if applicable
      await refreshUser()
      await fetchFamilyData({ silent: true })
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Failed to join family. Please check the code.')
      setStatus('error')
    }
  }

  const handleRegenerateCode = async () => {
    setRegeneratingCode(true)
    try {
      const res = await api.post('/family/regenerate-code')
      if (res.data.family_code) {
        setFamilyData((prev) => prev ? { ...prev, family_code: res.data.family_code } : null)
        showToast('Invite code rotated successfully!', 'success')
      }
    } catch (err: any) {
      showToast('Failed to regenerate code', 'error')
    } finally {
      setRegeneratingCode(false)
    }
  }

  const handleLeaveFamily = async () => {
    setLeaveBusy(true)
    try {
      await api.post('/family/leave')
      await refreshUser()
      setMembers([])
      setFamilyData(null)
      setShowLeaveConfirm(false)
      showToast('You left the family', 'success')
      // Refresh to fetch auto-created new solo family
      fetchFamilyData()
    } catch (e) {
      if (import.meta.env.DEV) console.error('[Family] leave error:', e)
      showToast('Failed to leave family', 'error')
    } finally {
      setLeaveBusy(false)
    }
  }

  const handleNudge = async (targetId: number, targetName: string) => {
    try {
      await api.post('/family/nudge', { target_user_id: targetId })
      showToast(`✓ Gentle dose reminder sent to ${targetName}!`, 'success')
    } catch {
      showToast('Failed to send reminder', 'error')
    }
  }

  const copyCode = () => {
    if (!familyData?.family_code) return
    navigator.clipboard.writeText(familyData.family_code).then(() => {
      setCopied(true)
      showToast('Code copied to clipboard!')
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {
      showToast('Failed to copy code', 'error')
    })
  }

  const shareWhatsApp = () => {
    if (!familyData?.family_code) return
    const joinLink = `${window.location.origin}/home?join_code=${familyData.family_code}`
    const text = encodeURIComponent(
      `Join my family group on DawaiSathi v4.1! 💊\n\nClick this 1-tap link to join directly:\n${joinLink}\n\nOr enter code in app: *${familyData.family_code}*`
    )
    window.open(`https://wa.me/?text=${text}`, '_blank')
  }

  const handleSelectMember = (id: number) => {
    setActiveMemberId(id)
  }

  const inFamily = !!user?.family_id
  const isSolo = members.length <= 1
  const isGuest = user?.email?.endsWith('@dawaisathi.com') || (user as any)?.google_id?.startsWith('guest_')

  // Render the Invite Code Card component used in multiple states
  const renderInviteCard = () => {
    if (!familyData) return null
    return (
      <div 
        style={{
          background: 'rgba(255, 255, 255, 0.45)',
          backdropFilter: 'blur(16px) saturate(120%)',
          WebkitBackdropFilter: 'blur(16px) saturate(120%)',
          border: '1px solid rgba(13, 148, 136, 0.15)',
          borderRadius: 'var(--radius-lg)',
          padding: 24,
          textAlign: 'center',
          boxShadow: '0 8px 32px 0 rgba(13, 148, 136, 0.04), inset 0 1px 2px rgba(255, 255, 255, 0.8)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <span 
          style={{ 
            fontSize: 'var(--text-xs)', 
            fontWeight: 600, 
            color: 'var(--accent-teal)', 
            textTransform: 'uppercase', 
            letterSpacing: '0.08em',
            display: 'block',
            marginBottom: 8
          }}
        >
          Family Invite Code
        </span>
        <div 
          onClick={copyCode}
          style={{ 
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            background: 'var(--bg-secondary)',
            border: '2.5px dashed var(--accent-teal)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 28px',
            margin: '8px 0 16px',
            cursor: 'pointer',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
            boxShadow: 'var(--shadow-sm)'
          }}
          className="hover:scale-105"
        >
          <span 
            style={{ 
              fontFamily: 'Space Grotesk, sans-serif', 
              fontSize: '2rem', 
              fontWeight: 700, 
              letterSpacing: '0.15em',
              color: 'var(--text-primary)',
              marginLeft: '0.15em'
            }}
          >
            {familyData.family_code}
          </span>
        </div>

        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', marginBottom: 20, lineHeight: 1.5 }}>
          Share this code with your family members. Once they request to join, you can approve them here.
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button
            type="button"
            className="btn-primary"
            onClick={copyCode}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', flex: 1, justifyContent: 'center' }}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            type="button"
            className="btn-ghost"
            onClick={shareWhatsApp}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 8, 
              padding: '10px 18px', 
              flex: 1, 
              justifyContent: 'center',
              backgroundColor: '#25D366',
              color: 'white',
              border: 'none'
            }}
          >
            <Share2 size={16} />
            WhatsApp
          </button>
        </div>

        <button
          type="button"
          onClick={handleRegenerateCode}
          disabled={regeneratingCode}
          style={{
            marginTop: 16,
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: '0.72rem',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            textDecoration: 'underline'
          }}
        >
          <RefreshCw size={12} className={regeneratingCode ? 'animate-spin' : ''} />
          Regenerate Invite Code
        </button>
      </div>
    )
  }

  return (
    <>
      <AppLayout
        familyMembers={inFamily ? members : []}
        activeMemberId={activeMemberId}
        onSelectMember={handleSelectMember}
      >
        {loading ? (
          <div className="page-body" aria-busy="true" aria-label="Loading family">
            <div style={{ padding: '16px 16px 8px' }}>
              <p className="section-label">Family group</p>
            </div>
            <SkeletonRow avatar count={3} />
          </div>
        ) : isGuest ? (
          <div className="page-body" style={{ display: 'flex', flexDirection: 'column' }}>
            <EmptyState
              icon={<Users size={36} color="var(--text-muted)" />}
              title="Family sharing is disabled for guest mode"
              description="To link cabinets, track medicine adherence together, and coordinate notifications, please sign in with your Google account."
              action={
                <a
                  href={`${api.defaults.baseURL}/auth/google`}
                  className="btn-primary"
                  style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  Sign in with Google
                </a>
              }
            />
          </div>
        ) : !inFamily ? (
          /* Fallback view: if auto-create failed or user has no family_id */
          <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 16 }}>
            <EmptyState
              icon={<Users size={32} color="var(--text-muted)" />}
              title="You are not in a family yet"
              description="Create a family code to invite members or enter an existing family code to join."
              action={
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => {
                      setOtp(['', '', '', '', '', ''])
                      setStatus('idle')
                      setErrorMsg('')
                      setShowJoinModal(true)
                    }}
                  >
                    Join with a code
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={async () => {
                      try {
                        setLoading(true)
                        await api.post('/family/create')
                        await refreshUser()
                        await fetchFamilyData()
                      } catch {
                        showToast('Failed to create family', 'error')
                      } finally {
                        setLoading(false)
                      }
                    }}
                  >
                    Create personal family
                  </button>
                </div>
              }
            />
          </div>
        ) : isSolo ? (
          /* Solo State: user has family but they are the only member */
          <div className="page-body" style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: 16 }}>
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <div 
                style={{ 
                  width: 56, 
                  height: 56, 
                  borderRadius: '50%', 
                  background: 'var(--accent-teal-glow)', 
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  marginBottom: 12 
                }}
              >
                <Users size={28} color="var(--accent-teal)" />
              </div>
              {editingFamilyName ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', marginBottom: 8 }}>
                  <input
                    type="text"
                    value={newFamilyName}
                    onChange={(e) => setNewFamilyName(e.target.value)}
                    placeholder="Enter family name"
                    style={{
                      background: 'var(--bg-glass)',
                      border: '1px solid var(--accent-teal)',
                      color: 'var(--text-primary)',
                      padding: '6px 12px',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.95rem',
                      fontWeight: 600,
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleUpdateFamilyName}
                    style={{
                      background: 'var(--accent-teal)',
                      color: '#fff',
                      border: 'none',
                      padding: '6px 12px',
                      borderRadius: 'var(--radius-md)',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                    }}
                  >
                    Save
                  </button>
                </div>
              ) : (
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <span>{familyData?.name || 'Your Family Group'}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setNewFamilyName(familyData?.name || '')
                      setEditingFamilyName(true)
                    }}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2 }}
                    title="Edit family name"
                  >
                    <Pencil size={14} />
                  </button>
                </h2>
              )}
              <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', lineHeight: 1.6, maxWidth: 300, margin: '0 auto' }}>
                Your medicine cabinet is ready! Add family members to view each other's schedules and logs.
              </p>
            </div>

            {renderInviteCard()}

            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 16 }}>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setOtp(['', '', '', '', '', ''])
                  setStatus('idle')
                  setErrorMsg('')
                  setShowJoinModal(true)
                }}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                Join an existing family
              </button>
            </div>
          </div>
        ) : (
          /* Multi-Member State */
          <div className="page-body">
            {requests.length > 0 && (
              <div style={{ padding: '16px 16px 8px', borderBottom: '1px solid var(--border-subtle)' }}>
                <h2 
                  style={{ 
                    color: 'var(--accent-teal)', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 6, 
                    marginBottom: 12,
                    fontSize: 'var(--text-sm)',
                    fontWeight: 600
                  }}
                >
                  <Mail size={16} /> Pending Approval ({requests.length})
                </h2>
                {requests.map((req) => (
                  <div key={req.id} className="family-member-card" style={{ marginBottom: 12, padding: 12, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ flex: 1 }}>
                      <div className="member-name" style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                        {req.requester?.name || req.requester?.email || 'Unknown User'}
                      </div>
                      <div className="member-email" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                        {req.requester?.email || ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => handleAccept(req.id)}
                        disabled={processingReqId === req.id}
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          border: 'none',
                          background: '#dcfce7',
                          color: '#15803d',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                        aria-label="Accept"
                      >
                        {processingReqId === req.id ? (
                          <span className="loading-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                        ) : (
                          <Check size={16} />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReject(req.id)}
                        disabled={processingReqId === req.id}
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: '50%',
                          border: 'none',
                          background: '#fee2e2',
                          color: '#b91c1c',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                        aria-label="Reject"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ padding: '20px 16px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 className="section-label" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Family Members ({members.length})
              </h2>
              <button
                type="button"
                onClick={() => setShowInviteModal(true)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-teal)',
                  fontWeight: 600,
                  fontSize: 'var(--text-sm)',
                  cursor: 'pointer',
                  padding: 0
                }}
              >
                + Invite member
              </button>
            </div>

            <div style={{ padding: '0 16px' }}>
              {members.map((member) => (
                <div key={member.id} className="family-member-card" style={{ padding: '12px 0', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 12 }}>
                  {member.avatar_url ? (
                    <img
                      src={member.avatar_url}
                      alt=""
                      className="member-avatar"
                      referrerPolicy="no-referrer"
                      width={40}
                      height={40}
                      style={{ borderRadius: '50%', border: '1px solid var(--border-subtle)' }}
                    />
                  ) : (
                    <div 
                      style={{ 
                        width: 40, 
                        height: 40, 
                        borderRadius: '50%', 
                        background: 'var(--accent-teal-glow)', 
                        color: 'var(--accent-teal)',
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        fontWeight: 600,
                        fontSize: '1rem'
                      }}
                    >
                      {member.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {member.name}
                      {member.id === user?.id && (
                        <span style={{ fontSize: '0.65rem', background: 'var(--accent-teal-glow)', color: 'var(--accent-teal)', padding: '2px 6px', borderRadius: 4, fontWeight: 500 }}>
                          You
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{member.email}</div>
                  </div>

                  {member.id !== user?.id && (
                    <button
                      type="button"
                      onClick={() => handleNudge(member.id, member.name)}
                      style={{
                        background: 'rgba(45, 212, 191, 0.1)',
                        border: '1px solid rgba(45, 212, 191, 0.25)',
                        color: 'var(--accent-teal)',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        padding: '6px 12px',
                        borderRadius: 'var(--radius-full)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Bell size={13} /> Remind
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Emergency & Doctor Contact Card */}
            <div style={{ margin: '20px 16px 0', padding: 16, background: 'var(--bg-glass-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ShieldCheck size={16} style={{ color: 'var(--accent-teal)' }} /> Family Emergency & Caregiver Helpline
                </div>
              </div>
              <p style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                Instant 1-tap emergency dial for family care coordinators and medical assistance.
              </p>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <a
                  href="tel:108"
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-lg, 12px)',
                    background: 'rgba(239, 68, 68, 0.12)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    color: '#f87171',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    textDecoration: 'none',
                    textAlign: 'center',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  🚑 Call 108 Emergency
                </a>
              </div>
            </div>

            <div style={{ padding: '32px 16px' }}>
              <button
                type="button"
                className="leave-link"
                onClick={() => setShowLeaveConfirm(true)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  color: '#dc2626',
                  background: 'none',
                  border: '1px solid rgba(220, 38, 38, 0.2)',
                  padding: '12px',
                  borderRadius: 'var(--radius-md)',
                  fontWeight: 600,
                  fontSize: 'var(--text-sm)',
                  cursor: 'pointer'
                }}
              >
                <LogOut size={16} />
                Leave Family Group
              </button>
            </div>
          </div>
        )}
      </AppLayout>

      {/* Join Family Modal (OTP Code) */}
      <Modal
        open={showJoinModal}
        onClose={() => {
          setShowJoinModal(false)
          setStatus('idle')
          setErrorMsg('')
        }}
        title="Join a Family"
        titleId="join-family-title"
        variant="sheet"
      >
        {status === 'success' ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div 
              style={{ 
                width: 48, 
                height: 48, 
                borderRadius: '50%', 
                backgroundColor: '#dcfce7', 
                color: '#16a34a', 
                display: 'inline-flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                marginBottom: 16
              }}
            >
              <Check size={24} />
            </div>
            <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
              Request Sent Successfully!
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', lineHeight: 1.6, marginBottom: 24 }}>
              Your join request has been sent to <strong>{requestedFamilyName}</strong>. 
              Please ask a family member in that group to open DawaiSathi and accept your request in their Family tab.
            </p>
            <button
              type="button"
              className="btn-primary"
              onClick={() => setShowJoinModal(false)}
              style={{ width: '100%' }}
            >
              Got it
            </button>
          </div>
        ) : (
          <>
            <p className="modal-subtitle" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 20 }}>
              Enter the 6-digit invite code shared by your family member.
            </p>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', margin: '24px 0 16px' }}>
              {otp.map((digit, idx) => (
                <input
                  key={idx}
                  ref={otpRefs[idx]}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(e.target.value, idx)}
                  onKeyDown={(e) => handleOtpKeyDown(e, idx)}
                  onPaste={handleOtpPaste}
                  style={{
                    width: 40,
                    height: 50,
                    fontSize: '1.5rem',
                    fontWeight: 'bold',
                    textAlign: 'center',
                    borderRadius: 8,
                    border: '2px solid var(--border-subtle)',
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    outline: 'none',
                    transition: 'border-color 0.15s ease'
                  }}
                  onFocus={(e) => { e.target.style.borderColor = 'var(--accent-teal)' }}
                  onBlur={(e) => { e.target.style.borderColor = 'var(--border-subtle)' }}
                />
              ))}
            </div>

            {status === 'error' && (
              <p className="field-error" role="alert" style={{ color: '#dc2626', fontSize: 'var(--text-xs)', textAlign: 'center', marginBottom: 16 }}>
                {errorMsg}
              </p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
              <button
                type="button"
                className="btn-primary"
                onClick={handleJoinFamily}
                disabled={status === 'loading' || otp.join('').length !== 6}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                {status === 'loading' ? (
                  <span className="loading-spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                ) : (
                  'Send join request'
                )}
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setShowJoinModal(false)
                  setStatus('idle')
                  setErrorMsg('')
                }}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* Invite Modal for Multi-member Family */}
      <Modal
        open={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        title="Invite Family Members"
        titleId="invite-family-title"
        variant="sheet"
      >
        <div style={{ padding: '8px 0' }}>
          {renderInviteCard()}
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setShowInviteModal(false)}
            style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}
          >
            Close
          </button>
        </div>
      </Modal>

      {/* Leave Family Confirmation */}
      <ConfirmDialog
        open={showLeaveConfirm}
        onClose={() => !leaveBusy && setShowLeaveConfirm(false)}
        onConfirm={handleLeaveFamily}
        title="Leave this family group?"
        description="You will lose access to the shared family cabinet. Your personal medicines will remain in your profile, but a new solo family will be generated for you."
        confirmLabel="Leave family"
        cancelLabel="Stay"
        destructive
        busy={leaveBusy}
        titleId="leave-family-title"
      />

      {toast && <Toast message={toast.msg} type={toast.type} />}
    </>
  )
}
