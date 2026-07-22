import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import AppLayout from '../components/AppLayout'
import ConfirmDialog from '../components/ConfirmDialog'
import SkeletonRow from '../components/SkeletonRow'
import Toast from '../components/Toast'
import EmptyState from '../components/EmptyState'
import EditMedicineModal from '../components/EditMedicineModal'
import MedicineInfoModal from '../components/MedicineInfoModal'
import InteractionCheckerCard from '../components/InteractionCheckerCard'
import api, { getImageUrl } from '../api/client'
import type { User, MedicineEntry, TimeSlot } from '../types'
import { Pill, Archive, X, Trash2, Pencil, Clock, Sun, Sunrise, Sunset, Moon, Flame, ChevronRight, Info } from 'lucide-react'

const TIME_SLOTS: { key: TimeSlot; label: string; time: string }[] = [
  { key: 'morning', label: 'Morning', time: '8:00 AM' },
  { key: 'afternoon', label: 'Afternoon', time: '1:00 PM' },
  { key: 'evening', label: 'Evening', time: '6:00 PM' },
  { key: 'night', label: 'Night', time: '10:00 PM' },
]

// Default slot times in 24h "HH:MM" format — mirrors backend defaults
const DEFAULT_SLOT_TIMES: Record<TimeSlot, string> = {
  morning: '08:00',
  afternoon: '13:00',
  evening: '18:00',
  night: '22:00',
}

// Minutes before the scheduled slot time when logging becomes available
const LOGGING_WINDOW_MINUTES = 60

type LoggingState = 'dormant' | 'active' | 'logged'

/**
 * Returns the logging state for a medicine dose.
 * - 'logged'  : dose already taken today
 * - 'active'  : within the logging window (up to LOGGING_WINDOW_MINUTES before slot)
 * - 'dormant' : too early — window hasn't opened yet
 */
function getLoggingState(slotTime: string, isLogged: boolean): LoggingState {
  if (isLogged) return 'logged'

  const now = new Date()
  const [hStr, mStr] = slotTime.split(':')
  const slotDate = new Date()
  slotDate.setHours(parseInt(hStr, 10), parseInt(mStr, 10), 0, 0)

  // Window opens LOGGING_WINDOW_MINUTES before the scheduled dose time
  const windowOpenMs = slotDate.getTime() - LOGGING_WINDOW_MINUTES * 60 * 1000
  return now.getTime() >= windowOpenMs ? 'active' : 'dormant'
}

/** Formats "HH:MM" → "8:00 AM" / "1:00 PM" style */
function formatSlotTime(slotTime: string): string {
  const [hStr, mStr] = slotTime.split(':')
  const hour = parseInt(hStr, 10)
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const h12 = hour % 12 || 12
  return `${h12}:${mStr} ${ampm}`
}

interface MedCardProps {
  med: MedicineEntry
  slot: TimeSlot
  /** Resolved slot time in "HH:MM" 24h format, factoring in user's custom times */
  slotTime: string
  onLog: (entryId: number, slot: TimeSlot) => Promise<void>
  onImageClick: (url: string) => void
  onDelete: (entryId: number, slot: TimeSlot) => void
  onEdit: (med: MedicineEntry) => void
  onOpenInfo?: (name: string, dosage?: string) => void
}

import { motion, AnimatePresence } from 'framer-motion'

const cardVariants = {
  hidden: { opacity: 0, y: 15 },
  visible: { 
    opacity: 1, 
    y: 0, 
    transition: { type: 'spring' as const, stiffness: 280, damping: 23 } 
  },
  exit: { 
    opacity: 0, 
    scale: 0.95, 
    y: -8,
    transition: { duration: 0.18 } 
  }
}

// Swipe threshold in px to register a log gesture
const SWIPE_THRESHOLD = 60

// Keys for one-time hints stored in localStorage
const SWIPE_HINT_KEY = 'ds_swipe_hint_dismissed'

interface StreakData {
  streak_days: number
  today_pct: number
  missed_yesterday: Array<{ medicine_name: string; medicine_id: number; slot: string }>
}

