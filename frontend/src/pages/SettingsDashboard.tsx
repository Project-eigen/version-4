import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import AppLayout from '../components/AppLayout'
import ConfirmDialog from '../components/ConfirmDialog'
import Modal from '../components/Modal'
import Accordion from '../components/Accordion'
import Toast from '../components/Toast'
import api from '../api/client'
import { Bell, RefreshCw, LogOut, Info } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────
type TimeSlotKey = 'morning' | 'afternoon' | 'evening' | 'night'
type SectionKey = 'profile' | 'alerts'

interface PushDevice {
  endpoint: string
  current_device: boolean
}

interface NotifSettings {
  telegram_linked: boolean
  push_enabled: boolean
  push_enabled_current_device: boolean
  push_device_count: number
  push_devices: PushDevice[]
  slots: TimeSlotKey[]
  times: Record<TimeSlotKey, string>
  timezone_name: string | null
}

const ALL_SLOTS: { key: TimeSlotKey; label: string }[] = [
  { key: 'morning',   label: 'Morning' },
  { key: 'afternoon', label: 'Afternoon' },
  { key: 'evening',   label: 'Evening' },
  { key: 'night',     label: 'Night' },
]

function buildTimezoneOptions(): { value: string; label: string }[] {
  const now = new Date()
  try {
    const names: string[] = Intl.supportedValuesOf('timeZone')
    return names.map((tz) => {
      const formatter = new Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName: 'shortOffset' })
      const offset = formatter.formatToParts(now).find((p) => p.type === 'timeZoneName')?.value || ''
      return { value: tz, label: `${tz} (${offset})` }
    })
  } catch {
    return [{ value: 'UTC', label: 'UTC (GMT+0:00)' }]
  }
}

const TIMEZONES = buildTimezoneOptions()

// ── Helpers ───────────────────────────────────────────────────────────────────
async function urlBase64ToUint8Array(base64String: string): Promise<Uint8Array> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

