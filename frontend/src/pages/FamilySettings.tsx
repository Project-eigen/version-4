import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import AppLayout from '../components/AppLayout'
import Modal from '../components/Modal'
import ConfirmDialog from '../components/ConfirmDialog'
import SkeletonRow from '../components/SkeletonRow'
import api from '../api/client'
import type { User, JoinRequest } from '../types'
import Toast from '../components/Toast'
import EmptyState from '../components/EmptyState'
import { Users, UserPlus, Mail } from 'lucide-react'

export default function FamilySettings() {
  const { user, refreshUser, activeMemberId, setActiveMemberId } = useAuth()
  const [members, setMembers] = useState<User[]>([])
  const [requests, setRequests] = useState<JoinRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const [leaveBusy, setLeaveBusy] = useState(false)
  const [joinEmail, setJoinEmail] = useState('')
  const [familyName, setFamilyName] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'waiting' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [hasPendingRequest, setHasPendingRequest] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [processingReqId, setProcessingReqId] = useState<number | null>(null)

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
      setRequests(inboxRes.data.requests || [])
    } catch (e) {
      if (import.meta.env.DEV) console.error('[Family] fetch error:', e)
      showToast('Failed to load family data', 'error')
    } finally {
      setLoading(false)
    }
  }, [])

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

  useEffect(() => {
    fetchFamilyData()
  }, [user, fetchFamilyData])

  const handleJoinFamily = async () => {
    if (!joinEmail.trim()) return
    setStatus('loading')
    setErrorMsg('')
    try {
      await api.post('/family/join-request', { email: joinEmail.trim() })
      setHasPendingRequest(true)
      setStatus('waiting')
      setShowJoinModal(false)
      setJoinEmail('')
      showToast('Join request sent', 'success')
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Something went wrong')
      setStatus('error')
    }
  }

  const handleCreateFamily = async () => {
    if (!familyName.trim()) return
    setStatus('loading')
    setErrorMsg('')
    try {
      await api.post('/family/create', { name: familyName.trim() })
      await refreshUser()
      await fetchFamilyData()
      setShowCreateModal(false)
      setFamilyName('')
      showToast('Family created', 'success')
      setStatus('idle')
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Something went wrong')
      setStatus('error')
    }
  }

  const handleLeaveFamily = async () => {
    setLeaveBusy(true)
    try {
      await api.post('/family/leave')
      await refreshUser()
      setMembers([])
      setShowLeaveConfirm(false)
      showToast('You left the family', 'success')
    } catch (e) {
      if (import.meta.env.DEV) console.error('[Family] leave error:', e)
      showToast('Failed to leave family', 'error')
    } finally {
      setLeaveBusy(false)
    }
  }

  const handleSelectMember = (id: number) => {
    setActiveMemberId(id)
  }

  const inFamily = !!user?.family_id
  const myMembers = inFamily ? members : []

  return (
    <>
      <AppLayout
        familyMembers={myMembers}
        activeMemberId={activeMemberId}
        onSelectMember={handleSelectMember}
      >
        {loading ? (
          <div className="page-body" aria-busy="true" aria-label="Loading family">
            <div style={{ padding: '16px 16px 8px' }}>
              <p className="section-label">Family members</p>
            </div>
            <SkeletonRow avatar count={3} />
          </div>
        ) : !inFamily ? (
          <div className="page-body" style={{ display: 'flex', flexDirection: 'column' }}>
            {hasPendingRequest ? (
              <div className="waiting-card">
                <div style={{ marginBottom: 16 }}>
                  <span className="pulse-dot" aria-hidden="true" />
                </div>
                <h3 style={{ color: 'var(--accent-teal)', fontWeight: 700, marginBottom: 8 }}>
                  Request sent
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.6 }}>
                  Waiting for a family member to accept. You will be added once someone approves.
                </p>
                <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <Mail size={16} color="var(--text-muted)" aria-hidden="true" />
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                    Check back here for updates
                  </span>
                </div>
              </div>
            ) : (
              <EmptyState
                icon={<Users size={32} color="var(--text-muted)" />}
                title="You are not in a family yet"
                description="Join an existing family or create a new one to track medicines together."
                action={
                  <>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => {
                        setErrorMsg('')
                        setStatus('idle')
                        setShowJoinModal(true)
                      }}
                      id="join-family-btn"
                    >
                      <UserPlus size={18} aria-hidden="true" />
                      Join a family
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => {
                        setErrorMsg('')
                        setStatus('idle')
                        setShowCreateModal(true)
                      }}
                      id="create-family-btn"
                    >
                      Create a new family
                    </button>
                  </>
                }
              />
            )}
          </div>
        ) : (
          <div className="page-body">
            {requests.length > 0 && (
              <div className="section-pad">
                <h2 className="section-label" style={{ color: 'var(--accent-teal)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                  <Mail size={14} aria-hidden="true" /> Pending approval ({requests.length})
                </h2>
                {requests.map((req) => (
                  <div key={req.id} className="family-member-card" style={{ marginBottom: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div className="member-name">
                        {req.requester?.name || req.requester?.email || 'Unknown'}
                      </div>
                      <div className="member-email">{req.requester?.email || ''}</div>
                    </div>
                    <div className="req-actions">
                      <button
                        type="button"
                        className="req-btn req-btn-accept"
                        onClick={() => handleAccept(req.id)}
                        disabled={processingReqId === req.id}
                        aria-label={`Accept ${req.requester?.name || 'request'}`}
                      >
                        {processingReqId === req.id ? (
                          <span className="loading-spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
                        ) : (
                          '✓'
                        )}
                      </button>
                      <button
                        type="button"
                        className="req-btn req-btn-reject"
                        onClick={() => handleReject(req.id)}
                        disabled={processingReqId === req.id}
                        aria-label={`Reject ${req.requester?.name || 'request'}`}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="section-pad">
              <h2 className="section-label">Family members</h2>
            </div>
            {members.map((member) => (
              <div key={member.id} className="family-member-card">
                {member.avatar_url ? (
                  <img
                    src={member.avatar_url}
                    alt=""
                    className="member-avatar"
                    referrerPolicy="no-referrer"
                    width={48}
                    height={48}
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="member-avatar-placeholder" aria-hidden="true">
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  <div className="member-name">
                    {member.name}
                    {member.id === user?.id && <span className="you-badge">You</span>}
                  </div>
                  <div className="member-email">{member.email}</div>
                </div>
              </div>
            ))}

            <div className="section-pad">
              <button
                type="button"
                className="btn-ghost leave-link"
                onClick={() => setShowLeaveConfirm(true)}
                id="leave-family-btn"
              >
                Leave family
              </button>
            </div>
          </div>
        )}
      </AppLayout>

      <Modal
        open={showJoinModal}
        onClose={() => {
          setShowJoinModal(false)
          setStatus('idle')
          setErrorMsg('')
        }}
        title="Join a family"
        titleId="join-family-title"
        variant="sheet"
      >
        <p className="modal-subtitle">
          Enter the email of any existing family member. They will receive a request to approve you.
        </p>
        <label className="field-label-block" htmlFor="join-email-input">
          Member email
        </label>
        <input
          id="join-email-input"
          type="email"
          className="text-input"
          placeholder="family.member@example.com"
          value={joinEmail}
          onChange={(e) => setJoinEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleJoinFamily()}
          autoComplete="email"
          aria-invalid={status === 'error'}
          aria-describedby={status === 'error' ? 'join-email-error' : undefined}
          data-autofocus
        />
        {status === 'error' && (
          <p id="join-email-error" className="field-error" role="alert">
            {errorMsg}
          </p>
        )}
        <button
          type="button"
          className="btn-primary"
          onClick={handleJoinFamily}
          disabled={status === 'loading' || !joinEmail.trim()}
          id="send-join-request-btn"
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
        >
          Cancel
        </button>
      </Modal>

      <Modal
        open={showCreateModal}
        onClose={() => {
          setShowCreateModal(false)
          setStatus('idle')
          setErrorMsg('')
        }}
        title="Create a family"
        titleId="create-family-title"
        variant="sheet"
      >
        <p className="modal-subtitle">
          Give your family group a name. Others can join using your email address.
        </p>
        <label className="field-label-block" htmlFor="family-name-input">
          Family name
        </label>
        <input
          id="family-name-input"
          type="text"
          className="text-input"
          placeholder="e.g. The Sharma Family"
          value={familyName}
          onChange={(e) => setFamilyName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreateFamily()}
          aria-invalid={status === 'error'}
          aria-describedby={status === 'error' ? 'family-name-error' : undefined}
          data-autofocus
        />
        {status === 'error' && (
          <p id="family-name-error" className="field-error" role="alert">
            {errorMsg}
          </p>
        )}
        <button
          type="button"
          className="btn-primary"
          onClick={handleCreateFamily}
          disabled={status === 'loading' || !familyName.trim()}
          id="create-family-submit-btn"
        >
          {status === 'loading' ? (
            <span className="loading-spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
          ) : (
            'Create family'
          )}
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            setShowCreateModal(false)
            setStatus('idle')
            setErrorMsg('')
          }}
        >
          Cancel
        </button>
      </Modal>

      <ConfirmDialog
        open={showLeaveConfirm}
        onClose={() => !leaveBusy && setShowLeaveConfirm(false)}
        onConfirm={handleLeaveFamily}
        title="Leave this family?"
        description="You will lose access to the shared family group. Your personal medicines stay on your account. This cannot be undone from here."
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