function MedicineCard({ med, slot, slotTime, onLog, onImageClick, onDelete, onEdit, onOpenInfo }: MedCardProps) {
  const isLogged = med.today_logs?.includes(slot) ?? false
  const [loggingState, setLoggingState] = useState<LoggingState>(
    () => getLoggingState(slotTime, isLogged)
  )
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [holding, setHolding] = useState(false)
  const [progress, setProgress] = useState(0)
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  // Detect if user is on a touch device
  const [isTouchDevice] = useState(() => {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0
  })

  // Swipe hint: shown on first visit, auto-dismissed after first successful swipe
  const [showSwipeHint, setShowSwipeHint] = useState(() => {
    if (typeof window === 'undefined') return false
    return !localStorage.getItem(SWIPE_HINT_KEY)
  })

  // Re-evaluate the logging window every 30 seconds so the card updates
  // automatically when the window opens (e.g., at 12:00 for the 1pm dose)
  useEffect(() => {
    const tick = () => setLoggingState(getLoggingState(slotTime, isLogged))
    tick()
    const timer = setInterval(tick, 30_000)
    return () => clearInterval(timer)
  }, [slotTime, isLogged])

  const isDormant = loggingState === 'dormant'

  // ── Desktop hold-to-log (unchanged for non-touch) ────────────────────────
  const startHold = () => {
    if (loggingState !== 'active') return
    setHolding(true)
    setProgress(0)
    let p = 0
    progressTimer.current = setInterval(() => {
      p += 10
      setProgress(p)
      if (p >= 100) {
        clearInterval(progressTimer.current!)
      }
    }, 40)
    holdTimer.current = setTimeout(() => {
      onLog(med.id, slot)
      setHolding(false)
      setProgress(0)
    }, 400)
  }

  const cancelHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current)
    if (progressTimer.current) clearInterval(progressTimer.current)
    setHolding(false)
    setProgress(0)
  }

  // ── Swipe-to-log handler (touch devices) ─────────────────────────────────
  const handleSwipeDragEnd = (_: unknown, info: { offset: { x: number } }) => {
    if (loggingState !== 'active') return
    if (info.offset.x >= SWIPE_THRESHOLD) {
      // Dismiss the hint permanently on first successful swipe
      if (showSwipeHint) {
        setShowSwipeHint(false)
        localStorage.setItem(SWIPE_HINT_KEY, '1')
      }
      onLog(med.id, slot)
    }
  }

  const handleThumbClick = () => {
    if (med.pack_image_url) {
      onImageClick(getImageUrl(med.pack_image_url))
    }
  }

  // Build hold-log-bar label based on state
  let barLabel: React.ReactNode
  if (loggingState === 'logged') {
    barLabel = '✓ Dose logged'
  } else if (loggingState === 'dormant') {
    barLabel = (
      <>
        <Clock size={13} style={{ marginRight: 6, opacity: 0.7 }} aria-hidden="true" />
        Available at {formatSlotTime(slotTime)}
      </>
    )
  } else {
    barLabel = isTouchDevice ? (
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {showSwipeHint && (
          <motion.span
            animate={{ x: [0, 6, 0] }}
            transition={{ repeat: Infinity, duration: 1.2, ease: 'easeInOut' }}
            style={{ display: 'flex', alignItems: 'center', opacity: 0.65 }}
          >
            <ChevronRight size={15} />
            <ChevronRight size={15} style={{ marginLeft: -8 }} />
          </motion.span>
        )}
        Swipe to log dose
      </span>
    ) : 'Click to log dose'
  }

  // ── Touch: swipe-to-log via framer-motion drag ────────────────────────────
  // ── Desktop: hold/click via motion.button ────────────────────────────────
  const logBar = isTouchDevice ? (
    <motion.button
      drag={loggingState === 'active' ? 'x' : false}
      dragConstraints={{ left: 0, right: 100 }}
      dragElastic={0.15}
      onDragEnd={handleSwipeDragEnd}
      whileDrag={{ scale: 1.01 }}
      className={`hold-log-bar ${loggingState}`}
      style={
        loggingState === 'active'
          ? { cursor: 'grab', touchAction: 'pan-y' }
          : undefined
      }
      disabled={isDormant}
      aria-label={
        loggingState === 'logged'
          ? 'Dose already logged'
          : loggingState === 'dormant'
          ? `Not available yet. Opens at ${formatSlotTime(slotTime)}`
          : 'Swipe right to log dose'
      }
      id={`log-btn-${med.id}-${slot}`}
      type="button"
    >
      {barLabel}
    </motion.button>
  ) : (
    <motion.button
      whileTap={isDormant || loggingState === 'logged' ? undefined : { scale: 0.97 }}
      className={`hold-log-bar ${loggingState}`}
      onMouseDown={isDormant || loggingState === 'logged' ? undefined : startHold}
      onMouseUp={isDormant || loggingState === 'logged' ? undefined : cancelHold}
      onMouseLeave={isDormant || loggingState === 'logged' ? undefined : cancelHold}
      onClick={isDormant || loggingState === 'logged' ? undefined : () => onLog(med.id, slot)}
      style={
        holding && loggingState === 'active'
          ? {
              background: `linear-gradient(to right, var(--logged-color) ${progress}%, #dc2626 ${progress}%)`,
              color: 'white',
            }
          : undefined
      }
      disabled={isDormant}
      aria-label={
        loggingState === 'logged'
          ? 'Dose already logged'
          : loggingState === 'dormant'
          ? `Not available yet. Opens at ${formatSlotTime(slotTime)}`
          : 'Click to log dose'
      }
      id={`log-btn-${med.id}-${slot}`}
      type="button"
    >
      {barLabel}
    </motion.button>
  )

  return (
    <motion.div
      layout
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className={`medicine-card-v2 ${slot}${isDormant ? ' dormant-card' : ''}${loggingState === 'logged' ? ' logged-card' : ''}`}
    >
      {/* Top Section */}
      <div className="card-top">
        <div
          className="card-thumb"
          onClick={handleThumbClick}
          style={{ cursor: med.pack_image_url ? 'pointer' : 'default' }}
        >
          {med.pack_image_url ? (
            <img
              src={getImageUrl(med.pack_image_url)}
              alt={med.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 12 }}
              loading="lazy"
              decoding="async"
            />
          ) : (
            <Pill size={22} color={isDormant ? 'var(--text-muted)' : 'var(--text-muted)'} />
          )}
        </div>

        <div className="card-info">
          <div className="med-name" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <span>{med.name}</span>
            {med.scan_image_url && (
              <button
                className="view-rx-badge"
                onClick={() => onImageClick(med.scan_image_url || '')}
                title="View original prescription reference"
                type="button"
              >
                Rx
              </button>
            )}
            {onOpenInfo && (
              <button
                type="button"
                onClick={() => onOpenInfo(med.name, med.dosage || undefined)}
                style={{
                  background: 'rgba(45, 212, 191, 0.12)',
                  border: '1px solid rgba(45, 212, 191, 0.25)',
                  borderRadius: '50%',
                  width: 20,
                  height: 20,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--accent-teal, #2dd4bf)',
                  cursor: 'pointer',
                  padding: 0,
                  marginLeft: 2,
                }}
                title="AI Medicine Info"
                aria-label="AI Medicine Info"
              >
                <Info size={12} />
              </button>
            )}
          </div>

          <div className="med-meta">
            {med.dosage && <span>Dosage: {med.dosage}</span>}
            {med.dosage && med.days != null && <span className="meta-dot"></span>}
            {med.days != null && <span>Duration: {med.days} days</span>}
            {med.quantity != null && (
              <>
                <span className="meta-dot"></span>
                <span style={{
                  fontWeight: med.quantity <= 5 ? 700 : 500,
                  color: med.quantity <= 5 ? 'var(--danger-color, #dc2626)' : 'var(--accent-teal)'
                }}>
                  {med.quantity <= 5 ? `⚠️ ${med.quantity} left` : `💊 ${med.quantity} left`}
                </span>
              </>
            )}
          </div>

          {med.instructions && (
            <div className="med-instructions">{med.instructions}</div>
          )}
        </div>

        {/* Absolute Corner Actions */}
        <div className="card-actions-corner">
          <button
            className="action-btn-circle"
            onClick={() => onEdit(med)}
            aria-label="Edit medicine"
            type="button"
          >
            <Pencil size={14} />
          </button>

          <button
            className="action-btn-circle delete"
            onClick={() => onDelete(med.id, slot)}
            aria-label="Delete medicine"
            type="button"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Bottom Section */}
      <div className="card-bottom">
        {logBar}
      </div>
    </motion.div>
  )
}