export default function SettingsDashboard() {
  const { user, logout, activeMemberId } = useAuth()

  // Unified loading and fetch status
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

  // Sections toggle — both open by default (product settings, not ops health)
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    profile: true,
    alerts: true,
  })

  // 1. Notification & Timezone State
  const [settings, setSettings] = useState<NotifSettings | null>(null)
  const [pushLoading, setPushLoading] = useState(false)
  const [testLoading, setTestLoading] = useState(false)
  const [currentEndpoint, setCurrentEndpoint] = useState<string | null>(null)
  const [subReady, setSubReady] = useState(false)

  // Timezone dynamic clock preview
  const [selectedTz, setSelectedTz] = useState('Asia/Kolkata')
  const timezoneOptions = TIMEZONES
  const [tzPreviewTime, setTzPreviewTime] = useState('')

  // Telegram states
  const [tgModal, setTgModal] = useState(false)
  const [tgCode, setTgCode] = useState('')
  const [tgBotUsername, setTgBotUsername] = useState('DawaiSathiBot')
  const [tgPolling, setTgPolling] = useState(false)
  const [tgCopied, setTgCopied] = useState(false)
  const [tgLinked, setTgLinked] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollCountRef = useRef(0)

  // Time slots states
  const [editTimes, setEditTimes] = useState<Record<TimeSlotKey, string>>({
    morning: '08:00', afternoon: '13:00', evening: '18:00', night: '22:00',
  })
  const [activeSlots, setActiveSlots] = useState<TimeSlotKey[]>([])
  const [settingsDirty, setSettingsDirty] = useState(false)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [unlinkConfirmOpen, setUnlinkConfirmOpen] = useState(false)
  const [unlinkBusy, setUnlinkBusy] = useState(false)

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const toggleSection = (key: SectionKey) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  // ── Load & Synchronize data on mount ─────────────────────────────────────────
  useEffect(() => {
    ;(async () => {
      if ('serviceWorker' in navigator && 'PushManager' in window) {
        try {
          const reg = await navigator.serviceWorker.getRegistration()
          if (reg) {
            const sub = await reg.pushManager.getSubscription()
            setCurrentEndpoint(sub ? sub.endpoint : null)
          }
        } catch (err) {
          if (import.meta.env.DEV) console.warn('[Dashboard] SW registration query failed:', err)
        }
      }
      setSubReady(true)
    })()
  }, [])

  const fetchData = useCallback(async () => {
    if (!subReady) return
    try {
      const url = currentEndpoint
        ? `/notifications/settings?endpoint=${encodeURIComponent(currentEndpoint)}`
        : '/notifications/settings'

      const settingsRes = await api.get(url)
      const sData = settingsRes.data
      setSettings(sData)
      setEditTimes(sData.times || { morning: '08:00', afternoon: '13:00', evening: '18:00', night: '22:00' })
      setActiveSlots(Array.isArray(sData.slots) ? sData.slots : [])
      setSelectedTz(
        sData.timezone_name ||
          Intl.DateTimeFormat().resolvedOptions().timeZone ||
          'UTC',
      )

    } catch (err) {
      if (import.meta.env.DEV) console.error('[Dashboard] Failed to fetch settings:', err)
      showToast('Failed to load settings', 'error')
    } finally {
      setLoading(false)
    }
  }, [currentEndpoint, subReady])

  useEffect(() => {
    fetchData()
  }, [user, fetchData])

  // Timezone preview clock updater
  useEffect(() => {
    const updateTime = () => {
      const options: Intl.DateTimeFormatOptions = {
        timeStyle: 'short',
        timeZone: selectedTz,
      }
      try {
        const timeStr = new Intl.DateTimeFormat('en-US', options).format(new Date())
        setTzPreviewTime(timeStr)
      } catch {
        setTzPreviewTime(new Date().toLocaleTimeString())
      }
    }
    updateTime()
    const timer = setInterval(updateTime, 30000)
    return () => clearInterval(timer)
  }, [selectedTz])

  // ── Timezone & Reminders Slots Mutation ──────────────────────────────────────────
  const handleSlotToggle = (slot: TimeSlotKey) => {
    setActiveSlots((prev) =>
      prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot]
    )
    setSettingsDirty(true)
  }

  const handleTimeChange = (slot: TimeSlotKey, value: string) => {
    setEditTimes((prev) => ({ ...prev, [slot]: value }))
    setSettingsDirty(true)
  }

  const handleTzChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedTz(e.target.value)
    setSettingsDirty(true)
  }

  const handleSaveSettings = async () => {
    setSettingsSaving(true)
    try {
      await api.post('/notifications/settings', {
        slots: activeSlots,
        times: editTimes,
        timezone_name: selectedTz,
      })
      
      // Update local settings state reference
      if (settings) {
        setSettings({
          ...settings,
          slots: activeSlots,
          times: editTimes,
          timezone_name: selectedTz,
        })
      }
      setSettingsDirty(false)
      showToast('✓ Preferences saved successfully', 'success')
    } catch {
      showToast('Failed to save preferences', 'error')
    } finally {
      setSettingsSaving(false)
    }
  }

  // ── Telegram Linking polling flows ────────────────────────────────────────────
  const startPolling = (code: string) => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollCountRef.current = 0
    setTgPolling(true)

    pollRef.current = setInterval(async () => {
      pollCountRef.current += 1
      if (pollCountRef.current > 60) { // Timeout after 5 minutes (60 * 5s)
        stopPolling()
        showToast('Linking code expired. Please generate a new one.', 'error')
        return
      }
      try {
        const res = await api.get(`/notifications/telegram/status?code=${code}`)
        if (res.data.linked) {
          stopPolling()
          setTgLinked(true)
          if (settings) setSettings({ ...settings, telegram_linked: true })
          showToast('✓ Telegram linked successfully!', 'success')
        }
      } catch {
        stopPolling()
        showToast('Telegram link check failed', 'error')
      }
    }, 5000)
  }

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    setTgPolling(false)
  }

  const handleGenerateTelegramCode = async () => {
    try {
      const res = await api.get('/notifications/telegram/code')
      setTgCode(res.data.code)
      if (res.data.bot_username) setTgBotUsername(res.data.bot_username)
      setTgLinked(false)
      setTgCopied(false)
      setTgModal(true)
      startPolling(res.data.code)
    } catch {
      showToast('Failed to generate code', 'error')
    }
  }

  const handleUnlinkTelegram = async () => {
    setUnlinkBusy(true)
    try {
      await api.post('/notifications/telegram/unlink')
      if (settings) setSettings({ ...settings, telegram_linked: false })
      showToast('Telegram unlinked', 'success')
      setUnlinkConfirmOpen(false)
    } catch {
      showToast('Failed to unlink Telegram', 'error')
    } finally {
      setUnlinkBusy(false)
    }
  }

  const handleCopyCode = () => {
    navigator.clipboard.writeText(tgCode)
    setTgCopied(true)
    setTimeout(() => setTgCopied(false), 2000)
  }

  // ── Web Push Flow ────────────────────────────────────────────────────────────
  const handleTogglePush = async () => {
    if (pushLoading) return
    setPushLoading(true)
    try {
      const registration = await navigator.serviceWorker.ready
      const isEnabled = settings?.push_enabled_current_device

      if (isEnabled) {
        // Disable on current device
        const subscription = await registration.pushManager.getSubscription()
        if (subscription) {
          await subscription.unsubscribe()
          await api.post('/notifications/push/unsubscribe', { endpoint: subscription.endpoint })
        }
        showToast('Push alerts disabled on this device', 'success')
      } else {
        // Enable on current device
        const permission = await Notification.requestPermission()
        if (permission !== 'granted') {
          showToast('Notification permission denied', 'error')
          setPushLoading(false)
          return
        }

        const vapidRes = await api.get('/notifications/push/vapid-key')
        const convertedKey = await urlBase64ToUint8Array(vapidRes.data.public_key)

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedKey as any,
        })

        await api.post('/notifications/push/subscribe', { subscription: subscription.toJSON ? subscription.toJSON() : subscription })
        setCurrentEndpoint(subscription.endpoint)
        showToast('✓ Push alerts enabled on this device', 'success')
      }
      // Reload setting state variables
      await fetchData()
    } catch (err: any) {
      showToast(err.message || 'Push registration failed', 'error')
    } finally {
      setPushLoading(false)
    }
  }

  const handleSendTestPush = async () => {
    if (testLoading) return
    setTestLoading(true)
    try {
      if (!currentEndpoint) { showToast('No push subscription found', 'error'); setTestLoading(false); return }
      await api.post('/notifications/push/test', { endpoint: currentEndpoint })
      showToast('✓ Test alert sent!', 'success')
    } catch (err: any) {
      showToast(err.response?.data?.error || 'Failed to send test push', 'error')
    } finally {
      setTestLoading(false)
    }
  }

  return (
    <>
      <AppLayout familyMembers={[]} activeMemberId={activeMemberId} onSelectMember={() => {}}>
        {loading ? (
          <div className="loading-overlay">
            <div className="loading-spinner" />
          </div>
        ) : (
          <div className="stack-page">
            <Accordion
              id="settings-profile"
              title="Profile & account"
              open={openSections.profile}
              onToggle={() => toggleSection('profile')}
              leading={
                <span className="avatar-initial" aria-hidden="true">
                  {user?.name.charAt(0).toUpperCase()}
                </span>
              }
            >
              <div className="profile-row">
                <div>
                  <div className="profile-name">{user?.name}</div>
                  <div className="profile-email">{user?.email}</div>
                </div>
                <button type="button" onClick={logout} className="btn-danger-subtle">
                  <LogOut size={13} aria-hidden="true" />
                  Logout
                </button>
              </div>
            </Accordion>

            <Accordion
              id="settings-alerts"
              title="Reminder preferences"
              open={openSections.alerts}
              onToggle={() => toggleSection('alerts')}
              icon={<Bell size={18} color="var(--accent-teal)" aria-hidden="true" />}
            >
              <div className="form-block">
                <label className="form-label" htmlFor="settings-tz">Timezone</label>
                <select id="settings-tz" className="form-select" value={selectedTz} onChange={handleTzChange}>
                  {timezoneOptions.map((tz) => (
                    <option key={tz.value} value={tz.value}>{tz.label}</option>
                  ))}
                </select>
                <div className="info-callout">
                  <Info size={14} aria-hidden="true" />
                  <span>
                    Reminders use <strong>{selectedTz}</strong>. Local time there is{' '}
                    <strong className="tabular-nums">{tzPreviewTime}</strong>.
                  </span>
                </div>
              </div>

              <hr className="divider" />

              <div className="form-block">
                <div className="form-label">Reminder slots and times</div>
                {ALL_SLOTS.map((slot) => {
                  const isChecked = activeSlots.includes(slot.key)
                  return (
                    <div key={slot.key} className="slot-row">
                      <label className="slot-row-left">
                        <input
                          type="checkbox"
                          className="slot-check"
                          checked={isChecked}
                          onChange={() => handleSlotToggle(slot.key)}
                        />
                        <span className="slot-label">{slot.label}</span>
                      </label>
                      <input
                        type="time"
                        className="form-time"
                        value={editTimes[slot.key] || '08:00'}
                        onChange={(e) => handleTimeChange(slot.key, e.target.value)}
                        aria-label={`${slot.label} time`}
                      />
                    </div>
                  )
                })}
              </div>

              {settingsDirty && (
                <button type="button" onClick={handleSaveSettings} disabled={settingsSaving} className="btn-primary">
                  {settingsSaving ? 'Saving…' : 'Save reminder settings'}
                </button>
              )}

              <hr className="divider" />

              <div className="setting-row">
                <div>
                  <div className="setting-row-title">Web push alerts</div>
                  <div className="setting-row-desc">Browser notifications on this device</div>
                </div>
                <button
                  type="button"
                  onClick={handleTogglePush}
                  disabled={pushLoading}
                  className={`${settings?.push_enabled_current_device ? 'btn-ghost' : 'btn-primary'} btn-compact`}
                >
                  {pushLoading ? '…' : settings?.push_enabled_current_device ? 'Disable' : 'Enable'}
                </button>
              </div>
              {settings?.push_enabled_current_device && (
                <button type="button" onClick={handleSendTestPush} disabled={testLoading} className="btn-ghost btn-linkish">
                  {testLoading ? 'Sending…' : 'Send test notification'}
                </button>
              )}

              <div className="setting-row">
                <div>
                  <div className="setting-row-title">Telegram alerts</div>
                  <div className="setting-row-desc">Reminders in your Telegram chat</div>
                </div>
                <button
                  type="button"
                  onClick={settings?.telegram_linked ? () => setUnlinkConfirmOpen(true) : handleGenerateTelegramCode}
                  className={`${settings?.telegram_linked ? 'btn-ghost' : 'btn-primary'} btn-compact`}
                >
                  {settings?.telegram_linked ? 'Unlink' : 'Link bot'}
                </button>
              </div>
            </Accordion>
          </div>
        )}
      </AppLayout>

      {toast && <Toast message={toast.msg} type={toast.type} />}

      <Modal
        open={tgModal}
        onClose={() => { stopPolling(); setTgModal(false); setTgLinked(false) }}
        title="Link Telegram"
        titleId="tg-link-title"
        variant="center"
        className="tg-dialog"
      >
        <p className="tg-subtitle">
          Send this code to{' '}
          <a href={`https://t.me/${tgBotUsername}`} target="_blank" rel="noopener noreferrer">@{tgBotUsername}</a>
        </p>
        <div className="tg-code-box" aria-label={`Link code ${tgCode}`}>
          {tgCode.split('').map((digit, i) => (
            <span key={i} className={`tg-code-digit ${tgCopied || tgLinked ? 'filled' : ''}`}>{digit}</span>
          ))}
        </div>
        <div className="tg-action-row">
          <button className={`tg-btn tg-btn-copy ${tgCopied ? 'copied' : ''}`} onClick={handleCopyCode} type="button" data-autofocus>
            {tgCopied ? 'Copied' : 'Copy code'}
          </button>
          <a className="tg-btn tg-btn-telegram" href={`https://t.me/${tgBotUsername}`} target="_blank" rel="noopener noreferrer">Open Telegram</a>
        </div>
        {tgPolling && !tgLinked && (
          <div className="tg-waiting-row" role="status">
            <RefreshCw size={12} className="spin" aria-hidden="true" /> Waiting for the bot… ({Math.max(0, 300 - pollCountRef.current * 5)}s)
          </div>
        )}
        {tgLinked && (
          <div className="tg-success-overlay">
            <div className="tg-success-check" aria-hidden="true">✓</div>
            <div className="tg-success-text">Linked successfully</div>
          </div>
        )}
        {!tgLinked && (
          <button className="tg-cancel-btn" onClick={() => { stopPolling(); setTgModal(false); setTgLinked(false) }} type="button">
            Cancel
          </button>
        )}
      </Modal>

      <ConfirmDialog
        open={unlinkConfirmOpen}
        onClose={() => !unlinkBusy && setUnlinkConfirmOpen(false)}
        onConfirm={handleUnlinkTelegram}
        title="Unlink Telegram?"
        description="You will stop receiving medicine reminders on Telegram until you link the bot again."
        confirmLabel="Unlink"
        cancelLabel="Keep linked"
        destructive
        busy={unlinkBusy}
        titleId="unlink-tg-title"
      />
    </>
  )
}