export default function Cabinet() {
  const { user, activeMemberId, setActiveMemberId } = useAuth()
  const [members, setMembers] = useState<User[]>([])
  const [medicines, setMedicines] = useState<MedicineEntry[]>([])
  const [expiredMedicines, setExpiredMedicines] = useState<MedicineEntry[]>([])
  const [showExpired, setShowExpired] = useState(false)
  const [loading, setLoading] = useState(true)
  const [isFetching, setIsFetching] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [activeLightboxImage, setActiveLightboxImage] = useState<string | null>(null)
  const [editingMed, setEditingMed] = useState<MedicineEntry | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ entryId: number; slot: TimeSlot; name: string } | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [infoModalMed, setInfoModalMed] = useState<{ name: string; dosage?: string } | null>(null)
  const hasFetchedOnce = useRef(false)
  // Tracks in-flight log requests by "entryId-slot" key.
  // Prevents duplicate API calls when the user presses/holds rapidly
  // before the optimistic UI update has time to re-render the card.
  const loggingInFlight = useRef<Set<string>>(new Set())
  const [customTimes, setCustomTimes] = useState<Record<string, string>>({})

  // Streak & missed-dose state
  const [streak, setStreak] = useState<StreakData | null>(null)
  const [dismissedMissed, setDismissedMissed] = useState(false)
  
  // Floating HUD top bar states
  const [scrolled, setScrolled] = useState(false)
  const [safetySeverity, setSafetySeverity] = useState<'safe' | 'moderate' | 'severe' | null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const fetchCabinet = useCallback(async (userId: number, isBackground = false) => {
    if (!isBackground) {
      if (!hasFetchedOnce.current) {
        setLoading(true)
      } else {
        setIsFetching(true)
      }
    }
    try {
      const tzOffset = new Date().getTimezoneOffset()
      const localDate = new Date().toLocaleDateString('sv-SE')
      const res = await api.get(
        `/medicine/cabinet?user_id=${userId}&tz_offset=${tzOffset}&local_date=${localDate}`
      )
      setMedicines(res.data.medicines || [])
      setExpiredMedicines(res.data.expired_medicines || [])
      hasFetchedOnce.current = true

      // Sync active schedules to the Service Worker in the background
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        api.get('/notifications/settings').then((settingsRes) => {
          navigator.serviceWorker.controller?.postMessage({
            type: 'SYNC_SCHEDULES',
            payload: {
              slots: settingsRes.data.slots || [],
              times: settingsRes.data.times || {},
              medicines: res.data.medicines || [],
            }
          })
        }).catch((e) => { if (import.meta.env.DEV) console.warn('[Cabinet] SW sync failed:', e) })
      }
    } catch (e) {
      if (import.meta.env.DEV) console.error('[Cabinet] fetch error:', e)
      showToast('Failed to load cabinet')
    } finally {
      setLoading(false)
      setIsFetching(false)
    }
  }, [])

  // On mount: fetch everything in parallel for speed
  useEffect(() => {
    if (!user?.id) return
    const init = async () => {
      const [membersRes, settingsRes] = await Promise.allSettled([
        api.get('/family/members'),
        api.get('/notifications/settings'),
      ])
      if (membersRes.status === 'fulfilled') setMembers(membersRes.value.data.members || [])
      if (settingsRes.status === 'fulfilled') {
        setCustomTimes(settingsRes.value.data.times || {})
      }
    }
    init()
  }, [user])
  useEffect(() => {
    const id = activeMemberId || user?.id
    if (id) {
      fetchCabinet(id)
      // Fetch streak data in parallel — non-blocking, best-effort
      const tzOffset = new Date().getTimezoneOffset()
      api.get(`/medicine/streak?user_id=${id}&tz_offset=${tzOffset}`)
        .then((res) => setStreak(res.data))
        .catch(() => { /* streak is cosmetic — swallow errors */ })
    }
  }, [activeMemberId, user?.id, fetchCabinet])

  // Auto-scroll to closest active time slot containing medicines on load
  useEffect(() => {
    if (loading || medicines.length === 0) return

    const timer = setTimeout(() => {
      const currentHour = new Date().getHours()
      let closestSlot: TimeSlot = 'morning'
      
      if (currentHour >= 12 && currentHour < 16) closestSlot = 'afternoon'
      else if (currentHour >= 16 && currentHour < 20) closestSlot = 'evening'
      else if (currentHour >= 20 || currentHour < 6) closestSlot = 'night'
      
      const order: TimeSlot[] = ['morning', 'afternoon', 'evening', 'night']
      const startIndex = order.indexOf(closestSlot)
      let targetSlot: TimeSlot | null = null
      
      // Look for the closest slot in time that actually has medicines to display
      for (let i = 0; i < 4; i++) {
        const checkSlot = order[(startIndex + i) % 4]
        if (medicines.some((m) => m.schedule.includes(checkSlot))) {
          targetSlot = checkSlot
          break
        }
      }
      
      if (targetSlot) {
        const el = document.getElementById(`slot-section-${targetSlot}`)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      }
    }, 450) // Settle render layout first

    return () => clearTimeout(timer)
  }, [loading, medicines])

  // Monitor scrolling position to display sticky HUD
  useEffect(() => {
    let container: Element | null = null

    const handleScroll = () => {
      if (container) {
        setScrolled(container.scrollTop > 180)
      }
    }
    
    const bindScroll = () => {
      container = document.querySelector('.page-content')
      if (container) {
        container.addEventListener('scroll', handleScroll, { passive: true })
      }
    }

    bindScroll()
    const t = setTimeout(bindScroll, 800)

    return () => {
      clearTimeout(t)
      if (container) {
        container.removeEventListener('scroll', handleScroll)
      }
    }
  }, [])

  const handleLog = async (entryId: number, slot: TimeSlot) => {
    const key = `${entryId}-${slot}`

    // Guard 1: request already in-flight for this (medicine, slot) pair
    if (loggingInFlight.current.has(key)) return

    // Guard 2: already marked as logged in local state — no-op
    const med = medicines.find((m) => m.id === entryId)
    if (med?.today_logs?.includes(slot)) return

    loggingInFlight.current.add(key)

    // ── Optimistic update ─────────────────────────────────────────────────
    // Flip the card to "logged" state IMMEDIATELY so the UI feels instant
    // even across a 500ms+ network round-trip. We deduplicate the slot list
    // with Set so a concurrent state update can never create duplicates.
    setMedicines((prev) =>
      prev.map((m) =>
        m.id === entryId
          ? {
              ...m,
              today_logs: [...new Set([...(m.today_logs || []), slot])],
              quantity: m.quantity != null && m.quantity > 0 ? m.quantity - 1 : m.quantity
            }
          : m
      )
    )
    showToast('✓ Dose logged!')

    // ── Confetti micro-celebration ─────────────────────────────────────────
    // Dynamically imported so it doesn't block the initial bundle.
    // Fires a small, fast burst from the bottom-centre — feels satisfying
    // without being distracting.
    import('canvas-confetti').then((mod) => {
      const confetti = mod.default
      confetti({
        particleCount: 45,
        spread: 55,
        startVelocity: 28,
        decay: 0.88,
        scalar: 0.85,
        origin: { x: 0.5, y: 0.85 },
        colors: ['#0d9488', '#14b8a6', '#5eead4', '#ffffff', '#a7f3d0'],
      })
    }).catch(() => { /* non-critical — ignore if blocked */ })
    // ─────────────────────────────────────────────────────────────────────

    try {
      await api.post('/medicine/log', { entry_id: entryId, time_slot: slot })
      // 200 = already logged (idempotent), 201 = freshly created — both are success.
      // The optimistic update is already correct; nothing else to do.

      // Refresh streak silently after logging — streak counter should update
      const id = activeMemberId || user?.id
      if (id) {
        const tzOffset = new Date().getTimezoneOffset()
        api.get(`/medicine/streak?user_id=${id}&tz_offset=${tzOffset}`)
          .then((res) => setStreak(res.data))
          .catch(() => {})
      }
    } catch {
      // Network / server error: roll back the optimistic update
      setMedicines((prev) =>
        prev.map((m) =>
          m.id === entryId
            ? { ...m, today_logs: (m.today_logs || []).filter((s) => s !== slot) }
            : m
        )
      )
      showToast('Failed to log dose — try again')
    } finally {
      loggingInFlight.current.delete(key)
    }
  }

  const requestDeleteMed = (entryId: number, slot: TimeSlot) => {
    const med = medicines.find((m) => m.id === entryId)
    if (!med) return
    setDeleteTarget({ entryId, slot, name: med.name })
  }

  const handleDeleteMed = async () => {
    if (!deleteTarget) return
    const { entryId, slot } = deleteTarget
    const med = medicines.find((m) => m.id === entryId)
    if (!med) return
    setDeleteBusy(true)
    const updatedSchedule = med.schedule.filter((s) => s !== slot)
    try {
      if (updatedSchedule.length === 0) {
        await api.delete(`/medicine/delete/${entryId}`)
        showToast('Medicine deleted')
        setMedicines((prev) => prev.filter((m) => m.id !== entryId))
      } else {
        const formData = new FormData()
        formData.append('schedule', JSON.stringify(updatedSchedule))
        const res = await api.post(`/medicine/update/${entryId}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        if (res.data.medicine) {
          setMedicines((prev) => prev.map((m) => (m.id === entryId ? res.data.medicine : m)))
          showToast(`Removed from ${slot}`)
        }
      }
      setDeleteTarget(null)
    } catch {
      showToast(updatedSchedule.length === 0 ? 'Failed to delete medicine' : 'Failed to remove schedule')
    } finally {
      setDeleteBusy(false)
    }
  }

  const handleSelectMember = (id: number) => {
    setActiveMemberId(id)
  }

  const medicinesBySlot = (slot: TimeSlot) =>
    medicines.filter((m) => m.schedule.includes(slot))

  const totalDosesScheduled = medicines.reduce((acc, med) => acc + (med.schedule?.length || 0), 0)
  const totalDosesTaken = medicines.reduce(
    (acc, med) =>
      acc + [...new Set(med.today_logs || [])].filter((s) => med.schedule.includes(s)).length,
    0
  )
  const adherencePercent = totalDosesScheduled > 0 
    ? Math.round((totalDosesTaken / totalDosesScheduled) * 100)
    : 0

  return (
    <>
      <AppLayout
        familyMembers={members}
        activeMemberId={activeMemberId}
        onSelectMember={handleSelectMember}
      >
        {loading ? (
          <SkeletonRow count={3} />
        ) : medicines.length === 0 && expiredMedicines.length === 0 ? (
          <EmptyState
            icon={<Archive size={48} color="var(--text-muted)" />}
            title="Cabinet is empty"
            description="Tap + to scan a prescription or add medicines"
          />
        ) : (
          <div style={{ paddingBottom: 16, opacity: isFetching ? 0.65 : 1, transition: 'opacity 0.2s ease' }}>
            {scrolled && totalDosesScheduled > 0 && (
              <div 
                style={{
                  position: 'fixed',
                  bottom: 96, /* Raised to clear the center plus icon */
                  left: '50%',
                  transform: 'translateX(-50%)',
                  zIndex: 30,
                  display: 'flex',
                  justifyContent: 'center',
                  pointerEvents: 'none',
                  width: '100%',
                  maxWidth: 460,
                  padding: '0 16px',
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    document.querySelector('.page-content')?.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                  style={{
                    background: 'rgba(255, 255, 255, 0.85)',
                    backdropFilter: 'blur(16px) saturate(140%)',
                    WebkitBackdropFilter: 'blur(16px) saturate(140%)',
                    border: '1px solid rgba(13, 148, 136, 0.22)',
                    borderRadius: '999px',
                    padding: '10px 20px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 12,
                    boxShadow: '0 8px 32px rgba(13, 148, 136, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.6)',
                    pointerEvents: 'auto',
                    cursor: 'pointer',
                    outline: 'none',
                    transition: 'transform 0.15s ease',
                  }}
                  className="hover:scale-105 active:scale-95"
                >
                  {streak && streak.streak_days > 0 && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.76rem', color: '#ea580c', fontWeight: 700 }}>
                      <Flame size={13} />
                      {streak.streak_days}d
                    </span>
                  )}
                  {streak && streak.streak_days > 0 && (
                    <span style={{ width: 1.5, height: 12, backgroundColor: 'var(--border-subtle)' }} />
                  )}
                  <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    Adherence: <strong style={{ color: 'var(--accent-teal)' }}>{adherencePercent}%</strong>
                  </span>
                  <span style={{ width: 1.5, height: 12, backgroundColor: 'var(--border-subtle)' }} />
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.76rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    Cabinet Safety:
                    <span 
                      style={{ 
                        width: 8, 
                        height: 8, 
                        borderRadius: '50%', 
                        backgroundColor: 
                          safetySeverity === 'severe' ? 'var(--danger-color, #dc2626)' 
                          : safetySeverity === 'moderate' ? '#ea580c' 
                          : '#16a34a',
                        display: 'inline-block'
                      }} 
                    />
                  </span>
                </button>
              </div>
            )}

            {/* ── Streak Banner ─────────────────────────────────────────────── */}
            {streak && streak.streak_days > 0 && (
              <AnimatePresence>
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 24 }}
                  style={{
                    margin: '12px 16px 0',
                    padding: '12px 16px',
                    borderRadius: 'var(--radius-lg)',
                    background: 'linear-gradient(135deg, rgba(234, 88, 12, 0.08) 0%, rgba(251, 146, 60, 0.06) 100%)',
                    border: '1px solid rgba(234, 88, 12, 0.18)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <motion.span
                    animate={{ scale: [1, 1.18, 1] }}
                    transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
                    style={{ fontSize: 22, lineHeight: 1 }}
                  >
                    🔥
                  </motion.span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 'var(--text-sm)', color: '#ea580c' }}>
                      {streak.streak_days}-day streak!
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: 1 }}>
                      {streak.today_pct === 100
                        ? 'All doses taken today — keep it up!'
                        : `${streak.today_pct}% adherence today`}
                    </div>
                  </div>
                  <Flame size={16} color="#ea580c" aria-hidden="true" />
                </motion.div>
              </AnimatePresence>
            )}

            {/* ── Missed Dose Banner (yesterday) ────────────────────────────── */}
            {streak && streak.missed_yesterday.length > 0 && !dismissedMissed && (
              <AnimatePresence>
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.22 }}
                  style={{
                    margin: '8px 16px 0',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(220, 38, 38, 0.06)',
                    border: '1px solid rgba(220, 38, 38, 0.18)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                  }}
                >
                  <span style={{ fontSize: 16, lineHeight: '20px' }}>⚠️</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--danger-color, #dc2626)' }}>
                      Missed yesterday
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.4 }}>
                      {streak.missed_yesterday.slice(0, 2).map((m, i) => (
                        <span key={i}>
                          {i > 0 && ', '}
                          {m.medicine_name} ({m.slot})
                        </span>
                      ))}
                      {streak.missed_yesterday.length > 2 && ` +${streak.missed_yesterday.length - 2} more`}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDismissedMissed(true)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, lineHeight: 1 }}
                    aria-label="Dismiss missed dose alert"
                  >
                    <X size={14} />
                  </button>
                </motion.div>
              </AnimatePresence>
            )}

            {totalDosesScheduled > 0 ? (
              <div className="adherence-dashboard-card">
                <div className="adherence-info">
                  <div className="adherence-text-sec">
                    <span className="adherence-score-title">Today&apos;s Adherence</span>
                    <span className="adherence-score-val">{adherencePercent}%</span>
                  </div>
                  <span className="adherence-fraction">
                    {totalDosesTaken} of {totalDosesScheduled} taken
                  </span>
                </div>
                <div className="adherence-progress-track">
                  <div 
                    className="adherence-progress-bar" 
                    style={{ width: `${adherencePercent}%` }} 
                  />
                </div>
              </div>
            ) : null}

            <InteractionCheckerCard 
              userId={activeMemberId} 
              refreshTrigger={medicines.length} 
              onSeverityResolved={setSafetySeverity}
            />

            <div className="cabinet-hero">
              <div className="cabinet-hero-text">
                <span className="cabinet-hero-greeting">
                  {(() => {
                    const h = new Date().getHours()
                    if (h < 12) return 'Good Morning'
                    if (h < 17) return 'Good Afternoon'
                    if (h < 21) return 'Good Evening'
                    return 'Good Night'
                  })()}
                </span>
                <span className="cabinet-hero-title">Today&apos;s schedule</span>
              </div>
              <span className="cabinet-hero-date">
                {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
              </span>
            </div>

            {medicines.length === 0 && (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                <Pill size={36} color="var(--text-muted)" style={{ margin: '0 auto 12px', display: 'block', opacity: 0.6 }} />
                <p style={{ fontWeight: 600, margin: 0, fontSize: 'var(--text-sm)' }}>No active medicines today</p>
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4 }}>
                  All your active medicines will show up here.
                </p>
              </div>
            )}

            {TIME_SLOTS.map(({ key, label, time }) => {
              const meds = medicinesBySlot(key)
              if (meds.length === 0) return null

              const customTime = customTimes[key]
              let timeDisplay = time
              if (customTime) {
                try {
                  const [hStr, mStr] = customTime.split(':')
                  const hour = parseInt(hStr, 10)
                  const ampm = hour >= 12 ? 'PM' : 'AM'
                  const displayHour = hour % 12 || 12
                  timeDisplay = `${displayHour}:${mStr} ${ampm}`
                } catch {
                  timeDisplay = customTime
                }
              }

              return (
                <div key={key} id={`slot-section-${key}`}>
                  <div className={`time-band-header ${key}`}>
                    <div className="time-band-header-content">
                      <div className="time-band-title-wrap">
                        {key === 'morning' && <Sunrise size={16} className="slot-icon morning" aria-hidden="true" />}
                        {key === 'afternoon' && <Sun size={16} className="slot-icon afternoon" aria-hidden="true" />}
                        {key === 'evening' && <Sunset size={16} className="slot-icon evening" aria-hidden="true" />}
                        {key === 'night' && <Moon size={16} className="slot-icon night" aria-hidden="true" />}
                        <span className="slot-label-text">{label}</span>
                        <span className="slot-time-pill">{timeDisplay}</span>
                      </div>
                      <span className="slot-count-badge">
                        {meds.length} {meds.length === 1 ? 'medicine' : 'medicines'}
                      </span>
                    </div>
                  </div>
                  <AnimatePresence initial={false}>
                    {meds.map((med) => (
                      <MedicineCard
                        key={med.id}
                        med={med}
                        slot={key}
                        slotTime={customTimes[key] || DEFAULT_SLOT_TIMES[key]}
                        onLog={handleLog}
                        onImageClick={setActiveLightboxImage}
                        onDelete={requestDeleteMed}
                        onEdit={setEditingMed}
                        onOpenInfo={(name, dosage) => setInfoModalMed({ name, dosage })}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )
            })}

            {expiredMedicines.length > 0 && (
              <div style={{ marginTop: 24, borderTop: '1px solid var(--border-subtle)', paddingTop: 16 }}>
                <button
                  type="button"
                  onClick={() => setShowExpired(!showExpired)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    background: 'none',
                    border: 'none',
                    padding: '8px 16px',
                    cursor: 'pointer',
                    color: 'var(--text-secondary)',
                    fontWeight: 600,
                    fontSize: 'var(--text-sm)'
                  }}
                >
                  <span>Past / Expired Medicines ({expiredMedicines.length})</span>
                  <span style={{ fontSize: 'var(--text-xs)', transform: showExpired ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}>▼</span>
                </button>

                {showExpired && (
                  <div style={{ padding: '8px 16px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {expiredMedicines.map((med) => (
                      <div 
                        key={med.id} 
                        style={{ 
                          padding: 12, 
                          background: 'var(--bg-secondary)', 
                          border: '1px solid var(--border-subtle)', 
                          borderRadius: 'var(--radius-md)',
                          opacity: 0.75,
                          position: 'relative'
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
                          {med.name}
                        </div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 4, display: 'flex', gap: 12 }}>
                          {med.dosage && <span>Dosage: {med.dosage}</span>}
                          {med.days != null && <span>Duration: {med.days} days (Expired)</span>}
                        </div>
                        
                        <div style={{ position: 'absolute', right: 12, top: 12, display: 'flex', gap: 12 }}>
                          <button
                            type="button"
                            onClick={() => setEditingMed(med)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}
                            title="Edit"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => requestDeleteMed(med.id, med.schedule[0] || 'morning')}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger-color)', padding: 0 }}
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </AppLayout>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => !deleteBusy && setDeleteTarget(null)}
        onConfirm={handleDeleteMed}
        title="Remove this medicine?"
        description={
          deleteTarget
            ? `Remove “${deleteTarget.name}” from the ${deleteTarget.slot} schedule. If it has no other times, it will be deleted from the cabinet.`
            : ''
        }
        confirmLabel="Remove"
        cancelLabel="Keep"
        destructive
        busy={deleteBusy}
        titleId="delete-med-title"
      />

      {/* Image Lightbox Modal */}
      {activeLightboxImage && (
        <div className="lightbox-overlay" onClick={() => setActiveLightboxImage(null)}>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <img src={getImageUrl(activeLightboxImage)} alt="Fullscreen Medicine" className="lightbox-image" />
            <button
              className="lightbox-close"
              onClick={() => setActiveLightboxImage(null)}
              aria-label="Close fullscreen view"
              type="button"
            >
              <X size={24} />
            </button>
          </div>
        </div>
      )}

      {/* Edit Medicine Modal */}
      {editingMed && (
        <EditMedicineModal
          med={editingMed}
          onClose={() => setEditingMed(null)}
          onSave={(updated) => {
            setMedicines((prev) => prev.map((m) => (m.id === updated.id ? { ...updated, today_logs: m.today_logs } : m)))
            setEditingMed(null)
            showToast('✓ Medicine details updated')
          }}
        />
      )}

      {/* AI Medicine Info Modal */}
      <MedicineInfoModal
        isOpen={!!infoModalMed}
        onClose={() => setInfoModalMed(null)}
        medicineName={infoModalMed?.name || ''}
        dosage={infoModalMed?.dosage}
      />

      {toast && <Toast message={toast} type="success" />}
    </>
  )
}
